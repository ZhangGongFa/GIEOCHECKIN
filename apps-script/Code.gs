/** GIEO CLUB Check-in. Deploy ONE Apps Script project for this check-in tab. */
const CONFIG = Object.freeze({
  spreadsheetId: '1trguxqawK5ARHGiEItfexpKiQRsxN5q_s9p1spJEj0E',
  registrationSheet: 'Câu trả lời biểu mẫu 1',
  checkinSheet: 'Check-in GIEO',
  firstDataRow: 2,
  nameColumn: 2,
  idColumn: 4,
  tokenLifetimeMs: 15 * 60 * 1000,
  lockWaitMs: 15000
});
const CHECKIN_HEADERS = ['Họ và tên', 'MSSV', 'Thời gian check-in', 'Đăng ký trước', 'Mã yêu cầu'];

/** Run manually once after setting GIEO_API_SECRET in Script Properties. */
function setupCheckin() {
  requireSecret_();
  const lock = LockService.getScriptLock();
  lock.waitLock(CONFIG.lockWaitMs);
  try {
    const ss = SpreadsheetApp.openById(CONFIG.spreadsheetId);
    registrationSheet_(ss);
    const sheet = checkinSheet_(ss);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#fa8628').setFontColor('#281606');
    sheet.setColumnWidth(1, 260);
    sheet.setColumnWidth(2, 150);
    sheet.setColumnWidth(3, 190);
    sheet.setColumnWidth(4, 130);
    sheet.setColumnWidth(5, 300);
    SpreadsheetApp.flush();
    console.log('Đã chuẩn bị tab Check-in GIEO. Không thay đổi danh sách đăng ký.');
  } finally { lock.releaseLock(); }
}

function doGet() {
  return json_({ ok: true, service: 'GIEO CLUB Check-in', version: '1.0.0' });
}

function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents;
    if (!raw || raw.length > 8000) fail_('INVALID_REQUEST', 'Yêu cầu không hợp lệ.');
    const body = JSON.parse(raw);
    const secret = requireSecret_();
    if (!body || typeof body !== 'object' || !sameSecret_(body.secret, secret)) {
      fail_('UNAUTHORIZED', 'Không có quyền truy cập.');
    }
    if (body.action === 'health') {
      const ss = SpreadsheetApp.openById(CONFIG.spreadsheetId);
      registrationSheet_(ss);
      const sheet = ss.getSheetByName(CONFIG.checkinSheet);
      if (!sheet) fail_('SETUP_REQUIRED', 'Chạy hàm setupCheckin trong Apps Script trước.');
      verifyHeaders_(sheet);
      return json_({ ok: true, ready: true });
    }
    const id = strictId_(body.studentId);
    if (body.action === 'lookup') return json_(lookup_(id, secret));
    if (body.action === 'checkin') return json_(checkin_(id, body, secret));
    fail_('INVALID_ACTION', 'Thao tác không hợp lệ.');
  } catch (error) {
    return json_({ ok: false, code: error.code || 'SERVER_ERROR', message: error.code ? error.message : 'Không thể xử lý. Kiểm tra quyền truy cập Sheet hoặc thử lại.' });
  }
}

function lookup_(id, secret) {
  const ss = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  const checked = findCheckin_(checkinSheetReadOnly_(ss), id);
  if (checked) return { ok: true, status: 'already_checked_in', student: checked };
  const registration = findRegistration_(ss, id);
  const student = { studentId: id, name: registration.name, registered: registration.registered };
  return { ok: true, status: registration.registered ? 'registered' : 'unregistered', student: student, confirmationToken: makeToken_(student, secret) };
}

