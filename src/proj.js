import arAr from '@fontsource/aref-ruqaa/files/aref-ruqaa-arabic-400-normal.woff2';
import arLa from '@fontsource/aref-ruqaa/files/aref-ruqaa-latin-400-normal.woff2';
import caLa from '@fontsource/caveat/files/caveat-latin-500-normal.woff2';

/* ---------- handwriting font (bundled, offline) ---------- */
const ff = document.createElement('style');
ff.textContent = `@font-face{font-family:KhHand;src:url(${arAr}) format('woff2');unicode-range:U+0600-06FF,U+0750-077F,U+FB50-FDFF,U+FE70-FEFF}
@font-face{font-family:KhHand;src:url(${caLa}) format('woff2');unicode-range:U+0020-007E,U+00A0-00FF}`;
document.head.appendChild(ff);
export const FONT_H = '"KhHand","Noto Naskh Arabic",cursive';
export const FONT_T = 'Tahoma,"Noto Naskh Arabic","Segoe UI",Arial,sans-serif';
export const fontOf = (s, px) => s.f === 'h' ? `${px * 1.18}px ${FONT_H}` : `${px}px ${FONT_T}`;
export const fontsReady = Promise.all([document.fonts.load('24px KhHand', 'مرحبا'), document.fonts.load('24px KhHand', 'Hello')]).catch(() => { });

/* ---------- text measuring / wrapping (normalized to page width) ---------- */
const mc = document.createElement('canvas').getContext('2d'), MW = 1000;
const isAr = t => (t.match(/[؀-ۿ]/g) || []).length > (t.match(/[A-Za-z]/g) || []).length;
export function wrap(text, fs, maxW, f) {
  mc.font = fontOf({ f }, fs * MW);
  const out = [];
  String(text).split('\n').forEach(par => {
    let line = '';
    par.split(/\s+/).filter(Boolean).forEach(w => {
      const t = line ? line + ' ' + w : w;
      if (line && mc.measureText(t).width / MW > maxW) { out.push(line); line = w; } else line = t;
    });
    if (line) out.push(line);
  });
  return out.length ? out : [''];
}
// fills s.l (if lines given), s.w, s.h from fs; g is the page ({w,h} in pt)
export function fitText(g, s) {
  mc.font = fontOf(s, s.fs * MW);
  s.w = +Math.max(...s.l.map(l => mc.measureText(l).width / MW), .01).toFixed(4);
  s.h = +(s.l.length * s.fs * 1.25 * g.w / g.h).toFixed(4);
  return s;
}
export const makeText = (g, text, x, y, o = {}) => {
  const fs = o.fs || (o.f === 'h' ? .019 : .017);
  const s = { t: 'tx', c: o.c || '#e11d1d', f: o.f === 'h' ? 'h' : undefined, fs, r: isAr(text) ? 1 : 0, x, y, l: o.noWrap ? String(text).split('\n') : wrap(text, fs, o.maxW || .4, o.f) };
  return fitText(g, s);
};

/* ---------- storage ---------- */
import { PDFDocument } from 'pdf-lib';
import { initRepoSync, hasLink, linkInfo, link as rsLink, unlink as rsUnlink } from './rsync.js';
export const REVIEW = typeof APP_MODE !== 'undefined' && APP_MODE === 'review';
const DT = typeof window !== 'undefined' ? window.desktop : null;
const SECS = ['ref', 'in', 'out', 'ipc', 'boq', 'rep'];
let RS = null, mirrored = new Set();
let api = null;
const D = { projects: [], files: {}, stamps: [], gone: {}, cfg: { key: '', model: 'claude-sonnet-5-5', style: 'typed', disc: 'both' } };
const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
const GROUPS = [['lighting', 'إنارة شوارع وشبكات جهد متوسط'], ['buildings', 'مشاريع مباني كهرباء'], ['private', 'مشاريع خاصة كهرباء وميكانيكا']];
const SEED = { lighting: ['بنيان نجد', 'الصندوق', 'موان', 'اشبيلية', 'تلال الوصيل'], buildings: ['مدن'], private: ['مستودع السلى', 'فيلا عوض', 'مسجد حريملاء', 'فيلا الكنانى'] };
const save = skip => { const r = api.kvSet('pj:data', D); if (!skip && RS) RS.soon(); return r; };
const bury = id => { D.gone[id] = Date.now(); };
async function load() {
  const d = await api.kvGet('pj:data');
  if (d && d.projects) Object.assign(D, d, { cfg: Object.assign({}, D.cfg, d.cfg) });
  else { GROUPS.forEach(([g]) => SEED[g].forEach((n, i) => D.projects.push({ id: 's_' + g + i, name: n, group: g }))); await save(); }
  D.gone = D.gone || {}; D.projects.forEach(p => { const F = D.files[p.id] = D.files[p.id] || {}; SECS.forEach(k => { F[k] = F[k] || []; }); });
  mirrored = new Set((await api.kvGet('pj:mir')) || []);
}
const isPdf = f => /pdf/i.test(f.type || '') || /\.pdf$/i.test(f.name);
const sizeTxt = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const b64 = u8 => { let s = ''; const C = 0x8000; for (let i = 0; i < u8.length; i += C) s += String.fromCharCode.apply(null, u8.subarray(i, i + C)); return btoa(s); };
async function addFile(pid, sec, f) {
  const bytes = await f.arrayBuffer(), id = uid();
  await api.kvSet('pjf:' + id, bytes);
  D.files[pid][sec].push({ id, name: f.name, size: bytes.byteLength, type: f.type || (/\.pdf$/i.test(f.name) ? 'application/pdf' : ''), t: Date.now() });
  mirrorOne(pid, sec, f.name, id, bytes);
}
export async function addOutput(pid, name, u8, sec = 'out') {
  const id = uid(); await api.kvSet('pjf:' + id, u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength));
  const L = D.files[pid][sec], i = L.findIndex(x => x.name === name);
  if (i >= 0) { api.kvSet('pjf:' + L[i].id, null); bury(L[i].id); L.splice(i, 1); }
  L.push({ id, name, size: u8.byteLength, type: 'application/pdf', t: Date.now() }); await save();
  mirrorOne(pid, sec, name, id, u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength));
}

/* ---------- stamps & signatures ---------- */
const stampCache = {};
export function stampImg(sid, onload) {
  const c = stampCache[sid]; if (c) return c.complete ? c : (onload && (c.onload = onload), null);
  const s = D.stamps.find(x => x.id === sid); if (!s) return null;
  const im = new Image(); stampCache[sid] = im; im.onload = () => onload && onload(); im.src = s.png; return im.complete ? im : null;
}
export const stampData = sid => (D.stamps.find(x => x.id === sid) || {}).png;
async function addStamp(file) {
  const url = URL.createObjectURL(file), im = new Image(); im.src = url; await im.decode();
  const k = Math.min(1, 700 / Math.max(im.width, im.height)), w = Math.round(im.width * k), h = Math.round(im.height * k);
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.drawImage(im, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h), a = d.data; let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let i = 0; i < a.length; i += 4) {
    const m = Math.min(a[i], a[i + 1], a[i + 2]), al = Math.max(0, Math.min(255, (255 - m) * 1.6 - 20)) * (a[i + 3] / 255);
    a[i + 3] = al;
    if (al > 40) { const p = i / 4, px = p % w, py = (p / w) | 0; if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py; }
  }
  x.putImageData(d, 0, 0); URL.revokeObjectURL(url);
  if (x1 <= x0 || y1 <= y0) throw new Error('الصورة فاضية');
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1, o = document.createElement('canvas'); o.width = cw; o.height = ch; o.getContext('2d').drawImage(c, x0, y0, cw, ch, 0, 0, cw, ch);
  D.stamps.push({ id: uid(), name: file.name.replace(/\.[^.]+$/, ''), png: o.toDataURL('image/png'), ar: ch / cw }); await save();
}

