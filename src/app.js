import * as pdfjs from 'pdfjs-dist/build/pdf.min.mjs';
import { PDFDocument, rgb, LineCapStyle } from 'pdf-lib';
import workerText from './worker.js';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
pdfjs.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([workerText], { type: 'text/javascript' }));

const $ = (s, r = document) => r.querySelector(s);
const A4 = [595, 842], MAXP = 4;
const COLORS = ['#e11d1d', '#111111', '#1d4ed8', '#16a34a', '#f59e0b'];
const S = { tool: 'pen', color: COLORS[0], width: 0.0035, finger: false, orient: 'column', panes: [], active: null };
let uid = 0;

/* ---------- IndexedDB autosave ---------- */
const idb = () => new Promise((res, rej) => { const r = indexedDB.open('engpen', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function kvSet(k, v) { try { const db = await idb(); db.transaction('kv', 'readwrite').objectStore('kv').put(v, k); } catch (e) { } }
async function kvGet(k) { try { const db = await idb(); return await new Promise(r => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => r(q.result); q.onerror = () => r(null); }); } catch (e) { return null; } }
let saveT; const autosave = () => { clearTimeout(saveT); saveT = setTimeout(persist, 900); };
function persist() {
  kvSet('state', { orient: S.orient, panes: S.panes.map(p => ({ kind: p.kind, name: p.name, bytes: p.bytes || null, zoom: p.zoom, pages: p.pages.map(g => ({ w: g.w, h: g.h, strokes: g.strokes })) })) });
}

/* ---------- UI shell ---------- */
document.body.innerHTML = `
<div id="bar">
 <section class="bx"><h3>📁 الملفات والحفظ</h3><div class="tl">
  <button data-a="save" class="sv"><b>💾</b><small>حفظ PDF</small></button>
  <button data-a="share"><b>📤</b><small>مشاركة</small></button>
  <button data-a="open"><b>📂</b><small>فتح PDF</small></button>
  <button data-a="draft"><b>📝</b><small>مسودة</small></button>
  <button data-a="nb"><b>📒</b><small>نوت بوك</small></button>
 </div></section>
 <section class="bx"><h3>✏️ أدوات الرسم</h3><div class="tl">
  <button data-t="pen" class="on"><b>✏️</b><small>قلم</small></button>
  <button data-t="hl"><b>🖍</b><small>هايلايت</small></button>
  <button data-t="er"><b>🧽</b><small>ممحاة</small></button>
  <button data-a="undo"><b>↶</b><small>تراجع</small></button>
  <button data-a="finger" id="bf"><b>☝️</b><small>إصبع: لا</small></button>
 </div><div class="cw"><span id="cols"></span><input id="wd" type="range" min="1" max="12" value="4" title="السمك"></div></section>
 <section class="bx"><h3>🖥 العرض</h3><div class="tl">
  <button data-a="orient"><b>⇅</b><small>تقسيم</small></button>
  <button data-a="fs"><b>⛶</b><small>ملء الشاشة</small></button>
  <button data-a="hide"><b>▲</b><small>إخفاء الأدوات</small></button>
 </div></section>
</div>
<button id="showbar" data-a="show" hidden>▼ إظهار الأدوات</button>
<div id="panes"></div>
<div id="fabs"><button class="fab" data-a="share" title="مشاركة">📤</button><button class="fab main" data-a="save">💾<span>حفظ</span></button></div>
<input id="file" type="file" accept="application/pdf" multiple hidden>
<div id="toast"></div>`;
if (Capacitor.isNativePlatform()) document.documentElement.classList.add('native');
const st = document.createElement('style');
st.textContent = `
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;height:100%;background:#1f2937;font-family:system-ui,"Segoe UI",Tahoma,sans-serif;direction:rtl;overflow:hidden;overscroll-behavior:none}
body{display:flex;flex-direction:column}
#bar{display:flex;flex-direction:column;gap:8px;padding:8px;background:#0b1220;flex:none;max-height:46vh;overflow-y:auto}
#bar.h,#bar[hidden]{display:none}
.bx{background:#162033;border:1px solid #2b3a55;border-radius:16px;padding:8px 10px 10px;box-shadow:0 2px 10px #0006}
.bx h3{margin:0 2px 8px;font-size:13px;color:#7dd3c8;font-weight:700}
.tl{display:flex;gap:6px}
.tl button{flex:1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:9px 2px;border:0;border-radius:12px;background:#2a3a57;color:#fff}
.tl button b{font-size:22px;line-height:1;font-weight:400}
.tl button small{font-size:11px;font-weight:700;white-space:nowrap}
.tl button.on{background:#2563eb;box-shadow:0 0 0 2px #93c5fd inset}
.tl button.sv{background:#0f766e}
.cw{display:flex;align-items:center;gap:12px;margin-top:10px;padding:0 4px}
html.native body{padding-top:max(env(safe-area-inset-top),40px);padding-bottom:max(env(safe-area-inset-bottom),34px)}
html.native #fabs{bottom:calc(max(env(safe-area-inset-bottom),34px) + 16px)}
html.native #toast{bottom:calc(max(env(safe-area-inset-bottom),34px) + 120px)}
#showbar{background:#0f766e;color:#fff;border:0;padding:8px;font-size:14px;font-weight:700;flex:none}
#cols{display:flex;gap:5px;flex:none}
#cols b{width:28px;height:28px;border-radius:50%;border:3px solid #374151;flex:none}
#cols b.on{border-color:#fff}
#wd{flex:1;min-width:0}
#panes{flex:1;display:flex;min-height:0}
.pane{flex:1;display:flex;flex-direction:column;min-width:0;min-height:0;border:2px solid transparent;background:#6b7280}
.pane.act{border-color:#2563eb}
.ph{display:flex;gap:6px;align-items:center;background:#1e293b;color:#fff;padding:3px 6px;font-size:13px;flex:none}
.ph span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ph button{background:#334155;color:#fff;border:0;border-radius:6px;padding:5px 9px;font-size:14px}
.pb{flex:1;overflow:auto;touch-action:none;padding:8px;position:relative}
.page{position:relative;margin:0 auto 10px;background:#fff;box-shadow:0 1px 6px #0008}
.page canvas{position:absolute;left:0;top:0;width:100%;height:100%}
.dv{flex:none;background:#0f172a;touch-action:none}
#panes.row>.dv{width:12px;cursor:col-resize}
#panes.column>.dv{height:12px;cursor:row-resize}
#fabs{position:fixed;left:14px;bottom:18px;display:flex;flex-direction:column;gap:10px;align-items:center;z-index:50}
.fab{border:0;border-radius:50%;width:52px;height:52px;font-size:22px;background:#374151;color:#fff;box-shadow:0 4px 14px #0008}
.fab.main{width:72px;height:72px;background:#0f766e;font-size:26px;line-height:1;display:flex;flex-direction:column;align-items:center;justify-content:center}
.fab.main span{font-size:12px;font-weight:700;margin-top:2px}
#toast{bottom:110px;max-width:90%;text-align:center;white-space:pre-line}
#toast{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:#000c;color:#fff;padding:10px 16px;border-radius:10px;opacity:0;transition:.3s;pointer-events:none;font-size:14px}
#toast.s{opacity:1}`;
document.head.appendChild(st);
const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('s'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('s'), 5000); };
COLORS.forEach((c, i) => { const b = document.createElement('b'); b.style.background = c; if (!i) b.className = 'on'; b.onclick = () => { S.color = c; [...$('#cols').children].forEach(x => x.classList.toggle('on', x === b)); if (S.tool === 'er') setTool('pen'); }; $('#cols').appendChild(b); });
$('#wd').oninput = e => S.width = e.target.value * 0.00095;
function setTool(t) { S.tool = t; document.querySelectorAll('[data-t]').forEach(b => b.classList.toggle('on', b.dataset.t === t)); }
document.querySelectorAll('[data-t]').forEach(b => b.onclick = () => setTool(b.dataset.t));

/* ---------- Panes ---------- */
function layoutPanes() {
  const c = $('#panes'); c.className = S.orient;
  c.style.flexDirection = S.orient;
  c.innerHTML = '';
  S.panes.forEach((p, i) => {
    if (i) { const d = document.createElement('div'); d.className = 'dv'; wireDivider(d, S.panes[i - 1], p); c.appendChild(d); }
    c.appendChild(p.el); p.el.style.flex = '1 1 0';
  });
  setTimeout(() => S.panes.forEach(p => { fit(p); renderVisible(p); }), 50);
}
function wireDivider(d, a, b) {
  d.onpointerdown = e => {
    d.setPointerCapture(e.pointerId);
    const col = S.orient === 'row', ra = a.el.getBoundingClientRect(), rb = b.el.getBoundingClientRect();
    const sa = col ? ra.width : ra.height, sb = col ? rb.width : rb.height, p0 = col ? e.clientX : e.clientY, dir = col ? -1 : 1;
    d.onpointermove = ev => {
      const dl = ((col ? ev.clientX : ev.clientY) - p0) * (col ? 1 : 1);
      const na = Math.max(80, sa + (col ? dl : dl)), nb = Math.max(80, sb - (col ? dl : dl));
      a.el.style.flex = `0 0 ${na}px`; b.el.style.flex = `0 0 ${nb}px`;
    };
    d.onpointerup = () => { d.onpointermove = null; S.panes.forEach(p => { fit(p); renderVisible(p); }); };
  };
}
function setActive(p) { S.active = p; S.panes.forEach(x => x.el.classList.toggle('act', x === p)); }

function addPane(kind, name, pages, extra = {}) {
  if (S.panes.length >= MAXP) { toast('الحد الأقصى ' + MAXP + ' نوافذ، اقفل واحدة'); return null; }
  const p = { id: ++uid, kind, name, pages, zoom: extra.zoom || 1, bytes: extra.bytes || null, pdf: extra.pdf || null, undo: [] };
  const el = document.createElement('div'); el.className = 'pane';
  el.innerHTML = `<div class="ph"><span></span>${kind !== 'pdf' ? '<button data-p="add">＋ صفحة</button>' : ''}<button data-p="zo">－</button><button data-p="zi">＋</button><button data-p="x">✕</button></div><div class="pb"></div>`;
  $('span', el).textContent = name;
  p.el = el; p.body = $('.pb', el);
  el.querySelectorAll('[data-p]').forEach(b => b.onclick = () => {
    const a = b.dataset.p; setActive(p);
    if (a === 'x') closePane(p);
    if (a === 'zi') setZoom(p, p.zoom * 1.25);
    if (a === 'zo') setZoom(p, p.zoom / 1.25);
    if (a === 'add') { p.pages.push({ w: A4[0], h: A4[1], strokes: [] }); buildPages(p); renderVisible(p); autosave(); p.body.scrollTop = p.body.scrollHeight; }
  });
  el.addEventListener('pointerdown', () => setActive(p), true);
  wireInput(p);
  p.body.addEventListener('scroll', () => requestAnimationFrame(() => renderVisible(p)));
  S.panes.push(p); setActive(p); buildPages(p); layoutPanes(); autosave();
  return p;
}
function closePane(p) {
  S.panes = S.panes.filter(x => x !== p); p.el.remove(); S.active = S.panes[S.panes.length - 1] || null; setActive(S.active); layoutPanes(); autosave();
}
function setZoom(p, z) { p.zoom = Math.min(5, Math.max(0.5, z)); fit(p); clearTimeout(p.zt); p.zt = setTimeout(() => { p.pages.forEach(g => g.dirty = true); renderVisible(p); autosave(); }, 200); }
function baseW(p) { return Math.max(100, p.body.clientWidth - 16); }
function buildPages(p) {
  p.body.innerHTML = '';
  p.pages.forEach((g, i) => {
    const d = document.createElement('div'); d.className = 'page';
    d.innerHTML = '<canvas class="bg"></canvas><canvas class="ink"></canvas>';
    g.el = d; g.bg = $('.bg', d); g.ink = $('.ink', d); g.dirty = true; g.i = i; p.body.appendChild(d);
  });
  fit(p);
}
function fit(p) {
  const w = baseW(p) * p.zoom;
  p.pages.forEach(g => { g.el.style.width = w + 'px'; g.el.style.height = w * g.h / g.w + 'px'; });
}
function renderVisible(p) {
  const r = p.body.getBoundingClientRect();
  p.pages.forEach(g => {
    const q = g.el.getBoundingClientRect();
    if (q.bottom > r.top - 500 && q.top < r.bottom + 500) { if (g.dirty) renderPage(p, g); }
  });
}
async function renderPage(p, g) {
  g.dirty = false;
  const cw = g.el.clientWidth, dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.round(cw * dpr), H = Math.round(cw * g.h / g.w * dpr);
  g.bg.width = g.ink.width = W; g.bg.height = g.ink.height = H;
  const ctx = g.bg.getContext('2d');
  if (p.kind === 'pdf') {
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    try {
      const pg = await p.pdf.getPage(g.i + 1);
      if (g.task) { try { g.task.cancel(); } catch (e) { } }
      g.task = pg.render({ canvasContext: ctx, viewport: pg.getViewport({ scale: W / g.w }) });
      await g.task.promise;
    } catch (e) { }
  } else {
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    if (p.kind === 'nb') {
      const k = W / g.w; ctx.strokeStyle = '#9db7e0'; ctx.lineWidth = Math.max(1, k * .7);
      for (let y = 80; y < g.h - 30; y += 28) { ctx.beginPath(); ctx.moveTo(30 * k, y * k); ctx.lineTo((g.w - 30) * k, y * k); ctx.stroke(); }
      ctx.strokeStyle = '#e9a0a0'; ctx.beginPath(); ctx.moveTo(70 * k, 0); ctx.lineTo(70 * k, H); ctx.stroke();
    }
  }
  redrawInk(g);
}
function drawStroke(ctx, s, W, H) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = s.c;
  ctx.globalAlpha = s.t === 'hl' ? 0.35 : 1;
  const pts = s.p;
  if (pts.length === 1) { ctx.beginPath(); ctx.fillStyle = s.c; ctx.arc(pts[0][0] * W, pts[0][1] * H, s.w * W / 2, 0, 7); ctx.fill(); }
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], pr = s.t === 'hl' ? 1 : 0.55 + (b[2] ?? .5);
    ctx.lineWidth = s.w * W * pr; ctx.beginPath(); ctx.moveTo(a[0] * W, a[1] * H); ctx.lineTo(b[0] * W, b[1] * H); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
