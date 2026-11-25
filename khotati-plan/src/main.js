import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import DATA from './data.json';

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const DAYS = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
const WK = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu'];
const dIdx = d => (d.getDay() + 1) % 7;
const iso = d => { const z = new Date(d.getTime() - d.getTimezoneOffset() * 6e4); return z.toISOString().slice(0, 10); };
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const LOC = 'ar-u-ca-gregory-nu-latn';
const fmt = d => d.toLocaleDateString(LOC, { day: 'numeric', month: 'long' });
const fmtL = d => d.toLocaleDateString(LOC, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ST = ['تم', 'جزئي', 'لم يتم'];
const SC = { 'تم': 100, 'جزئي': 50 };
const rate = p => p >= 80 ? 'ممتاز' : p >= 50 ? 'جيد' : 'يحتاج ضبط';
const rcls = p => p >= 80 ? 'g' : p >= 50 ? 'y' : 'r';

/* ---------- plan (from the workbook) ---------- */
const GYM_H = 'بيت: مشي 60د + دراجة 20د';
const PLAN = [
  { fnl: 'LV', priv: 'شغل خاص', sharia: 'فقه وأصول فقه', gym: 'صالة: ظهر + ذراع + سكوات', content: 'حزب النور + تفريغ + منشور ترند/سلسلة', s1: 'موان', s2: 'فيلا أبو رائد + فيلا الدكتور حسن' },
  { fnl: 'صرف', priv: 'شغل خاص', sharia: 'سنة ومصطلح', gym: GYM_H, content: 'المداخلة + عقيدة + منشور ترند/سلسلة', s1: 'وصيلة', s2: 'السلي' },
  { fnl: 'LC', priv: 'شغل خاص', sharia: 'تفسير وأصول تفسير', gym: 'صالة: رجل + صدر + ديدلفت', content: 'النصارى + تفريغ + منشور ترند/سلسلة', s1: 'إشبيلية', s2: 'فيلا أبو رائد' },
  { fnl: 'تكييف', priv: 'شغل خاص', sharia: 'تجويد ونحو', gym: GYM_H, content: 'الأزاهرة + عقيدة + منشور ترند/سلسلة', s1: 'الجنادرية', s2: 'السلي' },
  { fnl: 'MV', priv: 'شغل خاص', sharia: 'تاريخ', gym: 'صالة: ظهر + كتف + سكوات', content: 'حزب النور + تفريغ + منشور ترند/سلسلة', s1: 'موان', s2: 'فيلا الدكتور حسن' },
  { fnl: 'Fire Fighting', priv: 'شغل خاص', sharia: 'تلخيص كتب', gym: 'صالة: رجل + ذراع + ديدلفت', content: 'العلمانيين + عقيدة + منشور ترند/سلسلة', s1: 'الجنادرية', s2: '' },
  { fnl: '', priv: '', sharia: '', gym: GYM_H, content: '', s1: '', s2: '' },
];
PLAN.forEach((p, i) => { p.revit = i < 6 ? 'Revit' : ''; p.taf = i < 6 ? 'تفريغ دروس' : ''; });
const ITEMS = [
  { k: 'fnl', t: 'المهمة الفنية', tm: '7:00 – 12:00', ic: '🏗', plan: p => [p.fnl, p.revit].filter(Boolean).join(' + ') },
  { k: 'priv', t: 'الشغل الخاص', tm: '12:30 – 1:30', ic: '💼', plan: p => p.priv },
  { k: 'sharia', t: 'العلم الشرعي', tm: '1:30 – 3:00', ic: '📖', plan: p => p.sharia },
  { k: 'taf', t: 'التفريغ', tm: '1:30 – 3:00', ic: '🎧', plan: p => p.taf },
  { k: 'gym', t: 'الجيم / النشاط', tm: 'بعد الدوام', ic: '🏋️', plan: p => p.gym },
  { k: 'quran', t: 'ورد القرآن', tm: 'يوميًا', ic: '📗', plan: () => '6 صفحات من مصحف التهجد' },
  { k: 'adhkar', t: 'الأذكار', tm: 'يوميًا', ic: '📿', plan: () => 'الصباح والمساء + تسابيح + الصلاة على النبي' },
  { k: 'nawafil', t: 'النوافل', tm: 'يوميًا', ic: '🕌', plan: () => '12 راتبة + 4 ضحى + 4 قيام + 10 متفرقة' },
  { k: 'hifz', t: 'الحفظ', tm: 'يوميًا', ic: '🧠', plan: () => 'وجه يوميًا' },
  { k: 'walk', t: 'مشي صباحي', tm: 'قبل الخروج', ic: '🚶', plan: () => '15 دقيقة قبل الخروج من البيت' },
  { k: 'content', t: 'المحتوى', tm: '3:00 – 4:00', ic: '✍️', plan: p => p.content },
];
const FRI_NA = ['fnl', 'priv', 'sharia', 'taf', 'content'];
const isNA = (k, di) => di === 6 && FRI_NA.includes(k);

/* ---------- state ---------- */
const KEY = 'khotati_v1';
let S; try { S = JSON.parse(localStorage.getItem(KEY)); } catch (e) { }
S = S || {};
for (const k of ['track', 'books', 'series', 'weeks', 'batches']) S[k] = S[k] || {};
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } };

