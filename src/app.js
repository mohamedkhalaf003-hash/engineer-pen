import HERO from './hero.js';
import { initSync } from './sync.js';
import { strokesToCanvas, recognize } from './ocr.js';
import { REVIEW, initProj, stampImg, stampData, fitText, makeText, wrap, fontOf, fontsReady } from './proj.js';
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
const S = { nstyle: 'typed', sel: null, mode: 'draw', lang: 'ara+eng', tool: 'pen', color: COLORS[0], width: 0.0035, finger: false, orient: 'column', panes: [], active: null };
let uid = 0;

/* ---------- IndexedDB autosave ---------- */
const idb = () => new Promise((res, rej) => { const r = indexedDB.open('engpen', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function kvSet(k, v) { try { const db = await idb(); db.transaction('kv', 'readwrite').objectStore('kv').put(v, k); } catch (e) { } }
async function kvGet(k) { try { const db = await idb(); return await new Promise(r => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => r(q.result); q.onerror = () => r(null); }); } catch (e) { return null; } }
let DIRTY = false, READY = false, PJ = null;
const snap = () => ({ orient: S.orient, panes: S.panes.map(p => ({ kind: p.kind, name: p.name, proj: p.proj || null, bytes: p.bytes || null, zoom: p.zoom, pages: p.pages.map(g => ({ w: g.w, h: g.h, strokes: g.strokes })) })) });
const sy = REVIEW ? { touch() { }, soon() { }, applying: false, setup() { } } : initSync({ snapshot: snap, kvGet, kvSet, toast: m => toast(m) });
let saveT; const autosave = () => { if (READY) { DIRTY = true; sy.touch(); } clearTimeout(saveT); saveT = setTimeout(persist, 900); };
function persist() {
  if (sy.applying) return;
  kvSet('state', snap());
  if (DIRTY) { DIRTY = false; localStorage.ep_mt = String(Date.now()); sy.soon(); }
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
  <button data-a="proj" class="sv"><b>🗂</b><small>مشاريع</small></button>
 </div></section>
 <section class="bx"><h3>🖊 ملاحظات وأختام</h3><div class="tl">
  <button data-t="txt"><b>🔤</b><small>نص</small></button>
  <button data-t="sel"><b>👆</b><small>تحديد/نقل</small></button>
  <button data-a="nstyle" id="bns"><b>Aa</b><small>مطبوع</small></button>
  <button data-a="stamp"><b>🖋</b><small>ختم/توقيع</small></button>
  <button data-a="itbig"><b>＋</b><small>تكبير</small></button>
  <button data-a="itsmall"><b>－</b><small>تصغير</small></button>
  <button data-a="itedit"><b>✎</b><small>تعديل</small></button>
  <button data-a="itdel"><b>🗑</b><small>حذف</small></button>
 </div></section>
 <section class="bx"><h3>✏️ أدوات الرسم</h3><div class="tl">
  <button data-t="pen" class="on"><b>✏️</b><small>قلم</small></button>
  <button data-t="hl"><b>🖍</b><small>هايلايت</small></button>
  <button data-a="mode" id="bm"><b>✍️</b><small>القلم: رسم</small></button>
  <button data-a="lang" id="bl" hidden><b>🔤</b><small>لغة: عربي+EN</small></button>
  <button data-t="er"><b>🧽</b><small>ممحاة</small></button>
  <button data-a="undo"><b>↶</b><small>تراجع</small></button>
  <button data-a="finger" id="bf"><b>☝️</b><small>إصبع: لا</small></button>
 </div><div class="cw"><span id="cols"></span><input id="wd" type="range" min="1" max="12" value="4" title="السمك"></div></section>
 <section class="bx"><h3>🖥 العرض</h3><div class="tl">
  <button data-a="orient"><b>⇅</b><small>تقسيم</small></button>
  <button data-a="fs"><b>⛶</b><small>ملء الشاشة</small></button>
  <button data-a="hide"><b>▲</b><small>إخفاء الأدوات</small></button>
  <button data-a="about"><b><img class="av" alt=""></b><small>الرئيسية</small></button>
  <button data-a="sync"><b>🔗</b><small>مزامنة</small></button>
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
#toast.s{opacity:1}
.av{width:28px;height:28px;border-radius:50%;object-fit:cover;object-position:50% 20%;display:block;border:2px solid #93c5fd}
#splash{position:fixed;inset:0;z-index:999;background:#0b1220;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:16px;transition:opacity .5s}
#splash.o{opacity:0;pointer-events:none}
#splash img{width:min(94vw,78vh);max-height:78vh;aspect-ratio:1/1.04;object-fit:cover;object-position:50% 20%;border-radius:24px;box-shadow:0 10px 40px #000a;border:1px solid #2b3a55}
#splash b{color:#fff;font-size:26px;letter-spacing:.5px}#splash small{color:#93a3bf;font-size:14px}`;
if (REVIEW) st.textContent += `
html,body{background:#eef1f6}
#bar{background:#fff;border-bottom:1px solid #d5dbe6}
#bar .bx h3{color:#475569}
#bar button{background:#f1f5f9!important;color:#0f172a!important;border:1px solid #d5dbe6!important;box-shadow:none!important}
#bar button.on{background:#dbeafe!important;border-color:#2563eb!important}
#bar button.sv{background:#e6f4f1!important}
#showbar{background:#fff!important;color:#0f172a!important}
.pane{background:#dfe4ec}
#toast{background:#0f172ae6}
[data-a=about],[data-a=sync],[data-a=mode],[data-a=lang],[data-a=nb]{display:none!important}`;
document.head.appendChild(st);
document.querySelectorAll('.av').forEach(i => { i.src = HERO; });
function splash(auto) {
  const d = document.createElement('div'); d.id = 'splash';
  d.innerHTML = `<img src="${HERO}" alt=""><b>Engineer Pen</b><small>اضغط للدخول</small>`;
  document.body.appendChild(d);
  const close = () => { d.classList.add('o'); setTimeout(() => d.remove(), 600); };
  d.onclick = close; if (auto) setTimeout(close, 2600);
}
if (!REVIEW) splash(true);
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
  const p = { id: ++uid, kind, name, pages, proj: extra.proj || null, zoom: extra.zoom || 1, bytes: extra.bytes || null, pdf: extra.pdf || null, undo: [] };
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
  const cw = g.el.clientWidth, dpr = Math.min(3, window.devicePixelRatio || 1), W = Math.round(cw * dpr), H = Math.round(cw * g.h / g.w * dpr);
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
const LN = { 'ara+eng': 'عربي+EN', eng: 'EN', ara: 'عربي' };
function drawText(ctx, s, W, H, ox = 0, oy = 0) {
  const fs = s.fs * W, lh = fs * 1.25; ctx.save(); ctx.fillStyle = s.c; ctx.font = fontOf(s, fs);
  ctx.direction = s.r ? 'rtl' : 'ltr'; ctx.textAlign = s.r ? 'right' : 'left'; ctx.textBaseline = 'top';
  const X = (s.r ? s.x + s.w : s.x) * W - ox; s.l.forEach((ln, i) => ctx.fillText(ln, X, s.y * H + i * lh - oy)); ctx.restore();
}
function drawStroke(ctx, s, W, H) {
  if (s.t === 'tx') return drawText(ctx, s, W, H);
  if (s.t === 'im') { const im = stampImg(s.sid, () => S.panes.forEach(q => q.pages.forEach(g => g.ink && redrawInk(g)))); if (im) ctx.drawImage(im, s.x * W, s.y * H, s.w * W, s.h * H); return; }
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
  if (S.sel && S.sel.g === g && g.strokes.includes(S.sel.s)) { const s = S.sel.s; x.save(); x.strokeStyle = '#2563eb'; x.lineWidth = Math.max(2, c.width / 300); x.setLineDash([8, 6]); x.strokeRect(s.x * c.width - 4, s.y * c.height - 4, s.w * c.width + 8, s.h * c.height + 8); x.restore(); }
}

/* ---------- Input: pen draws, finger scrolls / pinch zooms ---------- */
const hitItem = (g, x, y) => { for (let i = g.strokes.length - 1; i >= 0; i--) { const s = g.strokes[i]; if ((s.t === 'tx' || s.t === 'im') && x >= s.x - .01 && x <= s.x + s.w + .01 && y >= s.y - .01 && y <= s.y + s.h + .01) return s; } return null; };
function addNote(p, g, x, y) {
  const t = prompt('اكتب الملاحظة:'); if (!t || !t.trim()) return;
  const s = makeText(g, t.trim(), 0, 0, { f: S.nstyle === 'hand' ? 'h' : undefined, c: S.color });
  s.x = +Math.min(.99 - s.w, Math.max(.005, s.r ? x - s.w : x)).toFixed(4); s.y = +Math.min(.99 - s.h, Math.max(.005, y)).toFixed(4);
  g.strokes.push(s); p.undo.push({ t: 'add', g, s }); S.sel = { g, s }; redrawInk(g); autosave(); setTool('sel');
}
async function placeStamp(p, g, x, y) {
  const st = S.stampPending; if (!st) { setTool('sel'); return; }
  const w = .2, s = { t: 'im', sid: st.id, ar: st.ar, w, h: +(w * st.ar * g.w / g.h).toFixed(4), x: 0, y: 0 };
  s.x = +Math.min(.99 - s.w, Math.max(.005, x - s.w / 2)).toFixed(4); s.y = +Math.min(.99 - s.h, Math.max(.005, y - s.h / 2)).toFixed(4);
  g.strokes.push(s); p.undo.push({ t: 'add', g, s }); S.sel = { g, s }; S.stampPending = null; setTool('sel'); redrawInk(g); autosave();
}
function itemAct(a) {
  const q = S.sel; if (!q || !q.g.strokes.includes(q.s)) return toast('اختار عنصر بأداة «تحديد» الأول');
  const { g, s } = q;
  if (a === 'itdel') { g.strokes = g.strokes.filter(x => x !== s); S.active && S.active.undo.push({ t: 'del', g, s: [s] }); S.sel = null; }
  if (a === 'itedit' && s.t === 'tx') { const t = prompt('عدّل النص:', s.l.join(' ')); if (!t) return; s.l = wrap(t, s.fs, Math.max(.3, s.w), s.f); s.r = (t.match(/[\u0600-\u06FF]/g) || []).length > (t.match(/[A-Za-z]/g) || []).length ? 1 : 0; fitText(g, s); }
  if (a === 'itbig' || a === 'itsmall') {
    const k = a === 'itbig' ? 1.12 : 1 / 1.12, right = s.x + s.w;
    if (s.t === 'tx') { s.fs = +(s.fs * k).toFixed(4); fitText(g, s); if (s.r) s.x = +(right - s.w).toFixed(4); }
    else { s.w = +(s.w * k).toFixed(4); s.h = +(s.w * s.ar * g.w / g.h).toFixed(4); }
  }
  redrawInk(g); autosave();
}
function wireInput(p) {
  const body = p.body, touches = new Map();
  let cur = null, pinch = null, vel = 0, velY = 0, lastT = 0, drag = null;
  const pos = (e, g) => { const r = g.ink.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
  const pageAt = e => { const el = document.elementFromPoint(e.clientX, e.clientY); const pe = el && el.closest && el.closest('.page'); return p.pages.find(g => g.el === pe); };
  const isPen = e => e.pointerType === 'pen' || e.pointerType === 'mouse' || (S.finger && e.pointerType === 'touch');
  body.addEventListener('pointerdown', e => {
    body.setPointerCapture(e.pointerId);
    if (isPen(e)) {
      const g = pageAt(e) || p.pages.find(x => { const r = x.el.getBoundingClientRect(); return e.clientY >= r.top && e.clientY <= r.bottom; });
      if (!g) return;
      if (S.tool === 'txt' || S.tool === 'sel' || S.tool === 'stp') {
        const [x, y] = pos(e, g);
        if (S.tool === 'txt') { addNote(p, g, x, y); return; }
        if (S.tool === 'stp') { placeStamp(p, g, x, y); return; }
        const it = hitItem(g, x, y), old = S.sel; S.sel = it ? { g, s: it } : null;
        if (it) drag = { g, s: it, dx: x - it.x, dy: y - it.y };
        if (old && old.g !== g) redrawInk(old.g); redrawInk(g); return;
      }
      const erase = S.tool === 'er' || (e.buttons & 32);
      cur = { g, erase, removed: [], s: erase ? null : { k: S.mode === 'type' && S.tool === 'pen' ? 1 : undefined, t: S.tool === 'hl' ? 'hl' : 'pen', c: S.color, w: S.tool === 'hl' ? S.width * 5 : S.width, p: [] } };
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
          const hit = (s.t === 'tx' || s.t === 'im') ? (x >= s.x - .005 && x <= s.x + s.w + .005 && y >= s.y - .005 && y <= s.y + s.h + .005) : s.p.some(q => Math.hypot((q[0] - x) * W, (q[1] - y) * H) < rad + s.w * W);
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
    if (drag && isPen(e)) { const [x, y] = pos(e, drag.g); drag.s.x = +Math.min(.99 - drag.s.w, Math.max(.005, x - drag.dx)).toFixed(4); drag.s.y = +Math.min(.99 - drag.s.h, Math.max(.005, y - drag.dy)).toFixed(4); redrawInk(drag.g); return; }
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
    if (drag) { drag = null; autosave(); return; }
    if (cur) {
      const g = cur.g;
      if (cur.erase) { if (cur.removed.length) p.undo.push({ t: 'del', g, s: cur.removed }); }
      else if (cur.s.p.length) { g.strokes.push(cur.s); p.undo.push({ t: 'add', g, s: cur.s }); if (cur.s.k) schedConv(g); }
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
async function openBytes(bytes, name, proj) {
  try {
    const pdf = await pdfjs.getDocument({ data: bytes.slice(0), cMapUrl: 'pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: 'pdfjs/standard_fonts/', useSystemFonts: true, disableFontFace: true }).promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) { const v = (await pdf.getPage(i)).getViewport({ scale: 1 }); pages.push({ w: v.width, h: v.height, strokes: [] }); }
    return addPane('pdf', name, pages, { bytes, pdf, proj });
  } catch (e) { toast('تعذّر فتح ' + name); return null; }
}
async function openPdfFiles(files) { for (const f of files) { if (!await openBytes(await f.arrayBuffer(), f.name)) break; } }
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
  const pgs = doc.getPages(), imgs = [];
  p.pages.forEach((g, i) => {
    const pg = pgs[i]; if (!pg || !g.strokes.length) return;
    const { width: w0, height: h0 } = pg.getSize(), r = ((pg.getRotation().angle % 360) + 360) % 360;
    const vw = r % 180 ? h0 : w0, vh = r % 180 ? w0 : h0;
    const map = (u, v) => { const X = u * vw, Y = v * vh; return r === 0 ? { x: X, y: h0 - Y } : r === 90 ? { x: Y, y: X } : r === 180 ? { x: w0 - X, y: Y } : { x: w0 - Y, y: h0 - X }; };
    g.strokes.forEach(s => {
      const col = s.c || '#000000', c = rgb(parseInt(col.slice(1, 3), 16) / 255, parseInt(col.slice(3, 5), 16) / 255, parseInt(col.slice(5, 7), 16) / 255);
      if (s.t === 'tx') {
        if (r) return; const cv = document.createElement('canvas'), K = 3, Wc = vw * K, Hc = vh * K; cv.width = Math.ceil(s.w * Wc) + 8; cv.height = Math.ceil(s.h * Hc) + 8;
        drawText(cv.getContext('2d'), s, Wc, Hc, s.x * Wc - 4, s.y * Hc - 4); imgs.push([pg, cv, map(s.x, s.y + s.h), s.w * vw + 8 / K, s.h * vh + 8 / K]); return;
      }
      if (s.t === 'im') { if (r) return; imgs.push([pg, { png: stampData(s.sid) }, map(s.x, s.y + s.h), s.w * vw, s.h * vh]); return; }
      const op = s.t === 'hl' ? .35 : 1;
      if (s.p.length === 1) { const a = map(s.p[0][0], s.p[0][1]); pg.drawCircle({ x: a.x, y: a.y, size: s.w * vw / 2, color: c, opacity: op }); return; }
      for (let k = 1; k < s.p.length; k++) {
        const a = map(s.p[k - 1][0], s.p[k - 1][1]), b = map(s.p[k][0], s.p[k][1]);
        pg.drawLine({ start: a, end: b, thickness: s.w * vw * (s.t === 'hl' ? 1 : .55 + (s.p[k][2] ?? .5)), color: c, opacity: op, lineCap: LineCapStyle.Round });
      }
    });
  });
  for (const [pg, cv, a, w, h] of imgs) { if (cv.png) { if (!cv.png) continue; const im = await doc.embedPng(await (await fetch(cv.png)).arrayBuffer()); pg.drawImage(im, { x: a.x, y: a.y, width: w, height: h }); continue; } const im = await doc.embedPng(await new Promise(r => cv.toBlob(b => b.arrayBuffer().then(r), 'image/png'))); pg.drawImage(im, { x: a.x - 4 / 3, y: a.y - 4 / 3, width: w, height: h }); }
  return await doc.save();
}
async function deliver(out, base, share) {
  if (Capacitor.isNativePlatform()) {
    let b64 = ''; const CH = 0x8000;
    for (let i = 0; i < out.length; i += CH) b64 += String.fromCharCode.apply(null, out.subarray(i, i + CH));
    b64 = btoa(b64);
    try {
      if (share) throw new Error('share');
      await Filesystem.writeFile({ path: (REVIEW ? 'MashariReview/' : 'EngineerPen/') + base + '.pdf', data: b64, directory: Directory.Documents, recursive: true });
      toast('✅ تم الحفظ في: الملفات ← Documents ← ' + (REVIEW ? 'MashariReview' : 'EngineerPen') + '\n' + base + '.pdf');
    } catch (e) {
      const r = await Filesystem.writeFile({ path: base + '.pdf', data: b64, directory: Directory.Cache });
      await Share.share({ title: base + '.pdf', files: [r.uri], dialogTitle: 'حفظ أو مشاركة PDF' });
    }
  } else {
    const blob = new Blob([out], { type: 'application/pdf' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = base + '.pdf'; document.body.appendChild(a); a.click(); a.remove();
    toast('تم الحفظ في التنزيلات: ' + base + '.pdf');
  }
}
async function savePane(share) {
  const p = S.active; if (!p) return toast('افتح ملف أو مسودة أولاً');
  toast('جارٍ الحفظ…');
  try {
    flushConv();
    const out = await exportPdf(p);
    const base = p.kind === 'pdf' ? p.name.replace(/\.pdf$/i, '') + (p.proj && p.proj.review ? '' : '-معدّل') : (p.kind === 'nb' ? 'نوت-بوك-' : 'مسودة-') + stamp();
    if (p.proj && PJ) { await PJ.addOutput(p.proj.pid, base + '.pdf', out); toast('📤 اتحفظ في مخرجات المشروع'); if (!share) return; }
    await deliver(out, base, share);
  } catch (e) { toast('فشل الحفظ: ' + e.message); }
}
let convT = null;
function schedConv(g) { clearTimeout(convT); convT = setTimeout(() => convert(g), 1500); }
async function convert(g, quiet) {
  const old = g.strokes.filter(s => s.k); if (!old.length || g.busy) return; const p = S.active;
  g.busy = true;
  try {
    const W = g.ink.width, H = g.ink.height, { canvas, x0, y0, bw, bh } = strokesToCanvas(old, W, H);
    if (!quiet) toast('⏳ جارٍ التحويل لنص…');
    const r = await recognize(canvas, S.lang);
    const lines = r.text.split('\n').map(t => t.trim()).filter(Boolean);
    const left = g.strokes.filter(s => s.k); // strokes added while recognizing stay pending
    const still = left.filter(s => !old.includes(s));
    if (!lines.length || r.conf < 25) { old.forEach(s => delete s.k); toast('ما قدرتش أقرأ الخط — سبته رسم (ثقة ' + Math.round(r.conf) + '%)'); }
    else {
      const rtl = (r.text.match(/[\u0600-\u06FF]/g) || []).length > (r.text.match(/[A-Za-z]/g) || []).length;
      const fs = Math.min(.05, Math.max(.012, bh / W / lines.length / 1.25 * .9));
      const ctx = g.ink.getContext('2d'); ctx.save(); ctx.font = fs * W + 'px Tahoma,Arial,sans-serif';
      const tw = Math.max(...lines.map(l => ctx.measureText(l).width)) / W; ctx.restore();
      const t = { t: 'tx', c: old[0].c, l: lines, r: rtl ? 1 : 0, fs: +fs.toFixed(4), x: +(rtl ? (x0 + bw) / W - tw : x0 / W).toFixed(4), y: +(y0 / H).toFixed(4), w: +tw.toFixed(4), h: +(lines.length * fs * 1.25 * W / H).toFixed(4) };
      g.strokes = g.strokes.filter(s => !old.includes(s)); g.strokes.push(t);
      if (p) p.undo.push({ t: 'conv', g, old, neu: t });
      toast('✅ ' + lines.join(' / '));
    }
    redrawInk(g); autosave();
    if (still.length) schedConv(g);
  } catch (e) { old.forEach(s => delete s.k); toast('فشل التحويل: ' + e.message); redrawInk(g); }
  g.busy = false;
}
function flushConv() { clearTimeout(convT); (S.active ? S.active.pages : []).forEach(g => { if (g.strokes.some(s => s.k)) convert(g, true); }); }
function undo() {
  const p = S.active; if (!p) return; const o = p.undo.pop(); if (!o) return;
  if (o.t === 'add') o.g.strokes = o.g.strokes.filter(s => s !== o.s); else if (o.t === 'conv') { o.g.strokes = o.g.strokes.filter(s => s !== o.neu); o.g.strokes.push(...o.old); } else o.g.strokes.push(...o.s);
  redrawInk(o.g); autosave();
}
const fileIn = $('#file'); fileIn.onchange = () => { openPdfFiles([...fileIn.files]); fileIn.value = ''; };
document.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
  const a = b.dataset.a;
  if (a === 'mode') { flushConv(); S.mode = S.mode === 'draw' ? 'type' : 'draw'; b.querySelector('small').textContent = 'القلم: ' + (S.mode === 'draw' ? 'رسم' : 'كتابة'); b.classList.toggle('on', S.mode === 'type'); $('#bl').hidden = S.mode !== 'type'; if (S.mode === 'type') { setTool('pen'); toast('وضع الكتابة: اكتب بالقلم وبعد ثانية ونص هيتحول لحروف مطبوعة'); } }
  if (a === 'lang') { const k = ['ara+eng', 'eng', 'ara']; S.lang = k[(k.indexOf(S.lang) + 1) % 3]; b.querySelector('small').textContent = 'لغة: ' + LN[S.lang]; }
  if (a === 'proj') PJ ? PJ.open() : toast('لحظة…');
  if (a === 'nstyle') { S.nstyle = S.nstyle === 'typed' ? 'hand' : 'typed'; b.querySelector('small').textContent = S.nstyle === 'typed' ? 'مطبوع' : 'خط يد'; toast(S.nstyle === 'typed' ? 'الملاحظات الجديدة: كتابة مطبوعة' : 'الملاحظات الجديدة: بخط يد'); }
  if (a === 'stamp' && PJ) PJ.pickStamp().then(st => { if (st) { S.stampPending = st; setTool('stp'); toast('اضغط على الصفحة في مكان الختم'); } });
  if (a === 'itbig' || a === 'itsmall' || a === 'itedit' || a === 'itdel') itemAct(a);
  if (a === 'open') fileIn.click();
  if (a === 'draft') addPane('draft', 'مسودة', [{ w: A4[0], h: A4[1], strokes: [] }]);
  if (a === 'nb') addPane('nb', 'نوت بوك', [{ w: A4[0], h: A4[1], strokes: [] }]);
  if (a === 'finger') { S.finger = !S.finger; b.querySelector('small').textContent = 'إصبع: ' + (S.finger ? 'نعم' : 'لا'); b.classList.toggle('on', S.finger); }
  if (a === 'undo') undo();
  if (a === 'save') savePane(false);
  if (a === 'share') savePane(true);
  if (a === 'about') splash(false);
  if (a === 'sync') sy.setup();
  if (a === 'hide') { $('#bar').classList.add('h'); $('#showbar').hidden = false; }
  if (a === 'show') { $('#bar').classList.remove('h'); $('#showbar').hidden = true; }
  if (a === 'orient') { S.orient = S.orient === 'column' ? 'row' : 'column'; layoutPanes(); autosave(); }
  if (a === 'fs') { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => { }); }
});
window.addEventListener('resize', () => S.panes.forEach(p => { fit(p); p.pages.forEach(g => g.dirty = true); renderVisible(p); }));
window.addEventListener('beforeunload', persist);

/* ---------- Restore ---------- */
async function checkUpdate() {
  try {
    const cur = (await (await fetch('version.json', { cache: 'no-store' })).json()).v; if (!cur) return;
    const el = /Electron/i.test(navigator.userAgent), pre = REVIEW ? (el ? 'review-desktop-v1.' : 'review-v1.') : (el ? 'engineerpen-desktop-v1.' : 'v1.'), nm = REVIEW ? 'مراجعة مشاريع' : 'Engineer Pen';
    const rs = await (await fetch('https://api.github.com/repos/mohamedkhalaf003-hash/engineer-pen/releases?per_page=60')).json();
    let best = null; for (const r of rs) { if (!r.tag_name.startsWith(pre)) continue; const n = +r.tag_name.slice(pre.length); if (n > cur && (!best || n > best.n)) best = { n, r }; }
    if (!best) return; const as = best.r.assets.find(a => el ? /Setup\.exe$/.test(a.name) : /\.apk$/.test(a.name)); if (!as) return;
    if (confirm('فيه تحديث جديد لـ ' + nm + ' (نسخة ' + best.n + '). تنزيله وتثبيته فوق القديم دلوقتي؟ (شغلك محفوظ)')) { if (el && window.desktop && window.desktop.update) { toast('⏳ جارٍ تنزيل التحديث…'); window.desktop.update(as.browser_download_url); } else if (REVIEW && /android/i.test(navigator.userAgent)) location.href = 'microsoft-edge:' + as.browser_download_url; else window.open(as.browser_download_url, '_blank'); }
  } catch (e) { }
}
setTimeout(checkUpdate, 6000);
initProj({ S, toast: m => toast(m), kvGet, kvSet, openBytes, redraw: g => redrawInk(g), autosave, deliver }).then(x => { PJ = x; if (REVIEW) setTimeout(() => x.open(), 300); });
fontsReady.then(() => setTimeout(() => S.panes.forEach(q => q.pages.forEach(g => g.ink && redrawInk(g))), 600));
(async () => {
  const s = await kvGet('state');
  if (s && s.panes && s.panes.length) {
    S.orient = s.orient || 'column';
    for (const q of s.panes) {
      let pdf = null;
      if (q.kind === 'pdf' && q.bytes) { try { pdf = await pdfjs.getDocument({ data: q.bytes.slice(0), cMapUrl: 'pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: 'pdfjs/standard_fonts/', useSystemFonts: true, disableFontFace: true }).promise; } catch (e) { continue; } }
      addPane(q.kind, q.name, q.pages, { bytes: q.bytes, pdf, zoom: q.zoom, proj: q.proj });
    }
    toast('تم استرجاع شغلك السابق');
  } else addPane('draft', 'مسودة', [{ w: A4[0], h: A4[1], strokes: [] }]);
  setTimeout(() => { READY = true; }, 2000);
})();
