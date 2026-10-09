import './styles.css';

const $ = id => document.getElementById(id);
const demo = new URLSearchParams(location.search).get('demo') === '1';
const keys = { access: 'gieo-access-v1', pending: demo ? 'gieo-demo-pending-v1' : 'gieo-pending-v1', recent: demo ? 'gieo-demo-recent-v1' : 'gieo-recent-v1' };
const store = {
  get(storage, key, fallback) { try { return JSON.parse(storage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(storage, key, value) { try { storage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } },
  remove(storage, key) { try { storage.removeItem(key); } catch {} }
};
let accessCode = store.get(sessionStorage, keys.access, '');
let ready = false, busy = false, current = null, pending = store.get(localStorage, keys.pending, null);
let recent = store.get(sessionStorage, keys.recent, []);
if (!Array.isArray(recent)) recent = [];
if (pending && (!/^0\d{11}$/.test(pending.studentId) || typeof pending.requestId !== 'string' || typeof pending.confirmationToken !== 'string')) { pending = null; store.remove(localStorage, keys.pending); }
let controls = null, cameraStarting = false, cameraEpoch = 0, torchOn = false;
let candidate = '', candidateCount = 0, candidateAt = 0;

function connection(state, text) { $('connection').dataset.state = state; $('connectionText').textContent = text; }
function message(text = '', kind = 'info') { $('message').textContent = text; $('message').dataset.kind = kind; $('message').hidden = !text; }
function updateControls() {
  const unavailable = !ready || busy || Boolean(pending) || $('confirmDialog').open;
  $('scanButton').disabled = unavailable;
  $('lookupButton').disabled = unavailable;
  $('studentId').disabled = unavailable;
  $('logoutButton').hidden = !ready || demo;
}
function showAccess(error = '') {
  ready = false; stopScan(); $('accessPanel').hidden = false; $('accessError').textContent = error;
  connection('waiting', 'Nhập mã truy cập của ban tổ chức'); updateControls();
}

const demoRows = new Map();
async function api(action, data = {}) {
  if (demo) {
    await new Promise(resolve => setTimeout(resolve, 450));
    if (action === 'health') return { ok: true, ready: true };
    const old = demoRows.get(data.studentId);
    if (old) return { ok: true, status: 'already_checked_in', sameRequest: old.requestId === data.requestId, student: old };
    const registered = data.studentId === '030000000001';
    const student = { studentId: data.studentId, name: registered ? 'Sinh viên mẫu GIEO' : '', registered };
    if (action === 'lookup') return { ok: true, status: registered ? 'registered' : 'unregistered', student, confirmationToken: 'demo-token' };
    const result = { ...student, name: registered ? student.name : data.name, checkedInAt: new Date().toISOString(), requestId: data.requestId };
    demoRows.set(data.studentId, result);
    return { ok: true, status: 'checked_in', sameRequest: true, student: result };
  }
  if (!navigator.onLine) throw Object.assign(new Error('Mất kết nối mạng. Bật mạng rồi thử lại.'), { code: 'OFFLINE' });
  let response;
  try {
    response = await fetch('/api/checkin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...data, action, accessCode }), cache: 'no-store', signal: AbortSignal.timeout(55000) });
  } catch {
    throw Object.assign(new Error(action === 'checkin' ? 'Chưa nhận được xác nhận đồng bộ. Bấm gửi lại để kiểm tra; thông tin vẫn được giữ.' : 'Không thể kết nối máy chủ. Kiểm tra mạng rồi thử lại.'), { code: 'NETWORK_ERROR' });
  }
  let result;
  try { result = await response.json(); }
  catch { throw Object.assign(new Error('Máy chủ chưa phản hồi hợp lệ. Vui lòng thử lại.'), { code: 'SERVER_ERROR' }); }
  if (!response.ok || !result.ok) throw Object.assign(new Error(result.message || 'Không thể xử lý yêu cầu.'), { code: result.code || 'SERVER_ERROR' });
  return result;
}

async function health() {
  if (busy) return;
  busy = true; updateControls();
  try {
    await api('health'); ready = true; $('accessPanel').hidden = true;
    connection(demo ? 'demo' : 'ready', demo ? 'CHẾ ĐỘ THỬ · Không ghi Google Sheets' : 'Đã kết nối Google Sheets');
    if (pending) showPending();
  } catch (error) {
    if (error.code === 'ACCESS_DENIED') { store.remove(sessionStorage, keys.access); showAccess(error.message); }
    else { ready = false; connection('error', 'Chưa kết nối Google Sheets'); message(error.message, 'error'); $('accessPanel').hidden = false; }
  } finally { busy = false; updateControls(); }
}

$('accessForm').addEventListener('submit', async event => {
  event.preventDefault(); accessCode = $('accessCode').value.trim();
  $('accessForm').querySelector('button').disabled = true; $('accessError').textContent = ''; message();
  try { await health(); if (ready) { store.set(sessionStorage, keys.access, accessCode); $('accessCode').value = ''; } }
  finally { $('accessForm').querySelector('button').disabled = false; }
});
$('logoutButton').addEventListener('click', () => { accessCode = ''; store.remove(sessionStorage, keys.access); showAccess(); });

function stopScan() {
  cameraEpoch++; cameraStarting = false;
  controls?.stop(); controls = null;
  const stream = $('video').srcObject;
  if (stream && typeof stream.getTracks === 'function') stream.getTracks().forEach(track => track.stop());
  $('video').srcObject = null; $('cameraPlaceholder').hidden = false; $('scanGuide').hidden = true;
  $('torchButton').hidden = true; torchOn = false; $('torchButton').setAttribute('aria-pressed', 'false');
  $('scanButton').classList.remove('is-scanning'); $('scanButton').querySelector('span').textContent = 'Bật camera để quét';
  $('scanNote').textContent = 'Quét mã vạch trên thẻ, sau đó xác nhận họ tên.';
  candidate = ''; candidateCount = 0;
}
async function startScan() {
  if (controls || cameraStarting) { stopScan(); return; }
  if (!ready || busy || pending) return;
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { message('Camera cần HTTPS. Mở đường dẫn Vercel bằng Safari hoặc Chrome.', 'error'); return; }
  message(); cameraStarting = true; const epoch = ++cameraEpoch;
  $('scanButton').querySelector('span').textContent = 'Đang mở camera…';
  try {
    const { startBarcodeCamera } = await import('./scanner.js');
    if (epoch !== cameraEpoch) return;
    const newControls = await startBarcodeCamera($('video'), (value, scanControls) => {
      if (busy || current || pending || epoch !== cameraEpoch) return;
      const id = value.trim();
      if (!/^0\d{11}$/.test(id)) { $('scanNote').textContent = 'Mã này chưa đúng MSSV 12 chữ số. Đưa đúng mã vạch trên thẻ vào khung.'; return; }
      const now = Date.now();
      candidateCount = candidate === id && now - candidateAt < 1800 ? candidateCount + 1 : 1;
      candidate = id; candidateAt = now;
      if (candidateCount < 2) return;
      scanControls.stop(); navigator.vibrate?.(60); void lookup(id);
    }, () => epoch === cameraEpoch, error => {
      if (epoch !== cameraEpoch) return;
      stopScan(); message('Không đọc được hình ảnh camera. Bật lại camera hoặc nhập MSSV bên dưới.', 'error');
    });
    if (epoch !== cameraEpoch) { newControls.stop(); return; }
    controls = newControls; cameraStarting = false;
    $('cameraPlaceholder').hidden = true; $('scanGuide').hidden = false;
    $('scanButton').classList.add('is-scanning'); $('scanButton').querySelector('span').textContent = 'Dừng camera';
    $('scanNote').textContent = 'Đang quét · Giữ nguyên thẻ trong khung';
    const track = $('video').srcObject?.getVideoTracks()[0];
    $('torchButton').hidden = !track?.getCapabilities?.().torch;
  } catch (error) {
    if (epoch !== cameraEpoch) return;
    stopScan();
    const errors = { NotAllowedError: 'Chưa được cấp quyền camera. Cho phép camera trong cài đặt của trình duyệt rồi thử lại.', NotFoundError: 'Không tìm thấy camera. Bạn có thể nhập MSSV bên dưới.', NotReadableError: 'Camera đang được ứng dụng khác sử dụng. Đóng ứng dụng đó rồi thử lại.' };
    message(errors[error.name] || 'Không mở được camera. Thử Safari/Chrome hoặc nhập MSSV bên dưới.', 'error');
  }
}
$('scanButton').addEventListener('click', startScan);
$('torchButton').addEventListener('click', async () => {
  try { await controls.switchTorch(!torchOn); torchOn = !torchOn; $('torchButton').setAttribute('aria-pressed', String(torchOn)); }
  catch { message('Camera này không hỗ trợ điều khiển đèn flash.'); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) stopScan(); });
window.addEventListener('pagehide', stopScan);

$('manualForm').addEventListener('submit', event => { event.preventDefault(); void lookup($('studentId').value.trim()); });
$('studentId').addEventListener('input', () => { $('studentId').value = $('studentId').value.replace(/[^0-9]/g, '').slice(0, 12); });
async function lookup(id) {
  if (busy || pending || !ready) return;
  if (!/^0\d{11}$/.test(id)) { message('Nhập đúng 12 chữ số của MSSV, gồm số 0 ở đầu.', 'error'); return; }
  stopScan(); message(); busy = true; updateControls(); $('lookupButton').textContent = 'Đang tìm…';
  try {
    const result = await api('lookup', { studentId: id });
    if (result.status === 'already_checked_in') { current = null; showResult(result, false); }
    else { current = { ...result.student, confirmationToken: result.confirmationToken, requestId: crypto.randomUUID() }; showConfirmation(); }
  } catch (error) {
    message(error.message, 'error');
    if (error.code === 'ACCESS_DENIED') showAccess(error.message);
  } finally { busy = false; $('lookupButton').textContent = 'Tra cứu'; updateControls(); }
}

function resetDialog() {
  $('confirmError').textContent = ''; $('confirmButton').hidden = false; $('confirmButton').disabled = false;
  $('nextButton').hidden = true; $('refreshPendingButton').hidden = true; $('cancelConfirm').disabled = false;
  $('personIcon').textContent = '✓'; $('personIcon').style.background = '';
}
function openConfirmation() { if (!$('confirmDialog').open) $('confirmDialog').showModal(); updateControls(); }
function showConfirmation() {
  resetDialog();
  $('confirmTitle').textContent = current.registered ? 'Đúng bạn này chứ?' : 'Bạn này chưa đăng ký';
  $('confirmDescription').textContent = current.registered ? 'Đối chiếu họ tên với sinh viên rồi bấm OK.' : 'Hỏi họ tên sinh viên để bổ sung lượt check-in.';
  $('confirmId').textContent = current.studentId; $('confirmName').textContent = current.name; $('confirmName').hidden = !current.registered;
  $('registrationBadge').textContent = current.registered ? 'Đã đăng ký' : 'Chưa có trong danh sách';
  $('registrationBadge').dataset.kind = current.registered ? 'registered' : 'manual';
  $('nameField').hidden = current.registered; $('fullName').value = current.registered ? '' : current.name || '';
  $('fullName').required = !current.registered; $('fullName').disabled = false;
  $('confirmButton').textContent = 'OK · Xác nhận check-in';
  $('dialogNote').textContent = demo ? 'Đang thử giao diện. Không có dữ liệu nào được ghi vào Google Sheets.' : 'Thông tin được ghi vào danh sách check-in sau khi xác nhận.';
  openConfirmation();
  if (!current.registered) setTimeout(() => $('fullName').focus(), 80);
}
function showPending() {
  current = { ...pending }; showConfirmation();
  $('confirmTitle').textContent = 'Tiếp tục lượt đang gửi';
  $('confirmDescription').textContent = 'Chưa nhận được xác nhận đồng bộ cho lượt này.';
  $('fullName').disabled = true; $('cancelConfirm').disabled = true;
  $('confirmButton').textContent = 'Gửi lại · Kiểm tra đồng bộ';
  $('dialogNote').textContent = 'Gửi lại an toàn: máy chủ kiểm tra MSSV trước khi ghi.';
}
function closeConfirmation() {
  if (busy || pending) return;
  $('confirmDialog').close(); current = null; updateControls();
}
$('cancelConfirm').addEventListener('click', closeConfirmation);
$('confirmDialog').addEventListener('cancel', event => { if (busy || pending) event.preventDefault(); else { current = null; updateControls(); } });
$('confirmDialog').addEventListener('close', updateControls);
$('confirmForm').addEventListener('submit', async event => {
  event.preventDefault(); if (busy || !current) return;
  if (!current.registered && !pending) {
    current.name = $('fullName').value.normalize('NFKC').trim().replace(/\s+/g, ' ');
    if (current.name.length < 2 || current.name.length > 100) { $('confirmError').textContent = 'Nhập họ tên từ 2 đến 100 ký tự.'; $('fullName').focus(); return; }
  }
  if (!pending) {
    const toSave = { ...current, savedAt: Date.now() };
    // Persist BEFORE sending so a reload can reconcile an uncertain write.
    if (!store.set(localStorage, keys.pending, toSave)) { $('confirmError').textContent = 'Trình duyệt không lưu được lượt đang gửi. Cho phép lưu dữ liệu trang web hoặc dùng cửa sổ thường rồi thử lại.'; return; }
    pending = toSave;
  }
  busy = true; updateControls(); $('confirmButton').disabled = true; $('cancelConfirm').disabled = true; $('fullName').disabled = true;
  $('confirmError').textContent = ''; $('confirmButton').textContent = 'Đang đồng bộ…';
  try {
    const result = await api('checkin', pending);
    store.remove(localStorage, keys.pending); pending = null; current = null;
    showResult(result, result.status === 'checked_in' || result.sameRequest === true);
    $('studentId').value = '';
  } catch (error) {
    $('confirmError').textContent = error.message;
    $('confirmButton').disabled = false; $('confirmButton').textContent = 'Gửi lại · Kiểm tra đồng bộ';
    $('dialogNote').textContent = 'Thông tin đang được giữ trên thiết bị. Gửi lại không tạo thêm dòng trùng MSSV.';
    if (['TOKEN_EXPIRED', 'REGISTRATION_CHANGED', 'INVALID_TOKEN'].includes(error.code)) { $('refreshPendingButton').hidden = false; $('confirmButton').hidden = true; }
    if (error.code === 'ACCESS_DENIED') { $('confirmDialog').close(); showAccess(error.message); }
  } finally { busy = false; updateControls(); }
});
$('refreshPendingButton').addEventListener('click', async () => {
  if (busy || !pending) return;
  busy = true; $('refreshPendingButton').disabled = true; $('confirmError').textContent = '';
  try {
    const result = await api('lookup', { studentId: pending.studentId });
    if (result.status === 'already_checked_in') {
      const sameRequest = result.student.requestId === pending.requestId;
      store.remove(localStorage, keys.pending); pending = null; current = null;
      showResult(result, sameRequest);
    } else {
      current = { ...result.student, name: result.student.registered ? result.student.name : pending.name, confirmationToken: result.confirmationToken, requestId: pending.requestId };
      // lookup proves no committed row; new receipt must be reconfirmed by the operator.
      store.remove(localStorage, keys.pending); pending = null; showConfirmation();
    }
  } catch (error) { $('confirmError').textContent = error.message; }
  finally { busy = false; $('refreshPendingButton').disabled = false; updateControls(); }
});
function showResult(result, own) {
  resetDialog(); const student = result.student;
  $('confirmButton').hidden = true; $('nextButton').hidden = false; $('nameField').hidden = true; $('fullName').required = false;
  $('confirmTitle').textContent = own ? 'Check-in thành công!' : 'Bạn này đã check-in';
  $('confirmDescription').textContent = own ? (demo ? 'Đã hoàn thành lượt thử giao diện.' : 'Thông tin đã được ghi vào Google Sheets.') : 'MSSV này đã có trong danh sách check-in.';
  $('personIcon').textContent = own ? '✓' : '!';
  $('confirmId').textContent = student.studentId; $('confirmName').textContent = student.name; $('confirmName').hidden = false;
  $('registrationBadge').dataset.kind = 'registered'; $('registrationBadge').textContent = own ? (demo ? 'Lượt thử' : 'Đã đồng bộ') : 'Đã ghi trước đó';
  const date = new Date(student.checkedInAt);
  $('dialogNote').textContent = !Number.isNaN(date.getTime()) ? 'Check-in lúc ' + date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : 'Không thêm dòng trùng MSSV.';
  if (own) { recent = [student, ...recent.filter(item => item.studentId !== student.studentId)].slice(0, 8); store.set(sessionStorage, keys.recent, recent); renderRecent(); navigator.vibrate?.([60, 40, 60]); }
  openConfirmation();
}
$('nextButton').addEventListener('click', () => { $('confirmDialog').close(); current = null; updateControls(); void startScan(); });
function renderRecent() {
  if (!recent.length) return;
  $('recentList').replaceChildren();
  for (const item of recent) {
    const row = document.createElement('div'); row.className = 'recent-item';
    const avatar = document.createElement('span'); avatar.className = 'recent-avatar'; avatar.textContent = '✓';
    const person = document.createElement('div'); person.className = 'recent-person';
    const name = document.createElement('strong'); name.textContent = item.name;
    const id = document.createElement('span'); id.textContent = item.studentId; person.append(name, id);
    const time = document.createElement('span'); time.className = 'recent-time';
    const date = new Date(item.checkedInAt); time.textContent = Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
    row.append(avatar, person, time); $('recentList').append(row);
  }
}
$('helpButton').addEventListener('click', () => $('helpDialog').showModal());
$('closeHelp').addEventListener('click', () => $('helpDialog').close());
window.addEventListener('offline', () => { stopScan(); connection('error', 'Mất kết nối mạng'); message('Bật lại mạng để tiếp tục. Lượt đang gửi vẫn được giữ trên thiết bị.', 'error'); });
window.addEventListener('online', () => { message(); if (accessCode || demo) void health(); });
window.addEventListener('beforeunload', event => { if (busy && pending) { event.preventDefault(); event.returnValue = ''; } });
renderRecent(); updateControls();
if (demo || accessCode) void health(); else showAccess();
