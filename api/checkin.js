import { timingSafeEqual } from 'node:crypto';

const statusCodes = { UNAUTHORIZED: 401, INVALID_REQUEST: 400, INVALID_ACTION: 400, INVALID_ID: 400, INVALID_NAME: 400, INVALID_TOKEN: 400, TOKEN_EXPIRED: 409, REGISTRATION_CHANGED: 409, REGISTRATION_CONFLICT: 409, BUSY: 503, CONFIG_ERROR: 503, SETUP_REQUIRED: 503 };
export function secureEqual(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string' || actual.length > 256) return false;
  const a = Buffer.from(actual), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const reply = (status, body) => res.status(status).json(body);
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return reply(405, { ok: false, code: 'METHOD_NOT_ALLOWED', message: 'Chỉ hỗ trợ POST.' }); }
  const { APPS_SCRIPT_URL: url, APPS_SCRIPT_SECRET: secret, CHECKIN_ACCESS_CODE: accessCode } = process.env;
  if (!url || !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url) || !secret || secret.length < 32 || !accessCode || accessCode.length < 8) {
    return reply(503, { ok: false, code: 'NOT_CONFIGURED', message: 'Ứng dụng chưa kết nối Google Sheets. Ban tổ chức cần hoàn tất cấu hình Apps Script và Vercel.' });
  }
  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { return reply(400, { ok: false, code: 'INVALID_REQUEST', message: 'Dữ liệu không hợp lệ.' }); }
  if (!body || typeof body !== 'object' || JSON.stringify(body).length > 8000) return reply(400, { ok: false, code: 'INVALID_REQUEST', message: 'Dữ liệu không hợp lệ.' });
  if (!secureEqual(body.accessCode, accessCode)) return reply(401, { ok: false, code: 'ACCESS_DENIED', message: 'Mã truy cập chưa đúng.' });
  if (!['health', 'lookup', 'checkin'].includes(body.action)) return reply(400, { ok: false, code: 'INVALID_ACTION', message: 'Thao tác không hợp lệ.' });
  if (body.action !== 'health' && (typeof body.studentId !== 'string' || !/^0\d{11}$/.test(body.studentId))) return reply(400, { ok: false, code: 'INVALID_ID', message: 'MSSV phải có 12 chữ số, bắt đầu bằng số 0.' });
  if (body.action === 'checkin' && (typeof body.requestId !== 'string' || !/^[a-f0-9-]{36}$/i.test(body.requestId) || typeof body.confirmationToken !== 'string' || body.confirmationToken.length > 3000 || (body.name !== undefined && (typeof body.name !== 'string' || body.name.length > 100)))) return reply(400, { ok: false, code: 'INVALID_REQUEST', message: 'Thông tin xác nhận không hợp lệ.' });
  const upstreamBody = { action: body.action, studentId: body.studentId, name: body.name, requestId: body.requestId, confirmationToken: body.confirmationToken, secret };
  try {
    // Follow Google's ContentService redirect on the SERVER. Secrets never enter browser code.
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(upstreamBody), redirect: 'follow', signal: AbortSignal.timeout(45000) });
    const raw = await response.text();
    let result;
    try { result = JSON.parse(raw); }
    catch { return reply(502, { ok: false, code: 'UPSTREAM_CONFIG', message: 'Apps Script chưa trả dữ liệu JSON. Kiểm tra URL /exec và quyền truy cập Anyone.' }); }
    if (!response.ok || !result || typeof result.ok !== 'boolean') return reply(502, { ok: false, code: 'UPSTREAM_ERROR', message: 'Google Sheets chưa phản hồi hợp lệ. Vui lòng gửi lại.' });
    return reply(result.ok ? 200 : (statusCodes[result.code] || 502), result);
  } catch {
    // A timeout is NOT evidence that a write failed. Client retains its request ID and retries.
    return reply(504, { ok: false, code: 'SYNC_UNCERTAIN', message: 'Chưa nhận được xác nhận từ Google Sheets. Giữ thông tin và bấm gửi lại; hệ thống sẽ kiểm tra trùng trước khi ghi.' });
  }
}
