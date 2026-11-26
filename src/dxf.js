/* قراءة ملفات AutoCAD: DXF (نصي) يتحول لملخص قابل للمراجعة، DWG مقفول فيتعرّف عليه بس. */
const VER = { AC1009: 'R12', AC1012: 'R13', AC1014: 'R14', AC1015: '2000', AC1018: '2004', AC1021: '2007', AC1024: '2010', AC1027: '2013', AC1032: '2018+' };
const UNITS = { 1: 'inch', 2: 'ft', 4: 'mm', 5: 'cm', 6: 'm' };
export function dwgInfo(u8, name) {
  const v = String.fromCharCode(...u8.slice(0, 6));
  return `ملف DWG «${name}» (إصدار ${v} ${VER[v] || ''}) — صيغة AutoCAD مقفولة، البرنامج مش بيقدر يقراها. لمراجعته: صدّره من AutoCAD بصيغة DXF (SAVEAS ثم DXF) أو PDF وارفعه هنا.`;
}
const clean = t => t.replace(/\\[Pp]/g, ' ').replace(/\{?\\[fFcCHhQqWwAaTt][^;]*;/g, '').replace(/\\[Ss]([^;^]*)[\^/#]([^;]*);/g, '$1/$2').replace(/[{}]/g, '').replace(/%%[cC]/g, 'Ø').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±').replace(/\s+/g, ' ').trim();
export function dxfSummary(buf, name) {
  const u8 = new Uint8Array(buf);
  if (String.fromCharCode(...u8.slice(0, 18)).startsWith('AutoCAD Binary DXF')) return `ملف DXF «${name}» بصيغة ثنائية (Binary) — مش مدعوم. احفظه DXF نصي (ASCII).`;
  let text; try { text = new TextDecoder('utf-8', { fatal: false }).decode(u8); } catch (e) { return 'تعذّرت قراءة الملف'; }
  const L = text.split(/\r?\n/), ver = { v: '', u: 0 }, layers = {}, tableLayers = new Set(), blocksDef = new Set(), ins = {}, types = {}, texts = new Set();
  let sec = '', hdrVar = '', ent = null, bx0 = 1e18, by0 = 1e18, bx1 = -1e18, by1 = -1e18, inTbl = '', tblPending = false;
  const lay = n => layers[n] || (layers[n] = { n: 0, len: 0 });
  const finish = () => {
    if (!ent || sec !== 'ENTITIES') { ent = null; return; }
    const t = ent.t; if (t === 'VERTEX' || t === 'SEQEND') { ent = null; return; }
    types[t] = (types[t] || 0) + 1; const l = lay(ent.layer || '0'); l.n++;
    if (t === 'LINE' && ent.x.length >= 2 && ent.y.length >= 2) l.len += Math.hypot(ent.x[1] - ent.x[0], ent.y[1] - ent.y[0]);
    else if (t === 'LWPOLYLINE') { let s = 0; for (let i = 1; i < ent.x.length; i++) s += Math.hypot(ent.x[i] - ent.x[i - 1], ent.y[i] - ent.y[i - 1]); if ((ent.flag & 1) && ent.x.length > 2) s += Math.hypot(ent.x[0] - ent.x[ent.x.length - 1], ent.y[0] - ent.y[ent.y.length - 1]); l.len += s; }
    else if (t === 'CIRCLE' && ent.r) l.len += 2 * Math.PI * ent.r;
    if (t === 'INSERT' && ent.block) { const k = ent.block + ' | ' + (ent.layer || '0'); ins[k] = (ins[k] || 0) + 1; }
    if ((t === 'TEXT' || t === 'MTEXT' || t === 'ATTRIB') && ent.txt) { const c = clean(ent.txt); if (c && c.length > 1) texts.add(c.slice(0, 140)); }
    if (ent.x.length && ent.y.length) { for (const v of ent.x) { if (v < bx0) bx0 = v; if (v > bx1) bx1 = v; } for (const v of ent.y) { if (v < by0) by0 = v; if (v > by1) by1 = v; } }
    ent = null;
  };
  for (let i = 0; i + 1 < L.length; i += 2) {
    const code = parseInt(L[i], 10), val = L[i + 1].replace(/\s+$/, ''); if (Number.isNaN(code)) continue;
    if (code === 0) {
      finish();
      if (val === 'SECTION') { sec = '?'; continue; } if (val === 'ENDSEC') { sec = ''; continue; }
      if (sec === 'TABLES') { if (val === 'TABLE') inTbl = '?'; else if (val === 'LAYER') tblPending = true; continue; }
      if (sec === 'BLOCKS') { if (val === 'BLOCK') tblPending = 'B'; continue; }
      if (sec === 'ENTITIES') ent = { t: val, layer: '', x: [], y: [], flag: 0, r: 0, txt: '', block: '' };
      continue;
    }
    if (sec === '?' && code === 2) { sec = val; continue; }
    if (sec === 'HEADER') { if (code === 9) hdrVar = val; else if (hdrVar === '$ACADVER' && code === 1) ver.v = val; else if (hdrVar === '$INSUNITS' && code === 70) ver.u = +val; continue; }
    if (sec === 'TABLES' && tblPending === true && code === 2) { tableLayers.add(val); tblPending = false; continue; }
    if (sec === 'BLOCKS' && tblPending === 'B' && code === 2) { if (!val.startsWith('*')) blocksDef.add(val); tblPending = false; continue; }
    if (ent) {
      if (code === 8) ent.layer = val; else if (code === 10 || code === 11) ent.x.push(parseFloat(val)); else if (code === 20 || code === 21) ent.y.push(parseFloat(val));
      else if (code === 70) ent.flag = +val; else if (code === 40 && ent.t === 'CIRCLE') ent.r = parseFloat(val);
      else if (code === 1) ent.txt += val; else if (code === 3 && ent.t === 'MTEXT') ent.txt += val; else if (code === 2 && ent.t === 'INSERT') ent.block = val;
    }
  }
  finish();
  const un = UNITS[ver.u] || 'وحدة الرسم', f = n => Math.round(n).toLocaleString('en-US');
  const ly = Object.entries(layers).sort((a, b) => b[1].n - a[1].n);
  let out = `ملف DXF «${name}» — إصدار ${ver.v || '؟'} — الوحدات: ${un}\n`;
  if (bx1 > bx0) out += `أبعاد الرسم تقريبًا: ${f(bx1 - bx0)} × ${f(by1 - by0)} ${un}\n`;
  out += `\n## الطبقات (${tableLayers.size || ly.length}) — عدد العناصر وإجمالي الأطوال (${un}) للخطوط والبوليلاين والدوائر\n` + ly.slice(0, 150).map(([k, v]) => `${k}: ${v.n} عنصر${v.len ? '، طول ' + f(v.len) : ''}`).join('\n');
  const ia = Object.entries(ins).sort((a, b) => b[1] - a[1]);
  out += `\n\n## البلوكات المُدرجة (اسم البلوك | الطبقة: العدد) — إجمالي ${ia.reduce((s, x) => s + x[1], 0)}\n` + ia.slice(0, 200).map(([k, v]) => `${k}: ${v}`).join('\n');
  out += `\n\n## أنواع العناصر\n` + Object.entries(types).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join('، ');
  const ta = [...texts]; out += `\n\n## النصوص والتاجات (${ta.length}${ta.length > 400 ? '، أول 400' : ''})\n` + ta.slice(0, 400).join('\n');
  return out.slice(0, 150000);
}
