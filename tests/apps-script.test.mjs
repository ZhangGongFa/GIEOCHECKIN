import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createHmac, randomUUID } from 'node:crypto';

const source = readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');
const secret = 'test-secret-with-at-least-thirty-two-characters';
const headers = ['Họ và tên', 'MSSV', 'Thời gian check-in', 'Đăng ký trước', 'Mã yêu cầu'];
function harness(registrations = [['Sinh viên mẫu', '', "‘030238220186"]]) {
  let locked = false, lockAvailable = true, writeCount = 0, flushCount = 0;
  const state = { registrations, checked: [], headers: [...headers] };
  const range = (r, c, rows = 1, cols = 1, registration = false) => ({
    getValues() {
      if (registration) return state.registrations;
      if (r === 1) return [state.headers];
      return state.checked.slice(r - 2, r - 2 + rows).map(row => row.slice(c - 1, c - 1 + cols));
    },
    getDisplayValues() { return this.getValues().map(row => row.map(x => String(x ?? ''))); },
    setValues(values) {
      assert.equal(locked, true, 'every write must hold script lock');
      if (r === 1) state.headers = values[0];
      else { writeCount++; values.forEach((row, i) => { state.checked[r - 2 + i] = row; }); }
      return this;
    },
    setNumberFormat(format) { assert.equal(locked, true); if (c === 1 || c === 5) assert.equal(format, '@'); return this; },
    setFontWeight() { return this; }, setBackground() { return this; }, setFontColor() { return this; }
  });
  const registeredSheet = { getLastRow: () => state.registrations.length + 1, getRange: (r, c, rows, cols) => range(r, c, rows, cols, true) };
  const checkinSheet = { getLastRow: () => state.checked.length + 1, getMaxRows: () => 1000, getRange: (r, c, rows, cols) => range(r, c, rows, cols), insertRowsAfter() {}, setFrozenRows() {}, setColumnWidth() {} };
  const ss = { getSheetByName: name => name === 'Câu trả lời biểu mẫu 1' ? registeredSheet : checkinSheet };
  const context = vm.createContext({ console, Date, JSON, Set, Number, Error,
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => secret }) },
    SpreadsheetApp: { openById: () => ss, flush() { assert.equal(locked, true); flushCount++; } },
    LockService: { getScriptLock: () => ({ tryLock() { if (!lockAvailable) return false; assert.equal(locked, false); locked = true; return true; }, waitLock() { locked = true; }, releaseLock() { locked = false; } }) },
    Utilities: { Charset: { UTF_8: 'utf8' }, base64EncodeWebSafe: value => Buffer.from(value).toString('base64url'), base64DecodeWebSafe: value => Buffer.from(value, 'base64url'), computeHmacSha256Signature: (value, key) => createHmac('sha256', key).update(value).digest(), newBlob: data => ({ getDataAsString: () => Buffer.from(data).toString('utf8') }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ text, setMimeType() { return this; } }) }
  });
  vm.runInContext(source, context);
  function request(body) { return JSON.parse(context.doPost({ postData: { contents: JSON.stringify({ secret, ...body }) } }).text); }
  const lookup = id => request({ action: 'lookup', studentId: id });
  function checkin(studentId, receipt, extra = {}) { return request({ action: 'checkin', studentId, confirmationToken: receipt.confirmationToken, requestId: randomUUID(), ...extra }); }
  return { context, state, request, lookup, checkin, get writes() { return writeCount; }, get flushes() { return flushCount; }, get locked() { return locked; }, set lockAvailable(value) { lockAvailable = value; } };
}