function dayPct(date) {
  const di = dIdx(parse(date)), t = (S.track[date] || {}).s || {};
  const its = ITEMS.filter(i => !isNA(i.k, di));
  if (!its.length) return 0;
  return Math.round(its.reduce((a, i) => a + (SC[t[i.k]] || 0), 0) / its.length);
}
const weekStart = date => addDays(parse(date), -dIdx(parse(date)));
function weekStats(date) {
  const ws = weekStart(date), days = [];
  for (let i = 0; i < 7; i++) { const d = iso(addDays(ws, i)); days.push({ d, i, p: dayPct(d) }); }
  const avg = Math.round(days.reduce((a, x) => a + x.p, 0) / 7);
  const cats = ITEMS.map(it => {
    let sum = 0, n = 0;
    days.forEach(x => { if (isNA(it.k, x.i)) return; n++; sum += SC[((S.track[x.d] || {}).s || {})[it.k]] || 0; });
    return { ...it, p: n ? Math.round(sum / n) : 0 };
  });
  return { ws, days, avg, hi: days.filter(x => x.p >= 80).length, mid: days.filter(x => x.p >= 50 && x.p < 80).length, lo: days.filter(x => x.p < 50).length, cats };
}

/* ---------- shell ---------- */
let cur = iso(new Date()), tab = 'today', sheet = false;
if (Capacitor.isNativePlatform()) document.documentElement.classList.add('native');
document.body.innerHTML = `
<header><div><b>خطتي</b><small id="sub"></small></div><button id="gear" aria-label="إعدادات">⚙️</button></header>
<main id="view"></main>
<nav id="nav">
 <button data-tab="today"><i>✅</i>اليوم</button>
 <button data-tab="week"><i>📊</i>الأسبوع</button>
 <button data-tab="books"><i>📚</i>الكتب</button>
 <button data-tab="content"><i>✍️</i>المحتوى</button>
 <button data-tab="plan"><i>🗓</i>الجدول</button>
</nav>
<div id="sheet" hidden></div><div id="toast"></div>`;
const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('s'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('s'), 3500); };

const chips = (cur, attr) => ST.map(s => `<button class="ch c${ST.indexOf(s)}${cur === s ? ' on' : ''}" ${attr} data-v="${s}">${s === 'تم' ? '✓ ' : s === 'جزئي' ? '◐ ' : '✗ '}${s}</button>`).join('');

/* ---------- views ---------- */
function vToday() {
  const d = parse(cur), di = dIdx(d), p = PLAN[di], t = S.track[cur] || { s: {}, n: '' };
  const pct = dayPct(cur), y = iso(addDays(d, -1)), yp = dayPct(y);
  const isToday = cur === iso(new Date());
  const sites = [p.s1 && `🏢 زيارة موقع (الشركة): <b>${esc(p.s1)}</b>`, p.s2 && `🛠 إشراف موقع (شغل خاص): <b>${esc(p.s2)}</b>`].filter(Boolean);
  return `
<div class="dn"><button data-nav="-1">‹</button><div><b>${DAYS[di]}</b><small>${fmt(d)}${isToday ? ' • اليوم' : ''}</small></div><button data-nav="1">›</button></div>
${isToday ? '' : '<button class="tdy" data-nav="0">العودة لليوم</button>'}
<div class="card hero"><div class="ring ${rcls(pct)}" style="--p:${pct}"><span>${pct}%</span></div>
 <div><b>إنجاز اليوم</b><div class="sm">${rate(pct)}</div><div class="sm">8:30 ص — مراجعة إنجاز أمس: <b>${yp}%</b></div></div></div>
${sites.length ? `<div class="card sites">${sites.join('<br>')}</div>` : ''}
${ITEMS.map(it => {
    if (isNA(it.k, di)) return `<div class="card it na"><div class="ih"><span class="ic">${it.ic}</span><div><b>${it.t}</b><small>غير مطلوب اليوم</small></div></div></div>`;
    const v = (t.s || {})[it.k];
    return `<div class="card it ${v ? 'd' + ST.indexOf(v) : ''}"><div class="ih"><span class="ic">${it.ic}</span><div><b>${it.t}</b><small>${it.tm}</small></div></div>
<div class="pl">${esc(it.plan(p) || '—')}</div><div class="chs" data-item="${it.k}">${chips(v, 'data-set')}</div></div>`;
  }).join('')}
<div class="card"><b>ملاحظات اليوم</b><textarea id="note" rows="3" placeholder="اكتب ملاحظاتك…">${esc(t.n || '')}</textarea></div>`;
}

