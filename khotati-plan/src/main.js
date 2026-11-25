import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Browser } from '@capacitor/browser';
import DATA0 from './data.json';
import { CITIES, times as ptimes } from './prayer.js';

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
const HJ = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' });
const HJS = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { day: 'numeric' });
const hij = d => { try { return HJ.format(d).replace(/\s*هـ$/, '') + ' هـ'; } catch (e) { return ''; } };
const hijD = d => { try { return HJS.format(d); } catch (e) { return ''; } };
const hm = d => d.toLocaleTimeString('ar-u-nu-latn', { hour: 'numeric', minute: '2-digit', hour12: true });
const place = () => S.set.lat != null && S.set.city === 'gps' ? ['موقعي', S.set.lat, S.set.lng] : (CITIES[S.set.city] || CITIES.riyadh);
const prayers = d => { const [, la, ln] = place(); const t = ptimes(d, la, ln); return [['الفجر', t.fajr], ['الشروق', t.sunrise], ['الظهر', t.dhuhr], ['العصر', t.asr], ['المغرب', t.maghrib], ['العشاء', t.isha]]; };
const ST = ['تم', 'جزئي', 'لم يتم'];
const SC = { 'تم': 100, 'جزئي': 50 };
const rate = p => p >= 80 ? 'ممتاز' : p >= 50 ? 'جيد' : 'يحتاج ضبط';
const rcls = p => p >= 80 ? 'g' : p >= 50 ? 'y' : 'r';

/* ---------- state ---------- */
const KEY = 'khotati_v1';
let S; try { S = JSON.parse(localStorage.getItem(KEY)); } catch (e) { }
S = S || {};
for (const k of ['track', 'books', 'series', 'weeks', 'batches']) S[k] = S[k] || {};
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } };

for (const k of ['ev']) S[k] = S[k] || {};
S.set = Object.assign({ city: 'riyadh', pre: 10, n: { pray: true, tasks: true, adhkar: true, ev: true, log: true } }, S.set || {});
const D = (S.custom && S.custom.books && S.custom.weeks) ? S.custom : DATA0;
let PLAN = D.plan || DATA0.plan;
PLAN.forEach((p, i) => { p.revit = i < 6 ? 'Revit' : ''; p.taf = i < 6 ? 'تفريغ دروس' : ''; });
/* ---------- plan (from the workbook) ---------- */
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
 <button data-tab="cal"><i>📅</i>المفكرة</button>
 <button data-tab="plan"><i>🗓</i>الجدول</button>
</nav>
<div id="sheet" hidden></div><div id="toast"></div>`;
const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('s'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('s'), 3500); };

const chips = (cur, attr) => ST.map(s => `<button class="ch c${ST.indexOf(s)}${cur === s ? ' on' : ''}" ${attr} data-v="${s}">${s === 'تم' ? '✓ ' : s === 'جزئي' ? '◐ ' : '✗ '}${s}</button>`).join('');

/* ---------- views ---------- */
const weekFor = k => D.weeks.find(w => k >= w.frm && k <= w.to);
const activeWk = (str, n) => /كل/.test(str) || !n || (String(str).match(/\d+/g) || []).includes(String(n));
function gymParts(p) { const m = String(p.gym || '').match(/^(صالة|بيت)\s*:\s*(.*)$/); return m ? { where: m[1], parts: m[2].split('+').map(x => x.trim()).filter(Boolean) } : { where: '', parts: [] }; }
function extra(it, di, k, t) {
  const p = PLAN[di], w = weekFor(k), day = DAYS[di];
  if (it.k === 'sharia') {
    const bs = D.books.filter(b => b.day === day); if (!bs.length) return '';
    const topic = w && w[WK[di]];
    return bs.map(b => { const on = w && activeWk(b.weeks, w.n); return `<div class="mb${on ? ' on' : ''}"><div class="bh"><span class="tag">${esc(b.branch)}</span>${on ? '<span class="tag t3">هذا الأسبوع</span>' : ''}<span class="sm">أسابيع: ${esc(b.weeks)}</span></div>