function redrawInk(g) {
  const c = g.ink, x = c.getContext('2d'); x.clearRect(0, 0, c.width, c.height);
  g.strokes.forEach(s => drawStroke(x, s, c.width, c.height));
}

/* ---------- Input: pen draws, finger scrolls / pinch zooms ---------- */
function wireInput(p) {
  const body = p.body, touches = new Map();
  let cur = null, pinch = null, vel = 0, velY = 0, lastT = 0;
  const pos = (e, g) => { const r = g.ink.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
  const pageAt = e => { const el = document.elementFromPoint(e.clientX, e.clientY); const pe = el && el.closest && el.closest('.page'); return p.pages.find(g => g.el === pe); };
  const isPen = e => e.pointerType === 'pen' || e.pointerType === 'mouse' || (S.finger && e.pointerType === 'touch');
  body.addEventListener('pointerdown', e => {
    body.setPointerCapture(e.pointerId);
    if (isPen(e)) {
      const g = pageAt(e) || p.pages.find(x => { const r = x.el.getBoundingClientRect(); return e.clientY >= r.top && e.clientY <= r.bottom; });
      if (!g) return;
      const erase = S.tool === 'er' || (e.buttons & 32);
      cur = { g, erase, removed: [], s: erase ? null : { t: S.tool === 'hl' ? 'hl' : 'pen', c: S.color, w: S.tool === 'hl' ? S.width * 5 : S.width, p: [] } };
      addPt(e);
    } else {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 2) { const [a, b] = [...touches.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: p.zoom }; }
      vel = velY = 0; lastT = performance.now();
    }
  });
  function addPt(e) {
    if (!cur) return; const g = cur.g;
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    (evs.length ? evs : [e]).forEach(ev => {
      const [x, y] = pos(ev, g);
      if (cur.erase) {
        const W = g.ink.getBoundingClientRect().width, H = g.ink.getBoundingClientRect().height, rad = 14;
        g.strokes = g.strokes.filter((s, i) => {
          const hit = s.p.some(q => Math.hypot((q[0] - x) * W, (q[1] - y) * H) < rad + s.w * W);
          if (hit) cur.removed.push(s); return !hit;
        });
        redrawInk(g);
      } else {
        const l = cur.s.p[cur.s.p.length - 1], pr = ev.pointerType === 'pen' ? ev.pressure : 0.5;
        if (l && Math.hypot(l[0] - x, l[1] - y) < 0.0015) return;
        cur.s.p.push([+x.toFixed(4), +y.toFixed(4), +pr.toFixed(2)]);
        const c = g.ink, k = c.getContext('2d');
        if (cur.s.p.length === 1) drawStroke(k, cur.s, c.width, c.height);
        else drawStroke(k, { ...cur.s, p: cur.s.p.slice(-2) }, c.width, c.height);
      }
    });
  }
  body.addEventListener('pointermove', e => {
    if (cur && isPen(e)) { addPt(e); return; }
    const t = touches.get(e.pointerId); if (!t) return;
    if (touches.size === 2 && pinch) {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [a, b] = [...touches.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      const oldW = baseW(p) * p.zoom, cx = body.scrollLeft + body.clientWidth / 2, cy = body.scrollTop + body.clientHeight / 2;
      p.zoom = Math.min(5, Math.max(0.5, pinch.z * d / pinch.d)); fit(p);
      const k = (baseW(p) * p.zoom) / oldW; body.scrollLeft = cx * k - body.clientWidth / 2; body.scrollTop = cy * k - body.clientHeight / 2;
      clearTimeout(p.zt); p.zt = setTimeout(() => { p.pages.forEach(g => g.dirty = true); renderVisible(p); autosave(); }, 250);
      return;
    }
    const dx = e.clientX - t.x, dy = e.clientY - t.y; t.x = e.clientX; t.y = e.clientY;
    body.scrollLeft -= dx; body.scrollTop -= dy;
    const now = performance.now(), dt = Math.max(1, now - lastT); lastT = now; vel = -dx / dt * 16; velY = -dy / dt * 16;
  });
  const end = e => {
    if (cur) {
      const g = cur.g;
      if (cur.erase) { if (cur.removed.length) p.undo.push({ t: 'del', g, s: cur.removed }); }
      else if (cur.s.p.length) { g.strokes.push(cur.s); p.undo.push({ t: 'add', g, s: cur.s }); }
      cur = null; autosave(); return;
    }
    if (touches.delete(e.pointerId) && touches.size === 0 && !pinch) {
      const f = () => { if (Math.abs(vel) < .3 && Math.abs(velY) < .3) return; body.scrollLeft += vel; body.scrollTop += velY; vel *= .94; velY *= .94; requestAnimationFrame(f); };
      f();
    }
    if (touches.size < 2) pinch = null;
  };
  body.addEventListener('pointerup', end); body.addEventListener('pointercancel', end);
  body.addEventListener('wheel', e => { if (e.ctrlKey) { e.preventDefault(); setZoom(p, p.zoom * (e.deltaY < 0 ? 1.1 : .9)); } }, { passive: false });
}

/* ---------- Actions ---------- */
async function openPdfFiles(files) {
  for (const f of files) {
    try {
      const bytes = await f.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: bytes.slice(0) }).promise;
      const pages = [];
      for (let i = 1; i <= pdf.numPages; i++) { const v = (await pdf.getPage(i)).getViewport({ scale: 1 }); pages.push({ w: v.width, h: v.height, strokes: [] }); }
      if (!addPane('pdf', f.name, pages, { bytes, pdf })) break;
    } catch (e) { toast('تعذّر فتح ' + f.name); }
  }
}
function stamp() { const d = new Date(); return d.toISOString().slice(0, 16).replace(/[:T]/g, '-'); }
async function exportPdf(p) {
  let doc;
  if (p.kind === 'pdf') doc = await PDFDocument.load(p.bytes, { ignoreEncryption: true });
  else {
    doc = await PDFDocument.create();
    p.pages.forEach(g => {
      const pg = doc.addPage([g.w, g.h]);
      if (p.kind === 'nb') {
        for (let y = 80; y < g.h - 30; y += 28) pg.drawLine({ start: { x: 30, y: g.h - y }, end: { x: g.w - 30, y: g.h - y }, thickness: .6, color: rgb(.62, .72, .88) });
        pg.drawLine({ start: { x: 70, y: 0 }, end: { x: 70, y: g.h }, thickness: .6, color: rgb(.91, .63, .63) });
      }
    });
  }
  const pgs = doc.getPages();
  p.pages.forEach((g, i) => {
    const pg = pgs[i]; if (!pg || !g.strokes.length) return;
    const { width: w0, height: h0 } = pg.getSize(), r = ((pg.getRotation().angle % 360) + 360) % 360;
    const vw = r % 180 ? h0 : w0, vh = r % 180 ? w0 : h0;
    const map = (u, v) => { const X = u * vw, Y = v * vh; return r === 0 ? { x: X, y: h0 - Y } : r === 90 ? { x: Y, y: X } : r === 180 ? { x: w0 - X, y: Y } : { x: w0 - Y, y: h0 - X }; };
    g.strokes.forEach(s => {
      const col = s.c, c = rgb(parseInt(col.slice(1, 3), 16) / 255, parseInt(col.slice(3, 5), 16) / 255, parseInt(col.slice(5, 7), 16) / 255);
      const op = s.t === 'hl' ? .35 : 1;
      if (s.p.length === 1) { const a = map(s.p[0][0], s.p[0][1]); pg.drawCircle({ x: a.x, y: a.y, size: s.w * vw / 2, color: c, opacity: op }); return; }
      for (let k = 1; k < s.p.length; k++) {
        const a = map(s.p[k - 1][0], s.p[k - 1][1]), b = map(s.p[k][0], s.p[k][1]);
        pg.drawLine({ start: a, end: b, thickness: s.w * vw * (s.t === 'hl' ? 1 : .55 + (s.p[k][2] ?? .5)), color: c, opacity: op, lineCap: LineCapStyle.Round });
      }
    });
  });
  return await doc.save();
}
async function savePane(share) {
  const p = S.active; if (!p) return toast('افتح ملف أو مسودة أولاً');
  toast('جارٍ الحفظ…');
  try {
    const out = await exportPdf(p);
    const base = p.kind === 'pdf' ? p.name.replace(/\.pdf$/i, '') + '-معدّل' : (p.kind === 'nb' ? 'نوت-بوك-' : 'مسودة-') + stamp();
    if (Capacitor.isNativePlatform()) {
      let b64 = ''; const CH = 0x8000;
      for (let i = 0; i < out.length; i += CH) b64 += String.fromCharCode.apply(null, out.subarray(i, i + CH));
      b64 = btoa(b64);
      try {
        if (share) throw new Error('share');
        await Filesystem.writeFile({ path: 'EngineerPen/' + base + '.pdf', data: b64, directory: Directory.Documents, recursive: true });
        toast('✅ تم الحفظ في: الملفات ← Documents ← EngineerPen\n' + base + '.pdf');
      } catch (e) {
        const r = await Filesystem.writeFile({ path: base + '.pdf', data: b64, directory: Directory.Cache });
        await Share.share({ title: base + '.pdf', files: [r.uri], dialogTitle: 'حفظ أو مشاركة PDF' });
      }
    } else {
      const blob = new Blob([out], { type: 'application/pdf' }), a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = base + '.pdf'; document.body.appendChild(a); a.click(); a.remove();
      toast('تم الحفظ في التنزيلات: ' + base + '.pdf');
    }
  } catch (e) { toast('فشل الحفظ: ' + e.message); }
}
function undo() {
  const p = S.active; if (!p) return; const o = p.undo.pop(); if (!o) return;
  if (o.t === 'add') o.g.strokes = o.g.strokes.filter(s => s !== o.s); else o.g.strokes.push(...o.s);
  redrawInk(o.g); autosave();
}
const fileIn = $('#file'); fileIn.onchange = () => { openPdfFiles([...fileIn.files]); fileIn.value = ''; };
document.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
  const a = b.dataset.a;
  if (a === 'open') fileIn.click();
  if (a === 'draft') addPane('draft', 'مسودة', [{ w: A4[0], h: A4[1], strokes: [] }]);
  if (a === 'nb') addPane('nb', 'نوت بوك', [{ w: A4[0], h: A4[1], strokes: [] }]);
  if (a === 'finger') { S.finger = !S.finger; b.querySelector('small').textContent = 'إصبع: ' + (S.finger ? 'نعم' : 'لا'); b.classList.toggle('on', S.finger); }
  if (a === 'undo') undo();
  if (a === 'save') savePane(false);
  if (a === 'share') savePane(true);
  if (a === 'hide') { $('#bar').classList.add('h'); $('#showbar').hidden = false; }
  if (a === 'show') { $('#bar').classList.remove('h'); $('#showbar').hidden = true; }
  if (a === 'orient') { S.orient = S.orient === 'column' ? 'row' : 'column'; layoutPanes(); autosave(); }
  if (a === 'fs') { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => { }); }
});
window.addEventListener('resize', () => S.panes.forEach(p => { fit(p); p.pages.forEach(g => g.dirty = true); renderVisible(p); }));
window.addEventListener('beforeunload', persist);

/* ---------- Restore ---------- */
(async () => {
  const s = await kvGet('state');
  if (s && s.panes && s.panes.length) {
    S.orient = s.orient || 'column';
    for (const q of s.panes) {
      let pdf = null;
      if (q.kind === 'pdf' && q.bytes) { try { pdf = await pdfjs.getDocument({ data: q.bytes.slice(0) }).promise; } catch (e) { continue; } }
      addPane(q.kind, q.name, q.pages, { bytes: q.bytes, pdf, zoom: q.zoom });
    }
    toast('تم استرجاع شغلك السابق');
  } else addPane('draft', 'مسودة', [{ w: A4[0], h: A4[1], strokes: [] }]);
})();