/* ---------- UI helpers ---------- */
let root;
function css() {
  const st = document.createElement('style');
  st.textContent = `#pj{position:fixed;inset:0;z-index:800;background:#0b1220;color:#fff;display:flex;flex-direction:column;direction:rtl;font-family:system-ui,"Segoe UI",Tahoma,sans-serif}
html.native #pj{padding-top:max(env(safe-area-inset-top),40px);padding-bottom:max(env(safe-area-inset-bottom),20px)}
#pj[hidden]{display:none}
#pj .hd{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#162033;border-bottom:1px solid #2b3a55}
#pj .hd h2{flex:1;margin:0;font-size:18px}
#pj button{border:0;border-radius:12px;background:#2a3a57;color:#fff;padding:10px 14px;font-size:15px;font-weight:700}
#pj button.g{background:#0f766e}#pj button.b{background:#2563eb}#pj button.r{background:#9f1239}
#pj .bd{flex:1;overflow:auto;padding:12px}
#pj h3{margin:14px 2px 8px;color:#7dd3c8;font-size:14px}
#pj .gr{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
#pj .gr button{padding:16px 8px;font-size:16px;background:#1e2d47;border:1px solid #2b3a55}
#pj .tb{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}#pj .tb button{flex:1 1 30%;padding:10px 6px;font-size:14px}#pj .tb button.on{background:#2563eb}
#pj .rw{display:flex;align-items:center;gap:6px;background:#162033;border:1px solid #2b3a55;border-radius:12px;padding:8px 10px;margin-bottom:8px}
#pj .rw span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#pj .rw small{color:#93a3bf;font-size:11px}
#pj .rw button{padding:7px 10px;font-size:13px}
#pj input[type=text],#pj input[type=password],#pj textarea,#pj select{width:100%;background:#0b1220;color:#fff;border:1px solid #34476a;border-radius:10px;padding:10px;font-size:15px;margin:4px 0 10px;font-family:inherit}
#pj .sm{color:#93a3bf;font-size:12px;margin:2px 0 8px;line-height:1.6}
#pj .st{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px}
#pj .st div{background:#fff;border-radius:10px;padding:6px;text-align:center;color:#000;font-size:12px}#pj .st img{max-width:100%;max-height:70px;background:repeating-conic-gradient(#eee 0 25%,#fff 0 50%) 0 0/12px 12px}
#pjm{position:fixed;inset:0;z-index:900;background:#000a;display:flex;align-items:center;justify-content:center;padding:14px}
#pjm .bx{background:#162033;border:1px solid #2b3a55;border-radius:16px;padding:16px;width:min(520px,100%);max-height:92vh;overflow:auto;color:#fff;direction:rtl}
#pjm button{border:0;border-radius:12px;background:#2a3a57;color:#fff;padding:11px 16px;font-size:15px;font-weight:700;margin:2px}
#pjm button.g{background:#0f766e}
#pjm label{display:block;font-size:13px;color:#9fb3c8;margin-top:8px}
#pjm select,#pjm textarea,#pjm input{width:100%;background:#0b1220;color:#fff;border:1px solid #34476a;border-radius:10px;padding:10px;font-size:15px;margin:4px 0;font-family:inherit}
#pjm .st{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px}#pjm .st div{background:#fff;border-radius:10px;padding:6px;text-align:center;color:#000;font-size:12px;cursor:pointer}#pjm .st img{max-width:100%;max-height:70px}`;
  if (REVIEW) st.textContent += `
#pj{background:#eef1f6;color:#0f172a}
#pj .hd{background:#fff;border-bottom:1px solid #d5dbe6}
#pj button{background:#e2e8f0;color:#0f172a}
#pj button.g{background:#0f766e;color:#fff}#pj button.b{background:#2563eb;color:#fff}#pj button.r{background:#be123c;color:#fff}
#pj h3{color:#0f766e}
#pj .gr button{background:#fff;border:1px solid #d5dbe6;box-shadow:0 1px 2px #0001}
#pj .gr button.g{background:#0f766e;border-color:#0f766e;color:#fff}
#pj .tb button.on{background:#2563eb;color:#fff}
#pj .rw{background:#fff;border-color:#d5dbe6}#pj .rw small,#pj .sm{color:#64748b}
#pj input[type=text],#pj input[type=password],#pj textarea,#pj select{background:#fff;color:#0f172a;border-color:#cbd5e1}
#pjm .bx{background:#fff;border-color:#d5dbe6;color:#0f172a}
#pjm button{background:#e2e8f0;color:#0f172a}#pjm button.g{background:#0f766e;color:#fff}
#pjm label{color:#475569}
#pjm select,#pjm textarea,#pjm input{background:#fff;color:#0f172a;border-color:#cbd5e1}
#pjm .sm{color:#64748b}`;
  document.head.appendChild(st);
}
function modal(html) {
  return new Promise(res => {
    const m = document.createElement('div'); m.id = 'pjm'; m.innerHTML = `<div class="bx">${html}</div>`; document.body.appendChild(m);
    m.close = v => { m.remove(); res(v); }; m.onclick = e => { if (e.target === m) m.close(null); };
    m.querySelectorAll('[data-x]').forEach(b => b.onclick = () => m.close(b.dataset.x));
    m.collect = () => Object.fromEntries([...m.querySelectorAll('[name]')].map(i => [i.name, i.value]));
    m.querySelectorAll('[data-ok]').forEach(b => b.onclick = () => m.close(m.collect()));
    root._m = m;
  });
}