<b>${esc(b.book)}</b><small>${esc(b.author)}</small>${on && topic ? `<div class="tp">📌 ${esc(topic)}</div>` : ''}<div class="kv"><b>الهدف:</b> ${esc(b.goal)}</div><div class="kv"><b>بعده:</b> ${esc(b.next)}</div></div>`; }).join('') + (!w ? '<small>تبدأ مواضيع الأسابيع من ' + fmt(parse(D.meta.start)) + '</small>' : '');
  }
  if (it.k === 'taf') return w ? `<div class="mb on"><div class="tp">🎧 ${esc(w.taf)}</div>${w.name ? `<small>${esc(w.name)}</small>` : ''}</div>` : '';
  if (it.k === 'gym') {
    const g = gymParts(p); if (!g.parts.length) return '';
    const done = t.g || [];
    return `<div class="gy"><small>${g.where === 'صالة' ? '🏋️ تمرين الصالة' : '🏠 نشاط البيت'} — اضغط لتحديد ما أنجزته</small><div class="gp">${g.parts.map((x, i) => `<button class="gb${done.includes(i) ? ' on' : ''}" data-gym="${i}">${done.includes(i) ? '✓ ' : ''}${esc(x)}</button>`).join('')}</div></div>`;
  }
  if (it.k === 'content') {
    const ss = D.series.map((x, i) => ({ x, i })).filter(({ x }) => x.day.includes(day) || x.day.includes('يوميًا'));
    return (w && w.content ? `<div class="mb on"><div class="tp">📌 هذا الأسبوع: ${esc(w.content)}</div></div>` : '') + ss.map(({ x, i }) => `<div class="mb"><b>${esc(x.file)}</b> <small>${esc(x.name)} — ${S.series[i] || 0}/${x.target}</small><div class="do">✅ ${esc(x.do)}</div><div class="dont">⛔ ${esc(x.dont)}</div></div>`).join('');
  }
  return '';
}
function vToday() {
  const d = parse(cur), di = dIdx(d), p = PLAN[di], t = S.track[cur] || { s: {}, n: '' };
  const pct = dayPct(cur), y = iso(addDays(d, -1)), yp = dayPct(y);
  const isToday = cur === iso(new Date());
  const sites = [p.s1 && `🏢 زيارة موقع (الشركة): <b>${esc(p.s1)}</b>`, p.s2 && `🛠 إشراف موقع (شغل خاص): <b>${esc(p.s2)}</b>`].filter(Boolean);
  return `
<div class="dn"><button data-nav="-1">‹</button><div><b>${DAYS[di]}</b><small>${fmt(d)}${isToday ? ' • اليوم' : ''}</small></div><button data-nav="1">›</button></div>
${isToday ? '' : '<button class="tdy" data-nav="0">العودة لليوم</button>'}
<div class="card pr"><div class="dl"><b>${hij(d)}</b><span>${fmt(d)} ${d.getFullYear()} م</span></div>
<div class="nx" id="nx">${isToday ? nextTxt() : ''}</div>
<div class="pg">${prayers(d).map(x => `<div class="${x[0] === 'الشروق' ? 'sr' : ''}"><small>${x[0]}</small><b>${hm(x[1])}</b></div>`).join('')}</div><small class="pc">📍 ${place()[0]}</small></div>
<div class="card hero"><div class="ring ${rcls(pct)}" style="--p:${pct}"><span>${pct}%</span></div>
 <div><b>إنجاز اليوم</b><div class="sm">${rate(pct)}</div><div class="sm">8:30 ص — مراجعة إنجاز أمس: <b>${yp}%</b></div></div></div>