function vWeek() {
  const w = weekStats(cur), a = w.ws, b = addDays(a, 6);
  return `
<div class="dn"><button data-wk="-7">‹</button><div><b>تقييم الأسبوع</b><small>${fmt(a)} – ${fmt(b)}</small></div><button data-wk="7">›</button></div>
<div class="card hero"><div class="ring ${rcls(w.avg)}" style="--p:${w.avg}"><span>${w.avg}%</span></div>
 <div><b>متوسط إنجاز الأسبوع</b><div class="sm">${rate(w.avg)}</div></div></div>
<div class="grid3"><div class="card sc g"><b>${w.hi}</b><small>أيام ≥ 80%</small></div><div class="card sc y"><b>${w.mid}</b><small>أيام 50–79%</small></div><div class="card sc r"><b>${w.lo}</b><small>أيام &lt; 50%</small></div></div>
<h3>الأيام</h3>
${w.days.map(x => `<button class="card row" data-go="${x.d}"><span>${DAYS[x.i]}<small>${fmt(parse(x.d))}</small></span><div class="bar"><i class="${rcls(x.p)}" style="width:${x.p}%"></i></div><b>${x.p}%</b></button>`).join('')}
<h3>الفئات</h3>
${w.cats.map(c => `<div class="card row cat"><span>${c.ic} ${c.t}</span><div class="bar"><i class="${rcls(c.p)}" style="width:${c.p}%"></i></div><b>${c.p}%</b><em class="${rcls(c.p)}">${rate(c.p)}</em></div>`).join('')}
<div class="card sm">تم = 100% • جزئي = 50% • لم يتم = 0% • غير مطلوب لا يدخل في التقييم. التقييم: ≥80 ممتاز، 50–79 جيد، أقل يحتاج ضبط.</div>`;
}

function vBooks() {
  const done = DATA.books.filter((_, i) => S.books[i] === 'تم').length, part = DATA.books.filter((_, i) => S.books[i] === 'جزئي').length;
  return `<div class="card hero"><div class="ring ${rcls(Math.round((done + part / 2) * 10))}" style="--p:${Math.round((done + part / 2) * 10)}"><span>${done}/${DATA.books.length}</span></div><div><b>خطة الكتب الشرعية</b><div class="sm">فبراير ومارس 2027 • المخرج: مذكرة مبسطة بأسلوب الكشكول</div></div></div>
${DATA.books.map((b, i) => `<div class="card bk"><div class="bh"><span class="tag">${esc(b.day)}</span><span class="tag t2">${esc(b.branch)}</span></div>
<h4>${esc(b.book)}</h4><div class="sm">${esc(b.author)}</div>
<p>${esc(b.why)}</p><div class="kv"><b>أسابيع العمل:</b> ${esc(b.weeks)}</div><div class="kv"><b>الهدف:</b> ${esc(b.goal)}</div><div class="kv"><b>التالي:</b> ${esc(b.next)}</div>
<div class="chs" data-book="${i}">${chips(S.books[i], 'data-set')}</div></div>`).join('')}`;
}

