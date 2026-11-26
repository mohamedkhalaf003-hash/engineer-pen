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
let api = null;
const D = { projects: [], files: {}, stamps: [], cfg: { key: '', model: 'claude-sonnet-5-5', style: 'typed', disc: 'both' } };
const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
const GROUPS = [['lighting', 'إنارة شوارع وشبكات جهد متوسط'], ['buildings', 'مشاريع مباني كهرباء'], ['private', 'مشاريع خاصة كهرباء وميكانيكا']];
const SEED = { lighting: ['بنيان نجد', 'الصندوق', 'موان', 'اشبيلية', 'تلال الوصيل'], buildings: ['مدن'], private: ['مستودع السلى', 'فيلا عوض', 'مسجد حريملاء', 'فيلا الكنانى'] };
const save = () => api.kvSet('pj:data', D);
async function load() {
  const d = await api.kvGet('pj:data');
  if (d && d.projects) Object.assign(D, d, { cfg: Object.assign({}, D.cfg, d.cfg) });
  else { GROUPS.forEach(([g]) => SEED[g].forEach(n => D.projects.push({ id: uid(), name: n, group: g }))); await save(); }
  D.projects.forEach(p => { D.files[p.id] = D.files[p.id] || { ref: [], in: [], out: [] }; });
}
const sizeTxt = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const b64 = u8 => { let s = ''; const C = 0x8000; for (let i = 0; i < u8.length; i += C) s += String.fromCharCode.apply(null, u8.subarray(i, i + C)); return btoa(s); };
async function addFile(pid, sec, f) {
  const bytes = await f.arrayBuffer(), id = uid();
  await api.kvSet('pjf:' + id, bytes);
  D.files[pid][sec].push({ id, name: f.name, size: bytes.byteLength, type: f.type || (/\.pdf$/i.test(f.name) ? 'application/pdf' : ''), t: Date.now() });
}
export async function addOutput(pid, name, u8) {
  const id = uid(); await api.kvSet('pjf:' + id, u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength));
  const L = D.files[pid].out, i = L.findIndex(x => x.name === name);
  if (i >= 0) { api.kvSet('pjf:' + L[i].id, null); L.splice(i, 1); }
  L.push({ id, name, size: u8.byteLength, type: 'application/pdf', t: Date.now() }); await save();
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
#pj .tb{display:flex;gap:6px;margin-bottom:10px}#pj .tb button{flex:1}#pj .tb button.on{background:#2563eb}
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