${sites.length ? `<div class="card sites">${sites.join('<br>')}</div>` : ''}
${ITEMS.map(it => {
    if (isNA(it.k, di)) return `<div class="card it na"><div class="ih"><span class="ic">${it.ic}</span><div><b>${it.t}</b><small>غير مطلوب اليوم</small></div></div></div>`;
    const v = (t.s || {})[it.k];
    return `<div class="card it ${v ? 'd' + ST.indexOf(v) : ''}"><div class="ih"><span class="ic">${it.ic}</span><div><b>${it.t}</b><small>${it.tm}</small></div></div>
<div class="pl">${esc(it.plan(p) || '—')}</div>${extra(it, di, cur, t)}<div class="chs" data-item="${it.k}">${chips(v, 'data-set')}</div></div>`;
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
  const done = D.books.filter((_, i) => S.books[i] === 'تم').length, part = D.books.filter((_, i) => S.books[i] === 'جزئي').length;
  return `<div class="card hero"><div class="ring ${rcls(Math.round((done + part / 2) * 10))}" style="--p:${Math.round((done + part / 2) * 10)}"><span>${done}/${D.books.length}</span></div><div><b>خطة الكتب الشرعية</b><div class="sm">فبراير ومارس 2027 • المخرج: مذكرة مبسطة بأسلوب الكشكول</div></div></div>
${D.books.map((b, i) => `<div class="card bk"><div class="bh"><span class="tag">${esc(b.day)}</span><span class="tag t2">${esc(b.branch)}</span></div>
<h4>${esc(b.book)}</h4><div class="sm">${esc(b.author)}</div>
<p>${esc(b.why)}</p><div class="kv"><b>أسابيع العمل:</b> ${esc(b.weeks)}</div><div class="kv"><b>الهدف:</b> ${esc(b.goal)}</div><div class="kv"><b>التالي:</b> ${esc(b.next)}</div>
<div class="chs" data-book="${i}">${chips(S.books[i], 'data-set')}</div></div>`).join('')}`;
}

function vContent() {
  return `<h3>السلاسل</h3>${D.series.map((s, i) => { const c = S.series[i] || 0, p = Math.min(100, Math.round(c * 100 / s.target)); return `<div class="card sr">
<div class="bh"><span class="tag">${esc(s.day)}</span><span class="tag t2">${esc(s.file)}</span></div><h4>${esc(s.name)}</h4>
<div class="do"><b>✅ اكتب:</b> ${esc(s.do)}</div><div class="dont"><b>⛔ تجنّب:</b> ${esc(s.dont)}</div>
<div class="cnt"><button data-sr="${i}" data-d="-1">−</button><div><b>${c} / ${s.target}</b><div class="bar"><i class="${rcls(p)}" style="width:${p}%"></i></div></div><button data-sr="${i}" data-d="1">+</button></div></div>`; }).join('')}
<h3>قواعد عامة</h3>${D.rules.map(r => `<div class="card rl ${r.k === 'افعل' ? 'do' : 'dont'}"><b>${r.k === 'افعل' ? '✅ افعل' : '⛔ لا تفعل'}</b><p>${esc(r.t)}</p></div>`).join('')}`;
}

function vPlan() {
  const st = parse(D.meta.start), en = parse(D.meta.end), now = new Date(), nowI = iso(now);
  const dd = Math.ceil((st - new Date(nowI.slice(0, 10) + 'T00:00:00')) / 864e5);
  const note = dd > 0 ? `تبدأ الخطة بعد ${dd} يوم (${fmt(st)})` : (nowI > D.meta.end ? 'انتهت الفترة' : 'الخطة جارية');
  return `<div class="card hero"><div class="ring g" style="--p:${Math.round(D.weeks.filter((_, i) => S.weeks[i] === 'تم').length * 100 / D.weeks.length)}"><span>${D.weeks.filter((_, i) => S.weeks[i] === 'تم').length}/${D.weeks.length}</span></div>
<div><b>الجدول الزمني</b><div class="sm">${fmt(st)} – ${fmt(en)} 2027</div><div class="sm">${note}</div><div class="sm">رمضان تقريبًا: ${fmt(parse(D.meta.rs))} – ${fmt(parse(D.meta.re))}</div></div></div>
${D.weeks.map((w, i) => {
    const now = nowI >= w.frm && nowI <= w.to;
    const rows = [['السبت', w.sat], ['الأحد', w.sun], ['الاثنين', w.mon], ['الثلاثاء', w.tue], ['الأربعاء', w.wed], ['الخميس', w.thu], ['التفريغ', w.taf], ['المحتوى', w.content]];
    return `<div class="card wk${now ? ' now' : ''}"><div class="bh"><b>الأسبوع ${w.n}</b><span class="sm">${fmt(parse(w.frm))} – ${fmt(parse(w.to))}</span>${w.ram ? '<span class="tag t3">رمضان</span>' : ''}${now ? '<span class="tag">الآن</span>' : ''}</div>
${rows.map(r => `<div class="kv"><b>${r[0]}:</b> ${esc(r[1])}</div>`).join('')}${w.name ? `<div class="kv"><b>الاسم:</b> ${esc(w.name)}</div>` : ''}
<div class="chs" data-week="${i}">${chips(S.weeks[i], 'data-set')}</div></div>`;
  }).join('')}
<h3>دفعات التفريغ — م. أيمن عبد الرحيم</h3>
${D.batches.map((b, i) => { const x = S.batches[i] || {}; return `<div class="card"><b>${esc(b.n)}: ${esc(b.series)}</b><div class="kv">المحاضرات ${esc(b.lec)} • الأسابيع ${esc(b.weeks)}</div><div class="kv">موعد اقتراح الاسم: ${fmt(parse(b.suggest))}</div>
<input class="bn" data-bn="${i}" placeholder="اسم الكتيب" value="${esc(x.name ?? b.name)}"><div class="chs" data-batch="${i}">${chips(x.st, 'data-set')}</div></div>`; }).join('')}
<div class="card sm">طريقة العمل: تفريغ آلي ← مراجعة على الصوت ← تقسيم وعناوين جانبية ← تخريج الآيات والأحاديث ← كتيب PDF.</div>`;
}

function nextTxt() {
  const now = new Date();
  for (let k = 0; k < 2; k++) {
    const d = addDays(now, k);
    for (const [n, t] of prayers(d)) if (n !== 'الشروق' && t > now) { const m = Math.round((t - now) / 6e4), h = Math.floor(m / 60); return `الصلاة القادمة: <b>${n}</b> ${hm(t)} — بعد ${h ? h + ' س و ' : ''}${m % 60} د`; }
  }
  return '';
}
let cm = (() => { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() }; })();
function vCal() {
  const first = new Date(cm.y, cm.m, 1), nd = new Date(cm.y, cm.m + 1, 0).getDate(), off = dIdx(first), today = iso(new Date());
  let cells = '';
  for (let i = 0; i < off; i++) cells += '<i></i>';
  for (let n = 1; n <= nd; n++) {
    const dt = new Date(cm.y, cm.m, n), k = iso(dt), has = (S.ev[k] || []).length, tr = S.track[k] && dayPct(k) > 0;
    cells += `<button class="cd${k === today ? ' tdy2' : ''}${k === cur ? ' sel' : ''}" data-cal="${k}"><b>${n}</b><small>${hijD(dt)}</small><u>${has ? '<s class="e"></s>' : ''}${tr ? '<s class="t"></s>' : ''}</u></button>`;
  }
  const mn = first.toLocaleDateString(LOC, { month: 'long', year: 'numeric' }), hmn = (() => { try { return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { month: 'long', year: 'numeric' }).format(new Date(cm.y, cm.m, 15)); } catch (e) { return ''; } })();
  const d = parse(cur), evs = S.ev[cur] || [];
  return `<div class="dn"><button data-cm="-1">‹</button><div><b>${mn}</b><small>${hmn}</small></div><button data-cm="1">›</button></div>
<div class="card cal"><div class="cw">${DAYS.map(x => `<small>${x.replace('ال', '')}</small>`).join('')}</div><div class="cg">${cells}</div></div>
<div class="card"><b>${fmtL(d)}</b><small>${hij(d)}</small>
<div class="pg mini">${prayers(d).map(x => `<div><small>${x[0]}</small><b>${hm(x[1])}</b></div>`).join('')}</div>
<button class="big s" data-go="${cur}">فتح خطة هذا اليوم (${dayPct(cur)}%)</button></div>
<h3>مواعيد وملاحظات هذا اليوم</h3>
${evs.length ? evs.map(e => `<div class="card ev"><div><b>${esc(e.t)}</b><small>${e.tm ? '⏰ ' + e.tm : 'بدون وقت'}${e.rem && e.tm ? ' • مع تنبيه' : ''}</small></div><button data-evdel="${e.id}">🗑</button></div>`).join('') : '<div class="card sm">لا يوجد شيء — أضف موعدًا من الأسفل.</div>'}
<div class="card"><b>إضافة موعد / ملاحظة</b><input id="evt" class="bn" placeholder="العنوان (مثال: اجتماع، موعد دكتور، سداد فاتورة)"><div class="fr"><input id="evm" type="time" class="bn"><label><input type="checkbox" id="evr" checked> تنبيه</label></div><button class="big" data-evadd>➕ إضافة</button></div>`;
}