/* ---------- ربط الفولدرات (الكمبيوتر فقط) ---------- */
const SECN = { ref: 'مراجع', in: 'مدخلات', out: 'مخرجات', ipc: 'مستخلصات', boq: 'جداول كميات', rep: 'تقارير' };
const pname = pid => (D.projects.find(x => x.id === pid) || {}).name || pid;
async function mirrorOne(pid, sec, name, id, buf) {
  if (!DT) return;
  try { await DT.write(pid, pname(pid), SEC_K(sec), name, buf); mirrored.add(id); api.kvSet('pj:mir', [...mirrored]); } catch (e) { }
}
const SEC_K = sec => SECN[sec];
let fsBusy = false;
async function folderSync(quiet) {
  if (!DT || fsBusy) return; fsBusy = true; let imp = 0;
  try {
    if (!(await DT.getRoot())) return;
    for (const p of D.projects) {
      const F = D.files[p.id]; if (!F) continue;
      for (const sec of SECS) for (const f of F[sec]) if (!mirrored.has(f.id)) { const b = await api.kvGet('pjf:' + f.id); if (b) await mirrorOne(p.id, sec, f.name, f.id, b); }
      const list = await DT.scan(p.id, p.name);
      for (const it of list) {
        const sec = Object.keys(SECN).find(k => SECN[k] === it.sec); if (!sec) continue;
        const ex = F[sec].find(x => x.name === it.name);
        if (ex && (ex.size === it.size || it.mtime <= ex.t + 3000)) continue;
        const buf = await DT.read(p.id, p.name, it.sec, it.name); if (!buf) continue;
        const id = uid(); await api.kvSet('pjf:' + id, buf);
        if (ex) { api.kvSet('pjf:' + ex.id, null); bury(ex.id); F[sec].splice(F[sec].indexOf(ex), 1); }
        F[sec].push({ id, name: it.name, size: buf.byteLength, type: /\.pdf$/i.test(it.name) ? 'application/pdf' : /\.(png|jpe?g)$/i.test(it.name) ? 'image/' + (/png$/i.test(it.name) ? 'png' : 'jpeg') : 'text/plain', t: Date.now() });
        mirrored.add(id); imp++;
      }
    }
    if (imp) { await save(); api.kvSet('pj:mir', [...mirrored]); if (!root.hidden) cur.pid ? project(cur.pid) : home(); if (!quiet) api.toast('📥 دخل ' + imp + ' ملف من الفولدرات'); }
  } catch (e) { } finally { fsBusy = false; }
}
async function pickRootFlow() {
  const r = await DT.pickRoot(); if (r) { mirrored.clear(); await api.kvSet('pj:mir', []); api.toast('✔ الفولدر الرئيسي: ' + r); await folderSync(true); }
  return r;
}