function vContent() {
  return `<h3>السلاسل</h3>${DATA.series.map((s, i) => { const c = S.series[i] || 0, p = Math.min(100, Math.round(c * 100 / s.target)); return `<div class="card sr">
<div class="bh"><span class="tag">${esc(s.day)}</span><span class="tag t2">${esc(s.file)}</span></div><h4>${esc(s.name)}</h4>
<div class="do"><b>✅ اكتب:</b> ${esc(s.do)}</div><div class="dont"><b>⛔ تجنّب:</b> ${esc(s.dont)}</div>
<div class="cnt"><button data-sr="${i}" data-d="-1">−</button><div><b>${c} / ${s.target}</b><div class="bar"><i class="${rcls(p)}" style="width:${p}%"></i></div></div><button data-sr="${i}" data-d="1">+</button></div></div>`; }).join('')}
<h3>قواعد عامة</h3>${DATA.rules.map(r => `<div class="card rl ${r.k === 'افعل' ? 'do' : 'dont'}"><b>${r.k === 'افعل' ? '✅ افعل' : '⛔ لا تفعل'}</b><p>${esc(r.t)}</p></div>`).join('')}`;
}

function vPlan() {
  const st = parse(DATA.meta.start), en = parse(DATA.meta.end), now = new Date(), nowI = iso(now);
  const dd = Math.ceil((st - new Date(nowI.slice(0, 10) + 'T00:00:00')) / 864e5);
  const note = dd > 0 ? `تبدأ الخطة بعد ${dd} يوم (${fmt(st)})` : (nowI > DATA.meta.end ? 'انتهت الفترة' : 'الخطة جارية');
  return `<div class="card hero"><div class="ring g" style="--p:${Math.round(DATA.weeks.filter((_, i) => S.weeks[i] === 'تم').length * 100 / DATA.weeks.length)}"><span>${DATA.weeks.filter((_, i) => S.weeks[i] === 'تم').length}/${DATA.weeks.length}</span></div>
<div><b>الجدول الزمني</b><div class="sm">${fmt(st)} – ${fmt(en)} 2027</div><div class="sm">${note}</div><div class="sm">رمضان تقريبًا: ${fmt(parse(DATA.meta.rs))} – ${fmt(parse(DATA.meta.re))}</div></div></div>
${DATA.weeks.map((w, i) => {
    const now = nowI >= w.frm && nowI <= w.to;
    const rows = [['السبت', w.sat], ['الأحد', w.sun], ['الاثنين', w.mon], ['الثلاثاء', w.tue], ['الأربعاء', w.wed], ['الخميس', w.thu], ['التفريغ', w.taf], ['المحتوى', w.content]];
    return `<div class="card wk${now ? ' now' : ''}"><div class="bh"><b>الأسبوع ${w.n}</b><span class="sm">${fmt(parse(w.frm))} – ${fmt(parse(w.to))}</span>${w.ram ? '<span class="tag t3">رمضان</span>' : ''}${now ? '<span class="tag">الآن</span>' : ''}</div>
${rows.map(r => `<div class="kv"><b>${r[0]}:</b> ${esc(r[1])}</div>`).join('')}${w.name ? `<div class="kv"><b>الاسم:</b> ${esc(w.name)}</div>` : ''}
<div class="chs" data-week="${i}">${chips(S.weeks[i], 'data-set')}</div></div>`;
  }).join('')}
<h3>دفعات التفريغ — م. أيمن عبد الرحيم</h3>
${DATA.batches.map((b, i) => { const x = S.batches[i] || {}; return `<div class="card"><b>${esc(b.n)}: ${esc(b.series)}</b><div class="kv">المحاضرات ${esc(b.lec)} • الأسابيع ${esc(b.weeks)}</div><div class="kv">موعد اقتراح الاسم: ${fmt(parse(b.suggest))}</div>
<input class="bn" data-bn="${i}" placeholder="اسم الكتيب" value="${esc(x.name ?? b.name)}"><div class="chs" data-batch="${i}">${chips(x.st, 'data-set')}</div></div>`; }).join('')}
<div class="card sm">طريقة العمل: تفريغ آلي ← مراجعة على الصوت ← تقسيم وعناوين جانبية ← تخريج الآيات والأحاديث ← كتيب PDF.</div>`;
}