function render() {
  const v = $('#view'), top = v.scrollTop;
  v.innerHTML = { today: vToday, week: vWeek, books: vBooks, content: vContent, cal: vCal, plan: vPlan }[tab]();
  v.scrollTop = top;
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  $('#sub').textContent = fmt(new Date()) + ' • ' + hij(new Date());
}

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.dataset.tab) { tab = t.dataset.tab; $('#view').scrollTop = 0; render(); return; }
  if (t.id === 'gear') { openSheet(); return; }
  if (t.dataset.nav !== undefined) { cur = t.dataset.nav === '0' ? iso(new Date()) : iso(addDays(parse(cur), +t.dataset.nav)); $('#view').scrollTop = 0; render(); return; }
  if (t.dataset.wk) { cur = iso(addDays(parse(cur), +t.dataset.wk)); render(); return; }
  if (t.dataset.cm) { cm.m += +t.dataset.cm; if (cm.m < 0) { cm.m = 11; cm.y--; } if (cm.m > 11) { cm.m = 0; cm.y++; } render(); return; }
  if (t.dataset.cal) { cur = t.dataset.cal; render(); return; }
  if (t.hasAttribute('data-evadd')) { const ti = $('#evt').value.trim(); if (!ti) { toast('اكتب العنوان'); return; } (S.ev[cur] = S.ev[cur] || []).push({ id: Date.now() + '', t: ti, tm: $('#evm').value, rem: $('#evr').checked }); S.ev[cur].sort((a, b) => (a.tm || '99').localeCompare(b.tm || '99')); save(); render(); sched(); return; }
  if (t.dataset.evdel) { S.ev[cur] = (S.ev[cur] || []).filter(e => e.id !== t.dataset.evdel); save(); render(); sched(); return; }
  if (t.dataset.go) { cur = t.dataset.go; tab = 'today'; $('#view').scrollTop = 0; render(); return; }
  if (t.dataset.sr !== undefined) { const i = t.dataset.sr; S.series[i] = Math.max(0, (S.series[i] || 0) + +t.dataset.d); save(); render(); return; }
  if (t.dataset.gym !== undefined) { const x = S.track[cur] = S.track[cur] || { s: {}, n: '' }, i = +t.dataset.gym, n = gymParts(PLAN[dIdx(parse(cur))]).parts.length; x.g = x.g || []; x.g = x.g.includes(i) ? x.g.filter(a => a !== i) : [...x.g, i]; x.s.gym = x.g.length === 0 ? undefined : x.g.length >= n ? 'تم' : 'جزئي'; save(); render(); return; }
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
/* ---------- notifications ---------- */
async function sched(ask) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    let pm = await LocalNotifications.checkPermissions();
    if (pm.display !== 'granted' && ask) pm = await LocalNotifications.requestPermissions();
    if (pm.display !== 'granted') return;
    try { await LocalNotifications.createChannel({ id: 'pray', name: 'مواقيت الصلاة', importance: 5, vibration: true, visibility: 1 }); await LocalNotifications.createChannel({ id: 'plan', name: 'الخطة والمفكرة', importance: 4, vibration: true, visibility: 1 }); } catch (e) { }
    const pend = await LocalNotifications.getPending(); if (pend.notifications.length) await LocalNotifications.cancel({ notifications: pend.notifications.map(x => ({ id: x.id })) });
    const now = new Date(), N = S.set.n, list = []; let evn = 0;
    const add = (id, at, title, body, ch) => { if (at > now) list.push({ id, title, body, channelId: ch, schedule: { at, allowWhileIdle: true } }); };
    const atT = (d, hh, mm) => { const x = new Date(d); x.setHours(hh, mm, 0, 0); return x; };
    for (let k = 0; k < 7; k++) {
      const d = addDays(now, k), di = dIdx(d), base = (k + 1) * 1000, pr = prayers(d), pp = p => pr.find(x => x[0] === p)[1], hd = hij(d), key = iso(d);
      if (N.pray) {
        ['الفجر', 'الظهر', 'العصر', 'المغرب', 'العشاء'].forEach((n, i) => {
          const t = pp(n); add(base + i, t, `🕌 حان وقت صلاة ${n}`, `${hm(t)} • ${hd}`, 'pray');
          if (S.set.pre > 0) add(base + 10 + i, new Date(t.getTime() - S.set.pre * 6e4), `بعد ${S.set.pre} دقائق: صلاة ${n}`, hm(t), 'pray');
        });
        add(base + 5, pp('الشروق'), '🌅 الشروق', 'انتهى وقت الفجر — الضحى بعد 15 دقيقة', 'plan');
      }
      if (N.adhkar) { add(base + 20, new Date(pp('الفجر').getTime() + 30 * 6e4), '📿 أذكار الصباح', 'ابدأ يومك بالأذكار والورد', 'plan'); add(base + 21, new Date(pp('العصر').getTime() + 20 * 6e4), '📿 أذكار المساء', 'أذكار المساء + الصلاة على النبي ﷺ', 'plan'); }
      if (N.tasks) {
        const fri = di === 6, p = PLAN[di];
        add(base + 30, atT(d, 6, 45), '🚶 مشي صباحي', '15 دقيقة قبل الخروج من البيت', 'plan');
        add(base + 31, atT(d, 8, 30), '📊 مراجعة إنجاز أمس', `إنجاز أمس: ${dayPct(iso(addDays(d, -1)))}%`, 'plan');
        if (!fri) {
          add(base + 32, atT(d, 7, 0), '🏗 المهمة الفنية', [p.fnl, p.revit].filter(Boolean).join(' + ') + (p.s1 ? ' • زيارة: ' + p.s1 : ''), 'plan');
          add(base + 33, atT(d, 12, 30), '💼 الشغل الخاص', p.s2 ? 'إشراف: ' + p.s2 : 'ابدأ الشغل الخاص', 'plan');
          add(base + 34, atT(d, 13, 30), '📖 العلم الشرعي', `${p.sharia} + ${p.taf || ''}`, 'plan');
          add(base + 35, atT(d, 15, 0), '✍️ المحتوى', p.content, 'plan');
        }
        add(base + 36, atT(d, 17, 30), '🏋️ الجيم / النشاط', p.gym, 'plan');
        add(base + 37, atT(d, 20, 30), '📗 ورد القرآن والحفظ', '6 صفحات + وجه حفظ', 'plan');
      }
      if (N.log) add(base + 40, atT(d, 21, 30), '✅ سجّل إنجاز اليوم', 'افتح خطتي وحدّد تم / جزئي / لم يتم', 'plan');
      if (N.ev) (S.ev[key] || []).forEach(e => { if (e.rem && e.tm) { const [h, m] = e.tm.split(':').map(Number); add(50000 + (++evn), atT(d, h, m), '📅 ' + e.t, hij(d), 'plan'); } });
    }
    if (list.length) await LocalNotifications.schedule({ notifications: list });
    S.set.scheduled = list.length; save();
  } catch (e) { S.set.err = String(e.message || e); }
}

