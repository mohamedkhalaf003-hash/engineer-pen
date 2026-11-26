import { createWorker } from 'tesseract.js';
// Offline handwriting -> text (Tesseract, bundled files under ./ocr/). No network, no fees.
let wk = null, wl = '', busy = Promise.resolve();
const base = () => new URL('ocr/', document.baseURI).href;
async function get(lang) {
  if (wk && wl === lang) return wk;
  if (wk) { try { await wk.terminate(); } catch (e) {} wk = null; }
  const b = base();
  wk = await createWorker(lang, 1, { workerPath: b + 'worker.min.js', corePath: b + 'tesseract-core-lstm.wasm.js', langPath: b, gzip: true, workerBlobURL: false, cacheMethod: 'none' });
  await wk.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
  wl = lang; return wk;
}
// strokes -> white canvas with black ink, scaled so letters are big enough for OCR
export function strokesToCanvas(strokes, W, H) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  strokes.forEach(s => s.p.forEach(q => { x0 = Math.min(x0, q[0] * W); x1 = Math.max(x1, q[0] * W); y0 = Math.min(y0, q[1] * H); y1 = Math.max(y1, q[1] * H); }));
  const bw = Math.max(8, x1 - x0), bh = Math.max(8, y1 - y0);
  let k = Math.min(3, Math.max(1, 2400 / W)); if (bh * k > 1400) k = 1400 / bh; if (bw * k > 3000) k = 3000 / bw;
  const pad = 30, c = document.createElement('canvas'); c.width = Math.ceil(bw * k + pad * 2); c.height = Math.ceil(bh * k + pad * 2);
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  x.strokeStyle = '#000'; x.fillStyle = '#000'; x.lineCap = 'round'; x.lineJoin = 'round'; x.lineWidth = Math.max(3, 3.2 * k);
  strokes.forEach(s => {
    const P = s.p.map(q => [(q[0] * W - x0) * k + pad, (q[1] * H - y0) * k + pad]);
    if (P.length === 1) { x.beginPath(); x.arc(P[0][0], P[0][1], x.lineWidth / 2, 0, 7); x.fill(); return; }
    x.beginPath(); x.moveTo(P[0][0], P[0][1]); for (let i = 1; i < P.length; i++) x.lineTo(P[i][0], P[i][1]); x.stroke();
  });
  return { canvas: c, x0, y0, bw, bh };
}
export function recognize(canvas, lang) {
  const run = async () => { const w = await get(lang); const r = await w.recognize(canvas); return { text: (r.data.text || '').replace(/[ \t]+\n/g, '\n').trim(), conf: r.data.confidence || 0 }; };
  busy = busy.then(run, run); return busy;
}
