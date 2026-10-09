import test from 'node:test';
import assert from 'node:assert/strict';
import handler, { secureEqual } from '../api/checkin.js';

function call(body, method = 'POST') {
  let status, result; const headers = {};
  const res = { setHeader(key, value) { headers[key] = value; }, status(code) { status = code; return this; }, json(value) { result = value; return this; } };
  return handler({ method, body }, res).then(() => ({ status, result, headers }));
}
test('constant time access code comparison preserves exact value', () => { assert.equal(secureEqual('12345678', '12345678'), true); assert.equal(secureEqual('12345678', '12345679'), false); assert.equal(secureEqual(null, '12345678'), false); });
test('server API validates configuration, access, methods and redirects', async () => {
  const savedEnv = { ...process.env }; const savedFetch = globalThis.fetch;
  try {
    delete process.env.APPS_SCRIPT_URL; assert.equal((await call({ action: 'health' })).result.code, 'NOT_CONFIGURED');
    process.env.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/TEST/exec'; process.env.APPS_SCRIPT_SECRET = 'a'.repeat(32); process.env.CHECKIN_ACCESS_CODE = 'staff1234';
    assert.equal((await call({ action: 'health', accessCode: 'wrong' })).status, 401);
    assert.equal((await call({}, 'GET')).status, 405);
    assert.equal((await call({ action: 'lookup', accessCode: 'staff1234', studentId: 30238220186 })).status, 400);
    globalThis.fetch = async (url, options) => { assert.equal(options.redirect, 'follow'); const body = JSON.parse(options.body); assert.equal(body.secret, 'a'.repeat(32)); assert.equal(body.accessCode, undefined); return new Response(JSON.stringify({ ok: true, ready: true })); };
    const ok = await call({ action: 'health', accessCode: 'staff1234' }); assert.equal(ok.status, 200); assert.match(ok.headers['Cache-Control'], /no-store/);
    globalThis.fetch = async () => new Response('<html>Sign in</html>'); assert.equal((await call({ action: 'health', accessCode: 'staff1234' })).result.code, 'UPSTREAM_CONFIG');
    globalThis.fetch = async () => { throw new Error('timeout'); }; assert.equal((await call({ action: 'health', accessCode: 'staff1234' })).result.code, 'SYNC_UNCERTAIN');
  } finally { globalThis.fetch = savedFetch; process.env = savedEnv; }
});