function render() {
  const v = $('#view'), top = v.scrollTop;
  v.innerHTML = { today: vToday, week: vWeek, books: vBooks, content: vContent, plan: vPlan }[tab]();
  v.scrollTop = top;
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  $('#sub').textContent = fmtL(new Date());
}

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.dataset.tab) { tab = t.dataset.tab; $('#view').scrollTop = 0; render(); return; }
  if (t.id === 'gear') { openSheet(); return; }
  if (t.dataset.nav !== undefined) { cur = t.dataset.nav === '0' ? iso(new Date()) : iso(addDays(parse(cur), +t.dataset.nav)); $('#view').scrollTop = 0; render(); return; }
  if (t.dataset.wk) { cur = iso(addDays(parse(cur), +t.dataset.wk)); render(); return; }
  if (t.dataset.go) { cur = t.dataset.go; tab = 'today'; $('#view').scrollTop = 0; render(); return; }
  if (t.dataset.sr !== undefined) { const i = t.dataset.sr; S.series[i] = Math.max(0, (S.series[i] || 0) + +t.dataset.d); save(); render(); return; }
  if (t.hasAttribute('data-set')) {
    const box = t.parentElement, v = t.dataset.v;
    const flip = o => { o[box.dataset.k] = undefined; };
    if (box.dataset.item) { const x = S.track[cur] = S.track[cur] || { s: {}, n: '' }; x.s[box.dataset.item] = x.s[box.dataset.item] === v ? undefined : v; }
    else if (box.dataset.book !== undefined) { const i = box.dataset.book; S.books[i] = S.books[i] === v ? undefined : v; }
    else if (box.dataset.week !== undefined) { const i = box.dataset.week; S.weeks[i] = S.weeks[i] === v ? undefined : v; }
    else if (box.dataset.batch !== undefined) { const i = box.dataset.batch, x = S.batches[i] = S.batches[i] || {}; x.st = x.st === v ? undefined : v; }
    save(); render();
  }
});
document.addEventListener('input', e => {
  if (e.target.id === 'note') { const x = S.track[cur] = S.track[cur] || { s: {}, n: '' }; x.n = e.target.value; save(); }
  if (e.target.dataset.bn !== undefined) { const x = S.batches[e.target.dataset.bn] = S.batches[e.target.dataset.bn] || {}; x.name = e.target.value; save(); }
});

/* ---------- backup / export ---------- */
async function out(name, text, mime) {
  if (Capacitor.isNativePlatform()) {
    try {
      const r = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
      await Share.share({ title: name, files: [r.uri], dialogTitle: 'حفظ أو مشاركة' });
    } catch (e) { if (!/cancel/i.test(String(e.message))) toast('تعذر: ' + e.message); }
  } else {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: mime })); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    toast('تم التنزيل: ' + name);
  }
}
const stamp = () => iso(new Date());
function csv() {
  const head = ['التاريخ', 'اليوم', ...ITEMS.map(i => i.t), 'نسبة اليوم', 'ملاحظات'];
  const rows = Object.keys(S.track).sort().map(d => { const x = S.track[d], di = dIdx(parse(d)); return [d, DAYS[di], ...ITEMS.map(i => isNA(i.k, di) ? 'غير مطلوب' : (x.s[i.k] || 'لم يتم')), dayPct(d) + '%', (x.n || '').replace(/\n/g, ' ')]; });
  return '\ufeff' + [head, ...rows].map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
}
function openSheet() {
  const s = $('#sheet'); s.hidden = false;
  s.innerHTML = `<div class="box"><h3>⚙️ النسخ الاحتياطي</h3>
<button class="big" id="ex1">💾 حفظ نسخة احتياطية (JSON)</button>
<button class="big" id="ex2">📊 تصدير المتابعة اليومية (Excel / CSV)</button>
<button class="big" id="im">📥 استرجاع نسخة احتياطية</button>
<button class="big danger" id="rs">🗑 مسح كل البيانات</button>
<button class="big s" id="cl">إغلاق</button><input type="file" id="fi" accept=".json,application/json" hidden></div>`;
  $('#cl').onclick = () => s.hidden = true;
  $('#ex1').onclick = () => out('khotati-backup-' + stamp() + '.json', JSON.stringify(S), 'application/json');
  $('#ex2').onclick = () => out('khotati-daily-' + stamp() + '.csv', csv(), 'text/csv');
  $('#im').onclick = () => $('#fi').click();
  $('#fi').onchange = async e => { try { const j = JSON.parse(await e.target.files[0].text()); for (const k of ['track', 'books', 'series', 'weeks', 'batches']) S[k] = j[k] || {}; save(); s.hidden = true; render(); toast('تم الاسترجاع'); } catch (x) { toast('الملف غير صالح'); } };
  $('#rs').onclick = () => { if (confirm('مسح كل البيانات؟ لا يمكن التراجع.')) { S = { track: {}, books: {}, series: {}, weeks: {}, batches: {} }; save(); s.hidden = true; render(); } };
}
render();