test('normalizes different apostrophes, invisible spaces, fullwidth digits and one missing leading zero', () => {
  const h = harness();
  for (const value of ["'030238220186", '‘030238220186', '’030238220186', 'ʼ030238220186', '`030238220186', '030 238 220 186', '\u200b030238220186', 30238220186, '30238220186', '０３０２３８２２０１８６']) assert.equal(h.context.normalizeSheetId_(value), '030238220186');
  for (const value of ['3023822018', '0302382201867', 'abc030238220186', '3.02382E+10', '130238220186', 3.5]) assert.equal(h.context.normalizeSheetId_(value), '');
});
test('scanner/request requires full 12 digits and does not silently repair scanned IDs', () => {
  const h = harness();
  for (const studentId of ['30238220186', 30238220186, "'030238220186", '0302382201867']) assert.equal(h.request({ action: 'lookup', studentId }).code, 'INVALID_ID');
});
test('lookup reads B name and D ID; confirmation ignores altered registered name', () => {
  const h = harness(); const receipt = h.lookup('030238220186');
  assert.equal(receipt.student.name, 'Sinh viên mẫu');
  const result = h.checkin('030238220186', receipt, { name: 'Tên bị sửa' });
  assert.equal(result.student.name, 'Sinh viên mẫu'); assert.equal(h.state.checked[0][1], '030238220186');
  assert.equal(h.flushes, 1); assert.equal(h.locked, false);
});
test('40 independently prepared confirmations for the same MSSV write exactly one row', async () => {
  const h = harness(); const receipts = Array.from({ length: 40 }, () => h.lookup('030238220186'));
  const results = await Promise.all(receipts.map(receipt => Promise.resolve().then(() => h.checkin('030238220186', receipt))));
  assert.equal(results.filter(x => x.status === 'checked_in').length, 1);
  assert.equal(results.filter(x => x.status === 'already_checked_in').length, 39);
  assert.equal(h.writes, 1); assert.equal(h.state.checked.length, 1);
});
test('lost response retry uses request ID to acknowledge the same write', () => {
  const h = harness(); const receipt = h.lookup('030238220186'); const requestId = randomUUID();
  h.checkin('030238220186', receipt, { requestId });
  const result = h.checkin('030238220186', receipt, { requestId });
  assert.equal(result.sameRequest, true); assert.equal(h.writes, 1);
});
test('unregistered student requires a name and safely escapes formula-like name', () => {
  const h = harness([]); const receipt = h.lookup('030238220186');
  assert.equal(receipt.status, 'unregistered');
  assert.equal(h.checkin('030238220186', receipt, { name: '' }).code, 'INVALID_NAME');
  const result = h.checkin('030238220186', receipt, { name: '=TEST()' });
  assert.equal(result.ok, true); assert.equal(h.state.checked[0][0], "'=TEST()"); assert.equal(h.state.checked[0][3], 'Không');
});
test('conflicting registration names require correction; equal names differing in case are accepted', () => {
  const h = harness([['Sinh viên A', '', '030238220186'], ['Sinh viên B', '', "'030238220186"]]);
  assert.equal(h.lookup('030238220186').code, 'REGISTRATION_CONFLICT'); assert.equal(h.writes, 0);
  h.state.registrations[1][0] = ' SINH VIÊN A ';
  assert.equal(h.lookup('030238220186').status, 'registered');
});
test('registration changed after lookup must be reconfirmed, including new registrations', () => {
  const h = harness([]); const receipt = h.lookup('030238220186');
  h.state.registrations.push(['Mới đăng ký', '', '030238220186']);
  assert.equal(h.checkin('030238220186', receipt, { name: 'Tên nhập' }).code, 'REGISTRATION_CHANGED'); assert.equal(h.writes, 0);
});
test('lock contention returns retryable busy without writing', () => {
  const h = harness(); const receipt = h.lookup('030238220186'); h.lockAvailable = false;
  assert.equal(h.checkin('030238220186', receipt).code, 'BUSY'); assert.equal(h.writes, 0);
});
test('tampered receipt, wrong secret and wrong ID cannot write', () => {
  const h = harness(); const receipt = h.lookup('030238220186');
  assert.equal(h.request({ action: 'health', secret: 'wrong' }).code, 'UNAUTHORIZED');
  assert.equal(h.checkin('030238220186', { confirmationToken: receipt.confirmationToken + 'x' }).code, 'INVALID_TOKEN');
  assert.equal(h.checkin('030238220187', receipt).code, 'INVALID_TOKEN'); assert.equal(h.writes, 0);
});
test('expired receipt cannot create a row but can reconcile a previously committed row', () => {
  const h = harness(); const receipt = h.lookup('030238220186'); const requestId = randomUUID();
  h.checkin('030238220186', receipt, { requestId });
  const old = h.context.makeToken_({ studentId: '030238220186', name: 'Sinh viên mẫu', registered: true }, secret);
  const [payload] = old.split('.'); const data = JSON.parse(Buffer.from(payload, 'base64url')); data.issuedAt = Date.now() - 3600000;
  const encoded = Buffer.from(JSON.stringify(data)).toString('base64url'); const token = encoded + '.' + h.context.sign_(encoded, secret);
  assert.equal(h.checkin('030238220186', { confirmationToken: token }, { requestId }).sameRequest, true);
  h.state.checked = [];
  assert.equal(h.checkin('030238220186', { confirmationToken: token }).code, 'TOKEN_EXPIRED');
});
test('unexpected check-in headers are rejected without overwriting data', () => {
  const h = harness(); h.state.headers[1] = 'Khác';
  assert.equal(h.lookup('030238220186').code, 'CONFIG_ERROR'); assert.equal(h.writes, 0);
});