/* ---------- updates ---------- */
let VER = 0; fetch('version.json').then(r => r.json()).then(j => { VER = j.v || 0; }).catch(() => { });
async function checkUpdate() {
  try {
    const r = await fetch('https://api.github.com/repos/mohamedkhalaf003-hash/engineer-pen/releases?per_page=40'); const j = await r.json();
    const rel = j.filter(x => /^khotati-plan-v1\.\d+$/.test(x.tag_name)).sort((a, b) => +b.tag_name.split('.').pop() - +a.tag_name.split('.').pop())[0];
    if (!rel) return toast('لا توجد نسخة منشورة');
    const n = +rel.tag_name.split('.').pop(); if (n <= VER) return toast('أنت على آخر نسخة ✔ (' + VER + ')');
    const as = rel.assets.find(a => /\.apk$/.test(a.name)); if (!as) return toast('النسخة غير جاهزة بعد');
    if (confirm('يوجد تحديث جديد (' + n + '). تنزيله الآن؟ (بياناتك تبقى كما هي إن كان التوقيع نفسه، وخذ نسخة احتياطية أولًا)')) Browser.open({ url: as.browser_download_url });
  } catch (e) { toast('تعذر الاتصال بالإنترنت'); }
}

function openSheet() {
  const s = $('#sheet'); s.hidden = false; const N = S.set.n;
  s.innerHTML = `<div class="box scr"><h3>⚙️ الإعدادات</h3>
<b>📍 المدينة (مواقيت الصلاة)</b>
<select id="city">${Object.entries(CITIES).map(([k, v]) => `<option value="${k}"${S.set.city === k ? ' selected' : ''}>${v[0]}</option>`).join('')}${S.set.lat != null ? `<option value="gps"${S.set.city === 'gps' ? ' selected' : ''}>موقعي الحالي (GPS)</option>` : ''}</select>
<button class="big s" id="gps">📡 استخدم موقعي الحالي</button>
<b>🔔 التنبيهات</b>
${[['pray', 'مواقيت الصلاة'], ['adhkar', 'الأذكار'], ['tasks', 'مهام الخطة اليومية'], ['log', 'تذكير تسجيل الإنجاز'], ['ev', 'مواعيد المفكرة']].map(x => `<label class="tg"><input type="checkbox" data-n="${x[0]}"${N[x[0]] ? ' checked' : ''}> ${x[1]}</label>`).join('')}
<label class="tg">تنبيه قبل الأذان: <select id="pre"><option value="0">بدون</option><option value="5">5 د</option><option value="10">10 د</option><option value="15">15 د</option><option value="20">20 د</option></select></label>
<button class="big" id="nt">🔔 تفعيل / تحديث التنبيهات الآن</button>
<div class="sm">${S.set.scheduled != null ? 'مجدولة: ' + S.set.scheduled + ' تنبيه (7 أيام) — تتجدد تلقائيًا كل مرة تفتح فيها التطبيق' : 'اضغط الزر لمنح الإذن'}${S.set.err ? '<br>' + esc(S.set.err) : ''}</div>
<b>🔄 التحديث</b>
<button class="big s" id="up">⬇️ البحث عن نسخة جديدة (يحتاج إنترنت)</button>
<button class="big s" id="ip">📋 استيراد ملف الخطة المحدّثة (plan.json)</button>
<button class="big s" id="ep">📤 تصدير ملف الخطة الحالية</button>
<div class="sm">نسخة التطبيق: ${VER || '—'}${S.custom ? ' • الخطة المستوردة مفعّلة' : ''}</div>
<b>💾 النسخ الاحتياطي</b>
<button class="big" id="ex1">💾 حفظ نسخة احتياطية (JSON)</button>
<button class="big" id="ex2">📊 تصدير المتابعة اليومية (Excel / CSV)</button>
<button class="big s" id="im">📥 استرجاع نسخة احتياطية</button>
<button class="big danger" id="rs">🗑 مسح كل البيانات</button>
<button class="big s" id="cl">إغلاق</button><input type="file" id="fi" accept=".json,application/json" hidden><input type="file" id="fp" accept=".json,application/json" hidden></div>`;
  $('#pre').value = String(S.set.pre);
  $('#cl').onclick = () => s.hidden = true;
  $('#city').onchange = e => { S.set.city = e.target.value; save(); render(); sched(); };
  $('#pre').onchange = e => { S.set.pre = +e.target.value; save(); sched(); };
  s.querySelectorAll('[data-n]').forEach(c => c.onchange = () => { S.set.n[c.dataset.n] = c.checked; save(); sched(); });
  $('#nt').onclick = async () => { await sched(true); if (Capacitor.isNativePlatform()) { try { const x = await LocalNotifications.checkExactNotificationSetting(); if (x.exact_alarm !== 'granted') { toast('فعّل «المنبهات والتذكيرات» للتطبيق ليصل التنبيه في وقته بالضبط'); await LocalNotifications.changeExactNotificationSetting(); } } catch (e) { } } openSheet(); };
  $('#gps').onclick = () => { navigator.geolocation ? navigator.geolocation.getCurrentPosition(p => { S.set.lat = p.coords.latitude; S.set.lng = p.coords.longitude; S.set.city = 'gps'; save(); render(); sched(); openSheet(); toast('تم تحديد موقعك'); }, () => toast('تعذر تحديد الموقع — فعّل الموقع وصلاحيته'), { timeout: 15000 }) : toast('الموقع غير متاح'); };
  $('#up').onclick = checkUpdate;
  $('#ep').onclick = () => out('khotati-plan-' + stamp() + '.json', JSON.stringify(D), 'application/json');
  $('#ip').onclick = () => $('#fp').click();
  $('#fp').onchange = async e => { try { const j = JSON.parse(await e.target.files[0].text()); if (!j.books || !j.weeks || !j.plan) throw 0; S.custom = j; save(); toast('تم تحديث الخطة'); setTimeout(() => location.reload(), 800); } catch (x) { toast('ملف الخطة غير صالح'); } };
  $('#ex1').onclick = () => out('khotati-backup-' + stamp() + '.json', JSON.stringify(S), 'application/json');
  $('#ex2').onclick = () => out('khotati-daily-' + stamp() + '.csv', csv(), 'text/csv');
  $('#im').onclick = () => $('#fi').click();
  $('#fi').onchange = async e => { try { const j = JSON.parse(await e.target.files[0].text()); for (const k of ['track', 'books', 'series', 'weeks', 'batches', 'ev']) S[k] = j[k] || {}; if (j.set) S.set = j.set; if (j.custom) S.custom = j.custom; save(); s.hidden = true; toast('تم الاسترجاع'); setTimeout(() => location.reload(), 600); } catch (x) { toast('الملف غير صالح'); } };
  $('#rs').onclick = () => { if (confirm('مسح كل البيانات؟ لا يمكن التراجع.')) { localStorage.removeItem(KEY); location.reload(); } };
}
render(); sched();
setInterval(() => { const n = $('#nx'); if (n && tab === 'today' && cur === iso(new Date())) n.innerHTML = nextTxt(); }, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { render(); sched(); } });