function checkin_(id, body, secret) {
  if (typeof body.requestId !== 'string' || !/^[a-f0-9-]{36}$/i.test(body.requestId)) fail_('INVALID_REQUEST', 'Mã yêu cầu không hợp lệ.');
  // Verify signature first. Expired but authentic tokens can still reconcile an existing write.
  const receipt = readToken_(body.confirmationToken, secret);
  if (receipt.studentId !== id) fail_('INVALID_TOKEN', 'Thông tin xác nhận không khớp MSSV.');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(CONFIG.lockWaitMs)) fail_('BUSY', 'Có nhiều lượt check-in. Vui lòng bấm gửi lại.');
  try {
    const ss = SpreadsheetApp.openById(CONFIG.spreadsheetId);
    const sheet = checkinSheet_(ss);
    // ALWAYS read committed rows while holding the SAME script lock as every writer.
    const existing = findCheckin_(sheet, id);
    if (existing) return { ok: true, status: 'already_checked_in', sameRequest: existing.requestId === body.requestId, student: existing };
    if (Date.now() - receipt.issuedAt > CONFIG.tokenLifetimeMs || receipt.issuedAt > Date.now() + 60000) {
      fail_('TOKEN_EXPIRED', 'Phiên xác nhận đã hết hạn. Tra cứu lại để tiếp tục.');
    }
    const registration = findRegistration_(ss, id);
    if (registration.registered !== receipt.registered || registration.name !== receipt.name) {
      fail_('REGISTRATION_CHANGED', 'Danh sách đăng ký vừa thay đổi. Tra cứu lại và xác nhận họ tên mới.');
    }
    const name = registration.registered ? registration.name : validateName_(body.name);
    const now = new Date();
    const row = sheet.getLastRow() + 1;
    if (row > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 100);
    // Text columns are formatted BEFORE writing, so MSSV keeps its leading zero.
    sheet.getRange(row, 1, 1, 2).setNumberFormat('@');
    sheet.getRange(row, 5).setNumberFormat('@');
    sheet.getRange(row, 3).setNumberFormat('dd/MM/yyyy HH:mm:ss');
    // Prevent a manually supplied name from becoming a spreadsheet formula.
    sheet.getRange(row, 1, 1, 5).setValues([[safeSheetText_(name), id, now, registration.registered ? 'Có' : 'Không', body.requestId]]);
    // Flush before releasing the lock and before acknowledging success.
    SpreadsheetApp.flush();
    return { ok: true, status: 'checked_in', sameRequest: true, student: { studentId: id, name: name, registered: registration.registered, checkedInAt: now.toISOString(), requestId: body.requestId } };
  } finally { lock.releaseLock(); }
}

function registrationSheet_(ss) {
  const sheet = ss.getSheetByName(CONFIG.registrationSheet);
  if (!sheet) fail_('CONFIG_ERROR', 'Không tìm thấy tab đăng ký đã cấu hình.');
  return sheet;
}

function findRegistration_(ss, id) {
  const sheet = registrationSheet_(ss);
  const last = sheet.getLastRow();
  if (last < CONFIG.firstDataRow) return { name: '', registered: false };
  const range = sheet.getRange(CONFIG.firstDataRow, CONFIG.nameColumn, last - CONFIG.firstDataRow + 1, CONFIG.idColumn - CONFIG.nameColumn + 1);
  const displayed = range.getDisplayValues();
  const raw = range.getValues();
  const matches = [];
  for (let i = 0; i < displayed.length; i++) {
    const offset = CONFIG.idColumn - CONFIG.nameColumn;
    const normalized = normalizeSheetId_(displayed[i][offset]) || normalizeSheetId_(raw[i][offset]);
    if (normalized === id) {
      const name = cleanName_(displayed[i][0]);
      if (!name) fail_('REGISTRATION_CONFLICT', 'MSSV đã đăng ký nhưng thiếu họ tên. Nhờ ban tổ chức sửa dòng đăng ký.');
      matches.push(name);
    }
  }
  if (!matches.length) return { name: '', registered: false };
  if (new Set(matches.map(function (x) { return x.toLocaleUpperCase('vi'); })).size > 1) {
    fail_('REGISTRATION_CONFLICT', 'MSSV trùng trong danh sách đăng ký với nhiều họ tên khác nhau. Nhờ ban tổ chức đối chiếu trước khi check-in.');
  }
  return { name: matches[0], registered: true };
}

