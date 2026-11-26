import * as XLSX from 'xlsx';
const dt = v => { if (typeof v === 'number' && v > 30000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 864e5)); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0'); } return v; };
const dash = v => { v = v == null ? '' : String(v).trim(); return v === '—' || v === '-' ? '' : v; };
/** يحوّل ملف الإكسل إلى بيانات الخطة. ما لم يوجد في الملف يبقى كما هو في `old`. */
export function parseWorkbook(buf, old) {
  const wb = XLSX.read(buf, { type: 'array' });
  const rows = n => { const ws = wb.Sheets[n]; return ws ? XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true }) : null; };
  const out = { ...old }, found = [];
  const wk = rows('الخطة الأسبوعية');
  if (wk && wk.length >= 10) { const p = wk.slice(3, 10).map(r => ({ fnl: dash(r[1]), priv: dash(r[3]), sharia: dash(r[4]), gym: dash(String(r[6] || '').replace(/^بعد الدوام\s*/, '')), content: dash(r[7]), s1: dash(r[8]), s2: dash(r[9]) })); if (p.length === 7 && p[0].gym) { out.plan = p; found.push('الخطة الأسبوعية'); } }
  const b = rows('الكتب الشرعية');
  if (b) { out.books = b.slice(3).filter(r => r[0]).map(r => ({ day: r[0], branch: r[1], book: r[2], author: r[3], why: r[4], weeks: r[5], goal: r[6], next: r[7] })); found.push('الكتب الشرعية'); }
  const c = rows('خطة المحتوى');
  if (c) {
    out.series = c.filter(r => Number.isInteger(r[5])).map(r => ({ day: r[0], file: r[1], name: r[2], do: r[3], dont: r[4], target: r[5] }));
    out.rules = c.filter(r => r[0] === 'افعل' || r[0] === 'لا تفعل').map(r => ({ k: r[0], t: r[1] })); found.push('خطة المحتوى');
  }
  const s = (wb.SheetNames.filter(n => /^الجدول الزمني/.test(n)).map(rows)[0]);
  if (s) {
    out.weeks = s.filter(r => Number.isInteger(r[0])).map(r => ({ n: r[0], frm: dt(r[1]), to: dt(r[2]), ram: !!r[3], sat: r[4], sun: r[5], mon: r[6], tue: r[7], wed: r[8], thu: r[9], taf: r[10], content: r[11], name: r[12] ?? null }));
    out.batches = s.filter(r => r[0] && String(r[0]).startsWith('الكتيب')).map(r => ({ n: r[0], series: r[1], lec: String(r[2]), weeks: String(r[3]), suggest: dt(r[4]), name: r[5] || '' }));
    if (s[1]) out.meta = { start: dt(s[1][1]), end: dt(s[1][3]), rs: dt(s[1][5]), re: dt(s[1][7]) };
    found.push('الجدول الزمني');
  }
  if (!found.length) throw new Error('الملف لا يشبه ملف الخطة');
  out.books = out.books || []; out.weeks = out.weeks || [];
  return { data: out, found };
}
