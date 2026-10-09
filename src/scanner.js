import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

let initialization;
function initialize() {
  if (!initialization) initialization = prepareZXingModule({ overrides: { locateFile: path => path.endsWith('.wasm') ? wasmUrl : path }, fireImmediately: true }).catch(error => { initialization = null; throw error; });
  return initialization;
}

/** Increase contrast without discarding the barcode's narrow bars. */
export function enhanceContrast(image) {
  const data = image.data;
  let low = 255, high = 0;
  for (let i = 0; i < data.length; i += 4) {
    const luminance = (306 * data[i] + 601 * data[i + 1] + 117 * data[i + 2] + 512) >> 10;
    low = Math.min(low, luminance); high = Math.max(high, luminance);
    data[i] = data[i + 1] = data[i + 2] = luminance;
  }
  if (high - low > 20) {
    const scale = 255 / (high - low);
    for (let i = 0; i < data.length; i += 4) data[i] = data[i + 1] = data[i + 2] = Math.round((data[i] - low) * scale);
  }
  return image;
}

/** Callback never receives an invalid/checksum-failed symbol. Images stay on the device. */
export async function decodeStudentIds(image) {
  await initialize();
  const results = await readBarcodes(enhanceContrast(image), { formats: ['Code128', 'Code39', 'Code93', 'ITF', 'Codabar'], tryHarder: true, tryRotate: true, tryInvert: true, minLineCount: 2, maxNumberOfSymbols: 3 });
  return [...new Set(results.filter(result => result.isValid && /^0\d{11}$/.test(result.text)).map(result => result.text))];
}

export async function startBarcodeCamera(video, onBarcode, isCurrent, onError) {
  await initialize();
  if (!isCurrent()) throw new DOMException('Cancelled', 'AbortError');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
  if (!isCurrent()) { stream.getTracks().forEach(track => track.stop()); throw new DOMException('Cancelled', 'AbortError'); }
  let stopped = false, timer;
  const controls = {
    stop() { stopped = true; clearTimeout(timer); stream.getTracks().forEach(track => track.stop()); if (video.srcObject === stream) video.srcObject = null; },
    async switchTorch(enabled) { await stream.getVideoTracks()[0].applyConstraints({ advanced: [{ torch: enabled }] }); }
  };
  try { video.srcObject = stream; await video.play(); }
  catch (error) { controls.stop(); throw error; }
  if (!isCurrent()) { controls.stop(); throw new DOMException('Cancelled', 'AbortError'); }
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) { controls.stop(); throw new Error('Canvas is unavailable'); }
  async function tick() {
    if (stopped || !isCurrent()) { controls.stop(); return; }
    try {
      if (video.readyState >= 2 && video.videoWidth && video.videoHeight) {
        // Crop the visible object-fit:cover area to the guide, with extra quiet-zone margins.
        const rect = video.getBoundingClientRect();
        const scale = Math.max(rect.width / video.videoWidth, rect.height / video.videoHeight);
        const visibleWidth = rect.width / scale, visibleHeight = rect.height / scale;
        const sourceX = (video.videoWidth - visibleWidth) / 2 + visibleWidth * .04;
        const sourceY = (video.videoHeight - visibleHeight) / 2 + visibleHeight * .18;
        const sourceWidth = visibleWidth * .92, sourceHeight = visibleHeight * .64;
        canvas.width = 1280;
        canvas.height = Math.max(1, Math.round(1280 * sourceHeight / sourceWidth));
        context.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
        const ids = await decodeStudentIds(context.getImageData(0, 0, canvas.width, canvas.height));
        if (!stopped && isCurrent() && ids.length === 1) onBarcode(ids[0], controls);
      }
    } catch (error) { controls.stop(); onError(error); return; }
    if (!stopped) timer = setTimeout(tick, 160);
  }
  timer = setTimeout(tick, 0);
  return controls;
}