function normalizeSheetId_(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0)) return '';
  const text = String(value).normalize('NFKC').replace(/[\s\u200B-\u200D\uFEFF]/g, '').replace(/['‘’‚‛`´ʼ＇"“”]/g, '');
  // Recover exactly one dropped leading zero. Never guess other missing digits.
  if (!/^\d{11,12}$/.test(text)) return '';
  const id = text.padStart(12, '0');
  return /^0\d{11}$/.test(id) ? id : '';
}

function strictId_(value) {
  if (typeof value !== 'string' || !/^0\d{11}$/.test(value)) fail_('INVALID_ID', 'MSSV phải có đúng 12 chữ số, bắt đầu bằng số 0.');
  return value;
}
function cleanName_(value) { return String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim(); }
function validateName_(value) {
  if (typeof value !== 'string') fail_('INVALID_NAME', 'Vui lòng nhập họ tên.');
  const name = cleanName_(value);
  if (name.length < 2 || name.length > 100 || /[\u0000-\u001F\u007F]/.test(name)) fail_('INVALID_NAME', 'Họ tên phải có từ 2 đến 100 ký tự.');
  return name;
}
function safeSheetText_(value) { return /^[=+\-@]/.test(value) ? "'" + value : value; }

function checkinSheetReadOnly_(ss) {
  const sheet = ss.getSheetByName(CONFIG.checkinSheet);
  if (!sheet) fail_('SETUP_REQUIRED', 'Chạy hàm setupCheckin trước khi sử dụng.');
  verifyHeaders_(sheet);
  return sheet;
}
function checkinSheet_(ss) {
  let sheet = ss.getSheetByName(CONFIG.checkinSheet);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.checkinSheet);
    sheet.getRange(1, 1, 1, 5).setValues([CHECKIN_HEADERS]);
    sheet.getRange(1, 2, sheet.getMaxRows(), 1).setNumberFormat('@');
  }
  verifyHeaders_(sheet);
  return sheet;
}
function verifyHeaders_(sheet) {
  const actual = sheet.getRange(1, 1, 1, 5).getDisplayValues()[0];
  if (actual.some(function (x, i) { return x !== CHECKIN_HEADERS[i]; })) fail_('CONFIG_ERROR', 'Tab check-in có cấu trúc khác. Không ghi dữ liệu để tránh nhầm cột.');
}
function findCheckin_(sheet, id) {
  const last = sheet.getLastRow();
  if (last < 2) return null;
  const rows = sheet.getRange(2, 1, last - 1, 5).getValues();
  for (let i = 0; i < rows.length; i++) {
    if (normalizeSheetId_(rows[i][1]) === id) {
      const time = rows[i][2];
      return { studentId: id, name: String(rows[i][0]), checkedInAt: time instanceof Date ? time.toISOString() : String(time), registered: rows[i][3] === 'Có', requestId: String(rows[i][4]) };
    }
  }
  return null;
}

function requireSecret_() {
  const secret = PropertiesService.getScriptProperties().getProperty('GIEO_API_SECRET');
  if (!secret || secret.length < 32) fail_('CONFIG_ERROR', 'Thiết lập GIEO_API_SECRET ít nhất 32 ký tự trong Script Properties.');
  return secret;
}
function sameSecret_(actual, expected) {
  if (typeof actual !== 'string' || actual.length > 256) return false;
  let difference = actual.length ^ expected.length;
  for (let i = 0; i < expected.length; i++) difference |= (actual.charCodeAt(i) || 0) ^ expected.charCodeAt(i);
  return difference === 0;
}
function makeToken_(student, secret) {
  const payload = Utilities.base64EncodeWebSafe(JSON.stringify({ studentId: student.studentId, name: student.name, registered: student.registered, issuedAt: Date.now() }), Utilities.Charset.UTF_8);
  return payload + '.' + sign_(payload, secret);
}
function sign_(payload, secret) { return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload, secret, Utilities.Charset.UTF_8)); }
function readToken_(token, secret) {
  if (typeof token !== 'string' || token.length > 3000) fail_('INVALID_TOKEN', 'Tra cứu lại sinh viên để xác nhận.');
  const parts = token.split('.');
  if (parts.length !== 2 || !sameSecret_(parts[1], sign_(parts[0], secret))) fail_('INVALID_TOKEN', 'Phiên xác nhận không hợp lệ. Vui lòng tra cứu lại.');
  let parsed;
  try { parsed = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString()); }
  catch (error) { fail_('INVALID_TOKEN', 'Phiên xác nhận không hợp lệ.'); }
  if (!parsed || typeof parsed.issuedAt !== 'number' || !Number.isFinite(parsed.issuedAt) || typeof parsed.registered !== 'boolean' || typeof parsed.name !== 'string') fail_('INVALID_TOKEN', 'Phiên xác nhận không hợp lệ.');
  return parsed;
}
function fail_(code, message) { const error = new Error(message); error.code = code; throw error; }
function json_(body) { return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON); }