/* ---------- screens ---------- */
let cur = { pid: null, sec: 'in' };
const SEC = { ref: '📚 المراجع والعقد', in: '📥 المدخلات', out: '📤 المخرجات', ipc: '💰 المستخلصات', boq: '📊 جداول الكميات', rep: '📝 التقارير' };
const SEC_HELP = { ref: 'العقد والمواصفات والمخططات المعتمدة والكود — الذكاء بيراجع وبيكتب التقارير على أساسها.', in: 'تقارير ومخططات المقاول اللي عاوز تراجعها.', out: 'الملفات المراجَعة والمعدّلة (بتتحفظ هنا تلقائي).', ipc: 'المستخلصات الشهرية والنهائية (PDF أو Excel).', boq: 'جداول الكميات (BOQ) — PDF أو Excel.', rep: 'التقارير اللي بيولّدها البرنامج، وأي تقرير تحط فيه بنفسك.' };
function home() {
  cur.pid = null;
  root.innerHTML = `<div class="hd"><h2>🗂 مراجعة المشاريع</h2><button data-h="sync" title="مزامنة">🔄</button>${DT ? '<button data-h="rootf" title="الفولدر الرئيسي">📁</button>' : ''}<button data-h="stamps">🖋 أختام</button><button data-h="cfg">⚙</button>${REVIEW ? '<button class="b" data-h="x">📄 المحرر</button>' : '<button class="r" data-h="x">✕</button>'}</div><div class="bd">${!hasLink() ? '<div class="rw" style="background:#fff7e0;border-color:#f0c040;color:#5b4300"><span>⚠ الجهاز مش مربوط — اربطه علشان المشاريع تظهر على الجوال واللابتوب</span><button class="g" data-h="cfg">اربط</button></div>' : ''}${GROUPS.map(([g, n]) => `<h3>${n}</h3><div class="gr">${D.projects.filter(p => p.group === g).map(p => `<button data-p="${p.id}">${esc(p.name)}</button>`).join('')}<button class="g" data-add="${g}">＋ مشروع</button></div>`).join('')}</div>`;
  root.querySelectorAll('[data-p]').forEach(b => b.onclick = () => project(b.dataset.p));
  root.querySelectorAll('[data-add]').forEach(b => b.onclick = async () => { const r = await modal(`<label>اسم المشروع</label><input name="n" type="text"><button class="g" data-ok>إضافة</button><button data-x="">إلغاء</button>`); if (r && r.n.trim()) { const p = { id: uid(), name: r.n.trim(), group: b.dataset.add, t: Date.now() }; D.projects.push(p); D.files[p.id] = Object.fromEntries(SECS.map(k => [k, []])); await save(); home(); } });
  root.querySelector('[data-h=x]').onclick = () => { root.hidden = true; };
  root.querySelectorAll('[data-h=cfg]').forEach(b => b.onclick = settings);
  root.querySelector('[data-h=sync]').onclick = () => RS && RS.run(true).then(() => home());
  const rb = root.querySelector('[data-h=rootf]'); if (rb) rb.onclick = async () => { const cur0 = await DT.getRoot(); const r = await modal(`<h3 style="margin:0 0 8px">📁 الفولدر الرئيسي</h3><div class="sm">${cur0 ? esc(cur0) : 'لسه ما اخترتش'}<br>كل مشروع بيتعمله فولدر جواه بنفس اسمه (مراجع / مدخلات / مخرجات). تقدر تربط أي مشروع بفولدر تاني من جوّه المشروع.</div><button class="g" data-x="pick">اختيار / تغيير الفولدر</button><button data-x="">إغلاق</button>`); if (r === 'pick') await pickRootFlow(); home(); };
  root.querySelector('[data-h=stamps]').onclick = stampsScreen;
}
function project(pid, sec) {
  cur.pid = pid; if (sec) cur.sec = sec; const p = D.projects.find(x => x.id === pid), L = D.files[pid][cur.sec];
  root.innerHTML = `<div class="hd"><button data-h="back">→</button><h2>${esc(p.name)}</h2><button data-h="ren">✎</button><button class="r" data-h="del">🗑</button></div><div class="bd">
  <div class="tb">${Object.entries(SEC).map(([k, n]) => `<button data-s="${k}" class="${k === cur.sec ? 'on' : ''}">${n} (${D.files[pid][k].length})</button>`).join('')}</div>
  <div class="sm">${SEC_HELP[cur.sec]}</div>
  <button class="b" data-rp="1" style="width:100%;margin-bottom:8px">📝 اعمل تقرير عن المشروع</button>
  ${DT ? '<div class="rw" id="pjfold"><span>📁 <small id="pjpath">…</small></span><button data-h="fopen">فتح</button><button data-h="fpick">ربط فولدر</button><button data-h="fscan">🔄</button></div>' : ''}
  <button class="g" data-up="1" style="width:100%;margin-bottom:10px">＋ رفع ملفات</button>
  ${L.length ? L.map(f => `<div class="rw"><span>${isPdf(f) ? '📄' : /image/.test(f.type) ? '🖼' : /sheet|excel|csv|xls/i.test(f.type + f.name) ? '📊' : '📝'} ${esc(f.name)}<br><small>${sizeTxt(f.size)} • ${new Date(f.t).toLocaleDateString('ar-SA')}</small></span>
   ${isPdf(f) ? `<button data-o="${f.id}">فتح</button>` : `<button data-dl="${f.id}">⬇</button>`}${cur.sec === 'in' && /pdf/i.test(f.type) ? `<button class="b" data-rv="${f.id}">🤖 راجع</button>` : ''}${(cur.sec === 'out' || cur.sec === 'rep') && isPdf(f) ? `<button data-sh="${f.id}">📤</button>` : ''}<button class="r" data-d="${f.id}">🗑</button></div>`).join('') : '<div class="sm">لا يوجد ملفات بعد.</div>'}</div>
  <input type="file" id="pjup" multiple hidden>`;
  root.querySelector('[data-h=back]').onclick = home;
  if (DT) {
    DT.folder(pid, p.name).then(f => { const e = root.querySelector('#pjpath'); if (e) e.textContent = f || 'اختار الفولدر الرئيسي الأول (📁 من الشاشة الرئيسية)'; });
    root.querySelector('[data-h=fopen]').onclick = () => DT.open(pid, p.name);
    root.querySelector('[data-h=fpick]').onclick = async () => { const r = await DT.pickFolder(pid, p.name); if (r) { for (const k of SECS) D.files[pid][k].forEach(f => mirrored.delete(f.id)); await folderSync(); project(pid); } };
    root.querySelector('[data-h=fscan]').onclick = async () => { await folderSync(); project(pid); api.toast('تم فحص الفولدر'); };
  }
  root.querySelector('[data-h=ren]').onclick = async () => { const r = await modal(`<label>اسم المشروع</label><input name="n" type="text" value="${esc(p.name)}"><button class="g" data-ok>حفظ</button><button data-x="">إلغاء</button>`); if (r && r.n.trim()) { p.name = r.n.trim(); p.t = Date.now(); await save(); project(pid); } };
  root.querySelector('[data-h=del]').onclick = async () => { if (confirm('حذف المشروع «' + p.name + '» وكل ملفاته؟')) { for (const k of SECS) for (const f of D.files[pid][k]) api.kvSet('pjf:' + f.id, null); bury(pid); for (const k of SECS) D.files[pid][k].forEach(f => bury(f.id)); D.projects = D.projects.filter(x => x.id !== pid); delete D.files[pid]; await save(); home(); } };
  root.querySelectorAll('[data-s]').forEach(b => b.onclick = () => project(pid, b.dataset.s));
  const up = root.querySelector('#pjup'); up.accept = cur.sec === 'ref' ? '.pdf,.txt,.md,.png,.jpg,.jpeg,.csv,.xlsx,.xls' : (cur.sec === 'ipc' || cur.sec === 'boq') ? '.pdf,.xlsx,.xls,.csv' : 'application/pdf';
  root.querySelector('[data-up]').onclick = () => up.click();
  up.onchange = async () => { api.toast('جارٍ الرفع…'); for (const f of up.files) await addFile(pid, cur.sec, f); await save(); project(pid); api.toast('تم الرفع ✔'); };
  root.querySelectorAll('[data-o]').forEach(b => b.onclick = () => openFile(pid, b.dataset.o));
  root.querySelector('[data-rp]').onclick = () => reportFlow(pid);
  root.querySelectorAll('[data-dl]').forEach(b => b.onclick = async () => { const f = L.find(x => x.id === b.dataset.dl), u = URL.createObjectURL(new Blob([await api.kvGet('pjf:' + f.id)])), a = document.createElement('a'); a.href = u; a.download = f.name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 4000); });
  root.querySelectorAll('[data-rv]').forEach(b => b.onclick = () => reviewFlow(pid, b.dataset.rv));
  root.querySelectorAll('[data-sh]').forEach(b => b.onclick = async () => { const f = L.find(x => x.id === b.dataset.sh); api.deliver(new Uint8Array(await api.kvGet('pjf:' + f.id)), f.name.replace(/\.pdf$/i, ''), true); });
  root.querySelectorAll('[data-d]').forEach(b => b.onclick = async () => { const i = L.findIndex(x => x.id === b.dataset.d); if (confirm('حذف «' + L[i].name + '»؟')) { api.kvSet('pjf:' + L[i].id, null); bury(L[i].id); L.splice(i, 1); await save(); project(pid); } });
}
async function openFile(pid, fid) {
  const sec = SECS.find(k => D.files[pid][k].some(f => f.id === fid)), f = D.files[pid][sec].find(x => x.id === fid), bytes = await api.kvGet('pjf:' + fid);
  if (!bytes) return api.toast('الملف مش موجود');
  root.hidden = true; await api.openBytes(bytes.slice(0), f.name, { pid, sec, fid });
}
function settings() {
  const c = D.cfg;
  root.innerHTML = `<div class="hd"><button data-h="back">→</button><h2>⚙ إعدادات المراجعة</h2></div><div class="bd">
  <label>مفتاح Claude API</label><input type="password" id="k" value="${esc(c.key)}" placeholder="sk-ant-..." autocomplete="off">
  <div class="sm">المفتاح بيتحفظ على الجهاز ده بس (مش بيتزامن ولا بيترفع). كل مراجعة بتتحاسب عليك حسب الاستخدام من حسابك في Anthropic. لازم نت وقت المراجعة بس.</div>
  <h3>🔗 الربط بين الجوال واللابتوب</h3>
  ${hasLink() ? `<div class="sm">✔ مربوط بالمستودع الخاص: <b>${esc(linkInfo().repo)}</b>${linkInfo().last ? '<br>آخر مزامنة: ' + new Date(linkInfo().last).toLocaleString('ar-SA') : ''}</div><button data-h="unlink">فك الربط من الجهاز ده</button>` : `<div class="sm">ادخل توكن GitHub مرة واحدة على كل جهاز (صلاحية Contents قراءة وكتابة على المستودع الخاص، أو repo للتوكن الكلاسيكي). البرنامج بينشئ مستودع خاص باسم mashari3-data لو مش موجود. الملفات والمشاريع بتتخزن هناك غير مشفّرة (المستودع خاص ليك بس).</div><input type="password" id="gt" placeholder="github_pat_… أو ghp_…" autocomplete="off"><input type="text" id="gr" value="mashari3-data"><button class="g" data-h="lnk">ربط الجهاز</button>`}
  <label>الموديل</label><input type="text" id="m" value="${esc(c.model)}">
  <label>طريقة كتابة الملاحظات</label><select id="s"><option value="typed">مطبوعة (كأنها مكتوبة على الكمبيوتر)</option><option value="hand">خط يد (كأنها مكتوبة بالقلم)</option></select>
  <label>التخصص</label><select id="d"><option value="both">كهرباء وميكانيكا</option><option value="elec">كهرباء</option><option value="mech">ميكانيكا</option></select>
  <button class="g" data-h="ok" style="width:100%;margin-top:12px">حفظ</button></div>`;
  root.querySelector('#s').value = c.style; root.querySelector('#d').value = c.disc;
  root.querySelector('[data-h=back]').onclick = home;
  const ul = root.querySelector('[data-h=unlink]'); if (ul) ul.onclick = () => { rsUnlink(); settings(); };
  const lk = root.querySelector('[data-h=lnk]'); if (lk) lk.onclick = async () => { lk.disabled = true; lk.textContent = '⏳ جارٍ الربط…'; try { const r = await rsLink(root.querySelector('#gt').value, root.querySelector('#gr').value); api.toast('✔ اتربط بـ ' + r); await RS.run(true); settings(); } catch (e) { api.toast('❌ ' + e.message); lk.disabled = false; lk.textContent = 'ربط الجهاز'; } };
  root.querySelector('[data-h=ok]').onclick = async () => { c.key = root.querySelector('#k').value.trim(); c.model = root.querySelector('#m').value.trim() || 'claude-sonnet-5-5'; c.style = root.querySelector('#s').value; c.disc = root.querySelector('#d').value; api.S.nstyle = c.style; await save(); api.toast('اتحفظ ✔'); home(); };
}
function stampsScreen() {
  root.innerHTML = `<div class="hd"><button data-h="back">→</button><h2>🖋 الأختام والتوقيعات</h2></div><div class="bd">
  <div class="sm">ارفع صورة الختم أو التوقيع (تصوير أو سكرين) وهيتشال الخلفية البيضاء تلقائياً. بعد كده تحطه على أي PDF من زرار «ختم» في الأدوات.</div>
  <button class="g" data-up="1" style="width:100%;margin-bottom:10px">＋ رفع ختم / توقيع</button><input type="file" id="su" accept="image/*" multiple hidden>
  <div class="st">${D.stamps.map(s => `<div><img src="${s.png}"><br>${esc(s.name)}<br><button class="r" data-d="${s.id}" style="padding:4px 10px;font-size:12px">حذف</button></div>`).join('') || '<div class="sm" style="grid-column:1/-1">لا يوجد أختام بعد.</div>'}</div></div>`;
  root.querySelector('[data-h=back]').onclick = home;
  const up = root.querySelector('#su'); root.querySelector('[data-up]').onclick = () => up.click();
  up.onchange = async () => { try { for (const f of up.files) await addStamp(f); api.toast('اتضاف ✔'); } catch (e) { api.toast('تعذر: ' + e.message); } stampsScreen(); };
  root.querySelectorAll('[data-d]').forEach(b => b.onclick = async () => { bury(b.dataset.d); D.stamps = D.stamps.filter(s => s.id !== b.dataset.d); await save(); stampsScreen(); });
}
export async function pickStamp() {
  if (!D.stamps.length) { api.toast('ارفع ختم أو توقيع الأول من «🗂 مشاريع ← أختام»'); return null; }
  const r = await modal(`<h3 style="margin:0 0 10px">اختار ختم / توقيع</h3><div class="st">${D.stamps.map(s => `<div data-x="${s.id}"><img src="${s.png}"><br>${esc(s.name)}</div>`).join('')}</div><button data-x="" style="margin-top:10px">إلغاء</button>`);
  return r ? D.stamps.find(s => s.id === r) : null;
}