/* ---------- screens ---------- */
let cur = { pid: null, sec: 'in' };
const SEC = { ref: '📚 المراجع', in: '📥 المدخلات', out: '📤 المخرجات' };
function home() {
  cur.pid = null;
  root.innerHTML = `<div class="hd"><h2>🗂 مراجعة المشاريع</h2><button data-h="stamps">🖋 أختام وتوقيعات</button><button data-h="cfg">⚙</button><button class="r" data-h="x">✕</button></div><div class="bd">${GROUPS.map(([g, n]) => `<h3>${n}</h3><div class="gr">${D.projects.filter(p => p.group === g).map(p => `<button data-p="${p.id}">${esc(p.name)}</button>`).join('')}<button class="g" data-add="${g}">＋ مشروع</button></div>`).join('')}</div>`;
  root.querySelectorAll('[data-p]').forEach(b => b.onclick = () => project(b.dataset.p));
  root.querySelectorAll('[data-add]').forEach(b => b.onclick = async () => { const r = await modal(`<label>اسم المشروع</label><input name="n" type="text"><button class="g" data-ok>إضافة</button><button data-x="">إلغاء</button>`); if (r && r.n.trim()) { const p = { id: uid(), name: r.n.trim(), group: b.dataset.add }; D.projects.push(p); D.files[p.id] = { ref: [], in: [], out: [] }; await save(); home(); } });
  root.querySelector('[data-h=x]').onclick = () => { root.hidden = true; };
  root.querySelector('[data-h=cfg]').onclick = settings;
  root.querySelector('[data-h=stamps]').onclick = stampsScreen;
}
function project(pid, sec) {
  cur.pid = pid; if (sec) cur.sec = sec; const p = D.projects.find(x => x.id === pid), L = D.files[pid][cur.sec];
  root.innerHTML = `<div class="hd"><button data-h="back">→</button><h2>${esc(p.name)}</h2><button data-h="ren">✎</button><button class="r" data-h="del">🗑</button></div><div class="bd">
  <div class="tb">${Object.entries(SEC).map(([k, n]) => `<button data-s="${k}" class="${k === cur.sec ? 'on' : ''}">${n} (${D.files[pid][k].length})</button>`).join('')}</div>
  <div class="sm">${cur.sec === 'ref' ? 'ملفات مرجعية (مواصفات، BOQ، مخططات معتمدة، كود) — الذكاء بيراجع على أساسها.' : cur.sec === 'in' ? 'تقارير ومخططات المقاول اللي عاوز تراجعها.' : 'الملفات اللي اتكتب عليها (PDF).'}</div>
  <button class="g" data-up="1" style="width:100%;margin-bottom:10px">＋ رفع ملفات</button>
  ${L.length ? L.map(f => `<div class="rw"><span>${/pdf/i.test(f.type) ? '📄' : /image/.test(f.type) ? '🖼' : '📝'} ${esc(f.name)}<br><small>${sizeTxt(f.size)} • ${new Date(f.t).toLocaleDateString('ar-SA')}</small></span>
   ${/pdf/i.test(f.type) ? `<button data-o="${f.id}">فتح</button>` : ''}${cur.sec === 'in' && /pdf/i.test(f.type) ? `<button class="b" data-rv="${f.id}">🤖 راجع</button>` : ''}${cur.sec === 'out' ? `<button data-sh="${f.id}">📤</button>` : ''}<button class="r" data-d="${f.id}">🗑</button></div>`).join('') : '<div class="sm">لا يوجد ملفات بعد.</div>'}</div>
  <input type="file" id="pjup" multiple hidden>`;
  root.querySelector('[data-h=back]').onclick = home;
  root.querySelector('[data-h=ren]').onclick = async () => { const r = await modal(`<label>اسم المشروع</label><input name="n" type="text" value="${esc(p.name)}"><button class="g" data-ok>حفظ</button><button data-x="">إلغاء</button>`); if (r && r.n.trim()) { p.name = r.n.trim(); await save(); project(pid); } };
  root.querySelector('[data-h=del]').onclick = async () => { if (confirm('حذف المشروع «' + p.name + '» وكل ملفاته؟')) { for (const k of ['ref', 'in', 'out']) for (const f of D.files[pid][k]) api.kvSet('pjf:' + f.id, null); D.projects = D.projects.filter(x => x.id !== pid); delete D.files[pid]; await save(); home(); } };
  root.querySelectorAll('[data-s]').forEach(b => b.onclick = () => project(pid, b.dataset.s));
  const up = root.querySelector('#pjup'); up.accept = cur.sec === 'ref' ? '.pdf,.txt,.md,.png,.jpg,.jpeg,.csv' : 'application/pdf';
  root.querySelector('[data-up]').onclick = () => up.click();
  up.onchange = async () => { api.toast('جارٍ الرفع…'); for (const f of up.files) await addFile(pid, cur.sec, f); await save(); project(pid); api.toast('تم الرفع ✔'); };
  root.querySelectorAll('[data-o]').forEach(b => b.onclick = () => openFile(pid, b.dataset.o));
  root.querySelectorAll('[data-rv]').forEach(b => b.onclick = () => reviewFlow(pid, b.dataset.rv));
  root.querySelectorAll('[data-sh]').forEach(b => b.onclick = async () => { const f = L.find(x => x.id === b.dataset.sh); api.deliver(new Uint8Array(await api.kvGet('pjf:' + f.id)), f.name.replace(/\.pdf$/i, ''), true); });
  root.querySelectorAll('[data-d]').forEach(b => b.onclick = async () => { const i = L.findIndex(x => x.id === b.dataset.d); if (confirm('حذف «' + L[i].name + '»؟')) { api.kvSet('pjf:' + L[i].id, null); L.splice(i, 1); await save(); project(pid); } });
}
async function openFile(pid, fid) {
  const sec = ['ref', 'in', 'out'].find(k => D.files[pid][k].some(f => f.id === fid)), f = D.files[pid][sec].find(x => x.id === fid), bytes = await api.kvGet('pjf:' + fid);
  if (!bytes) return api.toast('الملف مش موجود');
  root.hidden = true; await api.openBytes(bytes.slice(0), f.name, { pid, sec, fid });
}
function settings() {
  const c = D.cfg;
  root.innerHTML = `<div class="hd"><button data-h="back">→</button><h2>⚙ إعدادات المراجعة</h2></div><div class="bd">
  <label>مفتاح Claude API</label><input type="password" id="k" value="${esc(c.key)}" placeholder="sk-ant-..." autocomplete="off">
  <div class="sm">المفتاح بيتحفظ على الجهاز ده بس (مش بيتزامن ولا بيترفع). كل مراجعة بتتحاسب عليك حسب الاستخدام من حسابك في Anthropic. لازم نت وقت المراجعة بس.</div>
  <label>الموديل</label><input type="text" id="m" value="${esc(c.model)}">
  <label>طريقة كتابة الملاحظات</label><select id="s"><option value="typed">مطبوعة (كأنها مكتوبة على الكمبيوتر)</option><option value="hand">خط يد (كأنها مكتوبة بالقلم)</option></select>
  <label>التخصص</label><select id="d"><option value="both">كهرباء وميكانيكا</option><option value="elec">كهرباء</option><option value="mech">ميكانيكا</option></select>
  <button class="g" data-h="ok" style="width:100%;margin-top:12px">حفظ</button></div>`;
  root.querySelector('#s').value = c.style; root.querySelector('#d').value = c.disc;
  root.querySelector('[data-h=back]').onclick = home;
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
  root.querySelectorAll('[data-d]').forEach(b => b.onclick = async () => { D.stamps = D.stamps.filter(s => s.id !== b.dataset.d); await save(); stampsScreen(); });
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
  return { open: () => { root.hidden = false; cur.pid ? project(cur.pid) : home(); }, addOutput, pickStamp };
}