/* ---------- AI review ---------- */
const TOOL = {
  name: 'submit_review', description: 'تسليم نتيجة مراجعة الملف',
  input_schema: {
    type: 'object', required: ['decision', 'summary', 'notes'], properties: {
      decision: { type: 'string', enum: ['approved', 'approved_as_noted', 'revise_resubmit', 'rejected'] },
      summary: { type: 'string', description: 'ملخص قصير للقرار بالعربية (سطرين كحد أقصى)' },
      notes: { type: 'array', items: { type: 'object', required: ['page', 'box', 'text', 'severity'], properties: {
        page: { type: 'integer', description: 'رقم الصفحة تبدأ من 1' },
        box: { type: 'array', items: { type: 'number' }, minItems: 4, maxItems: 4, description: '[x0,y0,x1,y1] كنسب من 0 إلى 1 من أعلى يسار الصفحة، حول العنصر المقصود' },
        text: { type: 'string', description: 'الملاحظة بالعربية، قصيرة ومباشرة' },
        severity: { type: 'string', enum: ['critical', 'major', 'minor'] } } } } } }
};
const DECISION = { approved: 'معتمد', approved_as_noted: 'معتمد مع الملاحظات', revise_resubmit: 'يُعاد تقديمه بعد التعديل', rejected: 'مرفوض' };
const DISC = { both: 'الكهرباء والميكانيكا', elec: 'الكهرباء', mech: 'الميكانيكا' };
async function callClaude(pid, fid, o) {
  const c = D.cfg; if (!c.key) throw new Error('حط مفتاح API الأول من ⚙ الإعدادات');
  const proj = D.projects.find(x => x.id === pid), content = []; let total = 0;
  for (const f of D.files[pid].ref) {
    const bytes = await api.kvGet('pjf:' + f.id); if (!bytes) continue; const u8 = new Uint8Array(bytes); total += u8.length;
    if (/pdf/i.test(f.type)) content.push({ type: 'document', title: 'مرجع: ' + f.name, source: { type: 'base64', media_type: 'application/pdf', data: b64(u8) } });
    else if (/^image\/(png|jpe?g)/.test(f.type)) content.push({ type: 'image', source: { type: 'base64', media_type: f.type.replace('jpg', 'jpeg'), data: b64(u8) } });
    else content.push({ type: 'text', text: '--- مرجع: ' + f.name + ' ---\n' + new TextDecoder().decode(u8).slice(0, 200000) });
  }
  const inf = D.files[pid].in.find(x => x.id === fid), inb = new Uint8Array(await api.kvGet('pjf:' + fid)); total += inb.length;
  if (total > 30 * 1048576) throw new Error('حجم الملفات كبير (' + sizeTxt(total) + ') — الحد حوالي 30MB. قلّل المراجع.');
  content.push({ type: 'document', title: 'الملف المراد مراجعته: ' + inf.name, source: { type: 'base64', media_type: 'application/pdf', data: b64(inb) } });
  content.push({ type: 'text', text: `المشروع: ${proj.name}\nالتخصص: ${DISC[o.disc]}\nراجع الملف الأخير («${inf.name}») على أساس ملفات المراجع أعلاه (وكود البناء السعودي والأكواد المعتمدة لما المرجع ما يغطيش النقطة).${o.extra ? '\nتعليمات إضافية من المهندس: ' + o.extra : ''}\nسلّم النتيجة عبر الأداة submit_review.` });
  const system = `أنت مهندس استشاري سعودي خبير في ${DISC[o.disc]}، بتراجع تقارير ومخططات المقاولين نيابة عن المهندس محمد خلف (مهندس كهرباء، الرياض).
القواعد:
- راجع الملف على أساس المراجع المرفقة فقط، ولو النقطة مش مغطاة فيها استند للكود السعودي SBC أو الأكواد المعتمدة وقول المرجع في الملاحظة.
- ما تخترعش معلومات ولا أرقام. لو مش متأكد من نقطة اكتب «يُراجع/يُتأكد» بدل ما تحكم.
- كل ملاحظة: جملة أو جملتين بالعربية بأسلوب استشاري مباشر وقوي (مثال: «يُلتزم بمقاس الكابل المعتمد بالمخططات.»)، من غير مقدمات.
- حدد صفحة الملاحظة وصندوق box حول العنصر المقصود بنسب الصفحة (من أعلى يسار الصفحة).
- ركّز على الملاحظات المؤثرة (مطابقة المواصفات والكميات والموديلات والمقاسات والحسابات والاعتمادات). ما تكررش نفس الملاحظة، وحد أقصى 25 ملاحظة.
- القرار: approved لو مفيش ملاحظات جوهرية، approved_as_noted لو ملاحظات بسيطة، revise_resubmit لو ملاحظات جوهرية، rejected لو مخالف للمواصفات.`;
  const body = { model: c.model, max_tokens: 8000, system, tools: [TOOL], tool_choice: { type: 'tool', name: 'submit_review' }, messages: [{ role: 'user', content }] };
  const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 600000);
  let r;
  try {
    r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal: ac.signal, headers: { 'content-type': 'application/json', 'x-api-key': c.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, body: JSON.stringify(body) });
  } catch (e) { throw new Error(e.name === 'AbortError' ? 'انتهى الوقت' : 'مفيش اتصال بالإنترنت أو الاتصال اتحجب'); } finally { clearTimeout(tm); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const m = (j.error && j.error.message) || ('HTTP ' + r.status);
    throw new Error(r.status === 401 ? 'مفتاح API غلط أو منتهي' : r.status === 429 ? 'تجاوزت حد الاستخدام، جرّب بعد شوية' : r.status === 413 ? 'الملفات كبيرة على الـAPI' : m);
  }
  const tu = (j.content || []).find(x => x.type === 'tool_use'); if (!tu) throw new Error('الرد مش مفهوم، جرّب تاني');
  return tu.input;
}
function jitterRect(b, hand) {
  const [x0, y0, x1, y1] = b, P = [];
  const seg = (ax, ay, bx, by) => { const n = hand ? 8 : 1; for (let i = 0; i < n; i++) { const t = i / n, j = hand ? (Math.random() - .5) * .0025 : 0; P.push([ax + (bx - ax) * t + j, ay + (by - ay) * t + j, .5]); } };
  seg(x0, y0, x1, y0); seg(x1, y0, x1, y1); seg(x1, y1, x0, y1); seg(x0, y1, x0, y0); P.push([x0, y0, .5]);
  return { t: 'pen', c: '#e11d1d', w: .0024, p: P };
}
function applyReview(pane, res, style) {
  const hand = style === 'hand', placed = [];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const free = (g, s) => !placed.some(q => q.g === g && !(s.x + s.w < q.x || q.x + q.w < s.x || s.y + s.h < q.y || q.y + q.h < s.y));
  const put = (g, s) => { g.strokes.push(s); placed.push({ g, x: s.x, y: s.y, w: s.w, h: s.h }); };
  (res.notes || []).forEach((n, i) => {
    const g = pane.pages[clamp((n.page | 0) - 1, 0, pane.pages.length - 1)]; if (!g) return;
    let [x0, y0, x1, y1] = (n.box || [.1, .1, .5, .2]).map(v => clamp(+v || 0, 0, 1)); if (x1 < x0) [x0, x1] = [x1, x0]; if (y1 < y0) [y0, y1] = [y1, y0];
    if (x1 - x0 < .02) x1 = x0 + .02; if (y1 - y0 < .015) y1 = y0 + .015;
    g.strokes.push(jitterRect([x0, y0, x1, y1], hand));
    const col = n.severity === 'critical' ? '#c01010' : '#e11d1d';
    const s = makeText(g, (i + 1) + '- ' + n.text, 0, 0, { f: hand ? 'h' : undefined, c: col, maxW: clamp((x1 - x0) * 1.3, .22, .42) });
    s.x = clamp(s.r ? x1 - s.w : x0, .01, .99 - s.w); s.y = y0 - s.h - .004; if (s.y < .008) s.y = y1 + .004;
    s.y = clamp(s.y, .008, .99 - s.h);
    for (let k = 0; k < 25 && !free(g, s); k++) s.y = clamp(s.y + s.h * .9 + .004, .008, .99 - s.h);
    put(g, s);
  });
  const g0 = pane.pages[0];
  if (g0) {
    const t = makeText(g0, 'قرار المراجعة: ' + (DECISION[res.decision] || '') + (res.summary ? '\n' + res.summary : ''), .02, .012, { f: hand ? 'h' : undefined, c: res.decision === 'approved' ? '#15803d' : '#c01010', fs: hand ? .024 : .021, maxW: .6 });
    t.r = isAr(res.summary || 'ع') ? 1 : 0; if (t.r) t.x = .98 - t.w; g0.strokes.unshift(t);
  }
}
/* ---------- التقارير ---------- */
const RTYPES = { general: 'تقرير عام عن المشروع (نظرة شاملة)', contract: 'ملخص العقد وشروطه', qty: 'تقرير الكميات (جداول الكميات)', ipc: 'تقرير المستخلصات والموقف المالي', custom: 'تقرير مخصص (أكتب طلبي)' };
const RTOOL = {
  name: 'submit_report', description: 'تسليم التقرير النهائي', input_schema: { type: 'object', required: ['title', 'sections'], properties: {
    title: { type: 'string' }, subtitle: { type: 'string' },
    sections: { type: 'array', items: { type: 'object', required: ['heading'], properties: {
      heading: { type: 'string' }, paragraphs: { type: 'array', items: { type: 'string' } }, bullets: { type: 'array', items: { type: 'string' } },
      table: { type: 'object', properties: { headers: { type: 'array', items: { type: 'string' } }, rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } } } } } } },
    missing: { type: 'array', items: { type: 'string' }, description: 'معلومات مطلوبة وغير واردة في المستندات' } } }
};
async function sheetText(u8, name) {
  try {
    const X = await import('xlsx'), wb = X.read(u8, { type: 'array' }); let t = '';
    for (const n of wb.SheetNames) t += '## ورقة: ' + n + '\n' + X.utils.sheet_to_csv(wb.Sheets[n], { blankrows: false }) + '\n';
    return t.slice(0, 250000);
  } catch (e) { return '(تعذّر قراءة ملف Excel ' + name + ')'; }
}
async function reportContent(pid) {
  const content = [], used = []; let total = 0;
  for (const sec of ['ref', 'boq', 'ipc', 'in']) for (const f of D.files[pid][sec]) {
    const bytes = await api.kvGet('pjf:' + f.id); if (!bytes) continue; const u8 = new Uint8Array(bytes), lab = SECN[sec] + ': ' + f.name;
    if (/\.(xlsx|xls)$/i.test(f.name) || /sheet|excel/i.test(f.type)) { const t = await sheetText(u8, f.name); content.push({ type: 'text', text: '--- ' + lab + ' (جدول) ---\n' + t }); total += t.length; used.push(lab); }
    else if (isPdf(f)) { total += u8.length; if (total > 30 * 1048576) throw new Error('حجم ملفات المشروع كبير (' + sizeTxt(total) + '). الحد حوالي 30MB — احذف ملفات مش لازمة أو قسّم الطلب.'); content.push({ type: 'document', title: lab, source: { type: 'base64', media_type: 'application/pdf', data: b64(u8) } }); used.push(lab); }
    else if (/^image\/(png|jpe?g)/.test(f.type)) { total += u8.length; content.push({ type: 'image', source: { type: 'base64', media_type: f.type.replace('jpg', 'jpeg'), data: b64(u8) } }); used.push(lab); }
    else if (/text|csv|markdown/i.test(f.type) || /\.(txt|md|csv)$/i.test(f.name)) { const t = new TextDecoder().decode(u8).slice(0, 200000); content.push({ type: 'text', text: '--- ' + lab + ' ---\n' + t }); used.push(lab); }
  }
  return { content, used };
}
async function callReport(pid, o) {
  const c = D.cfg; if (!c.key) throw new Error('حط مفتاح API الأول من ⚙ الإعدادات');
  const proj = D.projects.find(x => x.id === pid), { content, used } = await reportContent(pid);
  if (!content.length) throw new Error('مفيش ملفات في المشروع — ارفع العقد وجداول الكميات الأول.');
  const ask = { general: 'اكتب تقريرًا عامًا شاملًا عن المشروع: نبذة عن المشروع والأطراف، نطاق الأعمال، قيمة العقد ومدته وتواريخه، أهم شروط العقد (الدفعات، الغرامات، الضمان، الاستقطاعات)، ملخص الكميات والبنود الرئيسية وقيمتها، موقف المستخلصات إن وُجدت، أهم المخاطر والملاحظات.', contract: 'لخّص العقد بالتفصيل: الأطراف، النطاق، القيمة، المدة، شروط الدفع، الغرامات، الضمانات، الاستقطاعات، التغييرات والمطالبات، إنهاء العقد، وأي شروط خاصة أو مخاطر.', qty: 'اكتب تقريرًا عن الكميات: ملخص جداول الكميات حسب القسم/النظام، أهم البنود وكمياتها وأسعارها وإجمالياتها كما وردت، ومقارنة بين الجداول إن تعددت، وأي ملاحظات على البنود (غياب سعر، اختلاف وحدة، تكرار).', ipc: 'اكتب تقريرًا عن المستخلصات: رقم كل مستخلص وتاريخه وقيمته والإجمالي التراكمي والنسبة المنفذة من قيمة العقد والاستقطاعات والمبلغ الصافي، وأي ملاحظات.', custom: o.extra || '' }[o.kind] + (o.kind !== 'custom' && o.extra ? '\nتعليمات إضافية من المهندس: ' + o.extra : '');
  content.push({ type: 'text', text: `المشروع: ${proj.name}\nالملفات المرفقة: ${used.join(' | ')}\n\nالمطلوب: ${ask}\n\nسلّم التقرير عبر الأداة submit_report.` });
  const system = `أنت مهندس استشاري سعودي بتكتب تقارير هندسية وتعاقدية للمهندس محمد خلف (مهندس كهرباء، الرياض).
القواعد الصارمة:
- اكتب من واقع المستندات المرفقة فقط. ممنوع اختراع أي رقم أو بند أو تاريخ أو شرط. المعلومة اللي مش موجودة اكتبها في الحقل missing وفي النص «غير وارد في المستندات المرفقة».
- الأرقام والبنود والكميات تُنقل كما وردت بالحرف (الوحدة والعملة كما هي). لو حسبت مجموعًا أو نسبة، وضّح إنه محسوب من الأرقام الواردة وكيف.
- اذكر مصدر كل معلومة مهمة بين قوسين بصيغة [اسم الملف، ص#] قدر الإمكان.
- أسلوب مهني واضح بالعربية، مقسّم لعناوين، واستخدم جداول للأرقام المتعددة. لا مقدمات ولا حشو.`;
  const body = { model: c.model, max_tokens: 12000, system, tools: [RTOOL], tool_choice: { type: 'tool', name: 'submit_report' }, messages: [{ role: 'user', content }] };
  const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 900000); let r;
  try { r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal: ac.signal, headers: { 'content-type': 'application/json', 'x-api-key': c.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, body: JSON.stringify(body) }); }
  catch (e) { throw new Error(e.name === 'AbortError' ? 'انتهى الوقت' : 'مفيش اتصال بالإنترنت أو الاتصال اتحجب'); } finally { clearTimeout(tm); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const m = (j.error && j.error.message) || ('HTTP ' + r.status); throw new Error(r.status === 401 ? 'مفتاح API غلط أو منتهي' : r.status === 429 ? 'تجاوزت حد الاستخدام، جرّب بعد شوية' : r.status === 413 ? 'الملفات كبيرة على الـAPI' : m); }
  const tu = (j.content || []).find(x => x.type === 'tool_use'); if (!tu) throw new Error('الرد مش مفهوم، جرّب تاني');
  if (j.stop_reason === 'max_tokens') tu.input.missing = (tu.input.missing || []).concat('⚠ التقرير اتقطع لطول الرد — اطلب جزء محدد منه.');
  return tu.input;
}
async function renderReport(res, projName) {
  await fontsReady;
  const W = 1240, H = 1754, M = 90, pages = []; let x, y;
  const newPage = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); y = M; pages.push(c); };
  const font = (px, b) => `${b ? 'bold ' : ''}${px}px ${FONT_T}`;
  const lines = (t, px, b, maxW) => { x.font = font(px, b); const out = []; for (const para of String(t == null ? '' : t).split('\n')) { let ln = ''; for (const w of para.split(/\s+/)) { const tt = ln ? ln + ' ' + w : w; if (x.measureText(tt).width > maxW && ln) { out.push(ln); ln = w; } else ln = tt; } out.push(ln); } return out; };
  const put = (t, px, o = {}) => { const rtl = isAr(String(t == null ? '' : t)), maxW = W - 2 * M - (o.indent || 0); for (const ln of lines(t, px, o.b, maxW)) { if (y + px * 1.5 > H - M - 40) newPage(); x.font = font(px, o.b); x.fillStyle = o.c || '#111'; x.direction = rtl ? 'rtl' : 'ltr'; x.textAlign = rtl ? 'right' : 'left'; x.fillText(ln, rtl ? W - M - (o.indent || 0) : M + (o.indent || 0), y + px); y += px * (o.g || 1.5); } };
  const table = t => {
    const hd = (t.headers || []).map(String), rows = (t.rows || []).map(r => r.map(String)), n = Math.max(hd.length, ...rows.map(r => r.length), 1), cw = (W - 2 * M) / n, rtl = isAr(hd.join(' ') + (rows[0] || []).join(' ')), px = 23, pad = 10;
    const cx = i => rtl ? W - M - (i + 1) * cw : M + i * cw;
    const drawRow = (r, head) => {
      x.font = font(px, head); const cl = Array.from({ length: n }, (_, i) => lines(r[i] || '', px, head, cw - 2 * pad)), h = Math.max(...cl.map(a => a.length)) * px * 1.35 + 2 * pad;
      if (y + h > H - M - 40) newPage();
      if (head) { x.fillStyle = '#d7efe9'; x.fillRect(M, y, W - 2 * M, h); }
      x.strokeStyle = '#9aa7b8'; x.lineWidth = 1;
      cl.forEach((a, i) => { x.strokeRect(cx(i), y, cw, h); a.forEach((ln, k) => { const r2 = isAr(ln); x.font = font(px, head); x.fillStyle = '#111'; x.direction = r2 ? 'rtl' : 'ltr'; x.textAlign = r2 ? 'right' : 'left'; x.fillText(ln, r2 ? cx(i) + cw - pad : cx(i) + pad, y + pad + px + k * px * 1.35); }); });
      y += h;
    };
    if (hd.length) drawRow(hd, true); rows.forEach(r => drawRow(r, false)); y += 18;
  };
  newPage();
  put(res.title || 'تقرير', 46, { b: 1, c: '#0f766e', g: 1.4 });
  put((res.subtitle ? res.subtitle + ' — ' : '') + projName + ' — ' + new Date().toLocaleDateString('en-GB'), 26, { c: '#555' });
  y += 8; x.fillStyle = '#0f766e'; x.fillRect(M, y, W - 2 * M, 3); y += 26;
  for (const sc of res.sections || []) {
    if (y > H - 300) newPage();
    put(sc.heading || '', 34, { b: 1, c: '#0f766e', g: 1.6 });
    (sc.paragraphs || []).forEach(t => { put(t, 27, { g: 1.6 }); y += 6; });
    (sc.bullets || []).forEach(t => put('• ' + t, 27, { indent: 18, g: 1.55 }));
    if (sc.table && (sc.table.rows || []).length) { y += 6; table(sc.table); }
    y += 14;
  }
  if ((res.missing || []).length) { if (y > H - 300) newPage(); put('معلومات غير واردة في المستندات', 32, { b: 1, c: '#b45309', g: 1.6 }); res.missing.forEach(t => put('• ' + t, 26, { indent: 18 })); }
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pages.length; i++) {
    const g = pages[i].getContext('2d'); g.font = font(20); g.fillStyle = '#777'; g.direction = 'ltr'; g.textAlign = 'center'; g.fillText(`${i + 1} / ${pages.length}`, W / 2, H - 44);
    const d = atob(pages[i].toDataURL('image/png').split(',')[1]), u = new Uint8Array(d.length); for (let k = 0; k < d.length; k++) u[k] = d.charCodeAt(k);
    const im = await pdf.embedPng(u), pg = pdf.addPage([595.28, 841.89]); pg.drawImage(im, { x: 0, y: 0, width: 595.28, height: 841.89 });
  }
  return await pdf.save();
}
async function reportFlow(pid) {
  const c = D.cfg; if (!c.key) { api.toast('حط مفتاح API الأول'); return settings(); }
  const p = D.projects.find(x => x.id === pid), n = SECS.filter(k => k !== 'rep').reduce((a, k) => a + D.files[pid][k].length, 0);
  const o = await modal(`<h3 style="margin:0 0 8px">📝 تقرير عن «${esc(p.name)}»</h3>
  <div class="sm">هيتكتب من ${n} ملف في المشروع (عقد، كميات، مستخلصات، مدخلات) ومن غير ما يخترع أي رقم. بياخد من نص دقيقة لكام دقيقة وبيتحاسب من حسابك.</div>
  <label>نوع التقرير</label><select name="kind">${Object.entries(RTYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
  <label>طلبك / تفاصيل إضافية (اختياري، ومطلوب في المخصص)</label><textarea name="extra" rows="3" placeholder="مثال: ركز على بنود الإنارة وشروط الدفع، أو: قارن الكميات بالمستخلص رقم 2"></textarea>
  <button class="g" data-ok>ابدأ</button><button data-x="">إلغاء</button>`);
  if (!o) return; if (o.kind === 'custom' && !o.extra.trim()) return api.toast('اكتب طلبك للتقرير المخصص');
  api.toast('⏳ جارٍ كتابة التقرير… ممكن ياخد كام دقيقة'); root.querySelector('[data-rp]') && (root.querySelector('[data-rp]').disabled = true);
  try {
    const res = await callReport(pid, o), pdf = await renderReport(res, p.name);
    const nm = 'تقرير - ' + RTYPES[o.kind].split(' (')[0] + ' - ' + p.name + ' - ' + new Date().toISOString().slice(0, 10) + '.pdf';
    await addOutput(pid, nm, pdf, 'rep'); project(pid, 'rep'); api.toast('✅ التقرير جاهز في 📝 التقارير' + ((res.missing || []).length ? ` — فيه ${res.missing.length} معلومة غير واردة، راجعها في آخر التقرير` : ''));
  } catch (e) { project(pid); api.toast('❌ ' + e.message); }
}
async function reviewFlow(pid, fid) {
  const c = D.cfg;
  if (!c.key) { api.toast('حط مفتاح API الأول'); return settings(); }
  const f = D.files[pid].in.find(x => x.id === fid);
  const o = await modal(`<h3 style="margin:0 0 8px">🤖 مراجعة «${esc(f.name)}»</h3>
  <div class="sm" style="color:#93a3bf;font-size:12px">هيراجع على ${D.files[pid].ref.length} ملف مرجعي. المراجعة بتاخد من نص دقيقة لكام دقيقة وبتتحاسب من حسابك.</div>
  <label>كتابة الملاحظات</label><select name="style"><option value="typed">مطبوعة</option><option value="hand">خط يد</option></select>
  <label>التخصص</label><select name="disc"><option value="both">كهرباء وميكانيكا</option><option value="elec">كهرباء</option><option value="mech">ميكانيكا</option></select>
  <label>تعليمات إضافية (اختياري)</label><textarea name="extra" rows="2" placeholder="مثال: ركز على الكابلات ولوحات التوزيع"></textarea>
  <button class="g" data-ok>ابدأ المراجعة</button><button data-x="">إلغاء</button>`);
  if (!o) return;
  const sel = root._m; // (modal already closed)
  c.style = o.style; c.disc = o.disc; api.S.nstyle = o.style; save();
  root.hidden = true; api.toast('⏳ جارٍ المراجعة… ممكن تاخد كام دقيقة');
  try {
    const res = await callClaude(pid, fid, o);
    const bytes = await api.kvGet('pjf:' + fid);
    const pane = await api.openBytes(bytes.slice(0), f.name.replace(/\.pdf$/i, '') + '-مراجعة.pdf', { pid, sec: 'in', fid, review: true });
    if (!pane) return;
    await fontsReady; applyReview(pane, res, o.style); pane.pages.forEach(g => api.redraw(g)); api.autosave();
    api.toast(`✅ ${DECISION[res.decision] || ''} — ${(res.notes || []).length} ملاحظة. راجعها وعدّل (أداة تحديد)، وبعدين 💾 حفظ`);
  } catch (e) { root.hidden = false; project(pid, 'in'); api.toast('❌ ' + e.message); }
}

export async function initProj(a) {
  api = a; css(); await load(); a.S.nstyle = D.cfg.style;
  root = document.createElement('div'); root.id = 'pj'; root.hidden = true; document.body.appendChild(root);
  RS = initRepoSync({ D, secs: SECS, save, kvGet: k => api.kvGet(k), kvSet: (k, v) => api.kvSet(k, v), toast: m => api.toast(m), rerender: () => { if (!root.hidden) cur.pid ? project(cur.pid) : home(); }, after: () => folderSync(true) });
  if (DT) { addEventListener('focus', () => folderSync(true)); setTimeout(async () => { if (!(await DT.getRoot())) { const r = await modal(`<h3 style="margin:0 0 8px">📁 فولدر المشاريع على الكمبيوتر</h3><div class="sm">اختار فولدر (مثلاً على D: مش C:). هيتعمل جواه فولدر لكل مشروع، وأي ملف تضيفه أو تعدّله في البرنامج بيتكتب فيه تلقائي، وأي ملف تحطه في الفولدر بيظهر في البرنامج.</div><button class="g" data-x="pick">اختيار الفولدر</button><button data-x="">بعدين</button>`); if (r === 'pick') await pickRootFlow(); } else folderSync(true); }, 1200); }
  if (hasLink()) setTimeout(() => RS.run(false), 2500);
  return { open: () => { root.hidden = false; cur.pid ? project(cur.pid) : home(); }, addOutput, pickStamp };
}
