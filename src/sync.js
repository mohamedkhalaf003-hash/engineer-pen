/* مزامنة جلسة Engineer Pen بين الأجهزة عبر Gist سري مشفّر. المفتاح يُدخَل مرة واحدة على كل جهاز ويُحفظ محليًا فقط. */
const GH = 'https://api.github.com', FN = 'engpen.json', DESC = 'engpen-sync', MAX = 9e6;
const b64 = u => { let s = ''; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s); };
const unb64 = x => Uint8Array.from(atob(x), c => c.charCodeAt(0));
let ck = null;
async function ckey(tok) {
  if (ck && ck.t === tok) return ck.k;
  const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(tok), 'PBKDF2', false, ['deriveKey']);
  const k = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: new TextEncoder().encode('engpen-sync-v1'), iterations: 100000, hash: 'SHA-256' }, km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  ck = { t: tok, k }; return k;
}
async function enc(obj, tok) {
  const raw = new TextEncoder().encode(JSON.stringify(obj)), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await ckey(tok), raw));
  return JSON.stringify({ v: 1, iv: b64(iv), ct: b64(ct) });
}
async function dec(txt, tok) {
  const j = JSON.parse(txt);
  try { return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(j.iv) }, await ckey(tok), unb64(j.ct)))); } catch (e) { throw new Error('المفتاح مختلف عن الجهاز الآخر'); }
}
async function gh(path, tok, opt = {}) {
  const r = await fetch(GH + path, { ...opt, headers: { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json', ...(opt.body ? { 'Content-Type': 'application/json' } : {}) } });
  if (!r.ok) throw new Error(r.status === 401 ? 'المفتاح غير صالح أو منتهي' : r.status === 403 || r.status === 404 ? 'المفتاح بلا صلاحية gist' : 'خطأ GitHub ' + r.status);
  return r.status === 204 ? null : r.json();
}
export function initSync({ snapshot, kvGet, kvSet, toast }) {
  const L = k => localStorage.getItem(k); let busy = false, lastEdit = 0, errShown = false, timer;
  const pack = () => { const s = snapshot(); return { orient: s.orient, panes: s.panes.map(p => ({ ...p, bytes: p.bytes ? b64(p.bytes instanceof Uint8Array ? p.bytes : new Uint8Array(p.bytes)) : null })) }; };
  const unpack = d => ({ orient: d.orient, panes: d.panes.map(p => ({ ...p, bytes: p.bytes ? unb64(p.bytes) : null })) });
  const find = async tok => (await gh('/gists?per_page=100', tok)).filter(x => x.description === DESC && x.files && x.files[FN]).sort((a, b) => (a.created_at < b.created_at ? -1 : 1))[0];
  async function tick() {
    const tok = L('ep_tok'); if (!tok || busy) return; busy = true;
    try {
      let gid = L('ep_gid');
      if (!gid) { const g = await find(tok); if (g) { gid = g.id; localStorage.ep_gid = gid; } }
      let remote = null;
      if (gid) {
        const g = await gh('/gists/' + gid, tok), f = g.files[FN];
        if (f) { const txt = f.truncated ? await (await fetch(f.raw_url, { headers: { Authorization: 'Bearer ' + tok } })).text() : f.content; if (txt) remote = await dec(txt, tok); }
      }
      const mt = +L('ep_mt') || 0;
      if (remote && remote.t > mt) {
        if (Date.now() - lastEdit < 5000) { busy = false; setTimeout(tick, 6000); return; }
        const prev = await kvGet('state'); if (prev) await kvSet('state_prev', prev);
        api.applying = true; await kvSet('state', unpack(remote.state)); localStorage.ep_mt = String(remote.t); toast('وصلت جلسة محدّثة من الجهاز الآخر'); setTimeout(() => location.reload(), 800); return;
      }
      if (!remote || mt > remote.t) {
        const t = mt || Date.now(), content = await enc({ t, state: pack() }, tok);
        if (content.length > MAX) { if (!errShown) { errShown = true; toast('الجلسة كبيرة على المزامنة (أكثر من 9 ميجا)'); } }
        else if (!gid) { const g = await gh('/gists', tok, { method: 'POST', body: JSON.stringify({ description: DESC, public: false, files: { [FN]: { content } } }) }); const g2 = await find(tok); gid = g2 ? g2.id : g.id; localStorage.ep_gid = gid; if (g2 && g2.id !== g.id) { try { await gh('/gists/' + g.id, tok, { method: 'DELETE' }); } catch (e) { } } localStorage.ep_mt = String(t); }
        else { await gh('/gists/' + gid, tok, { method: 'PATCH', body: JSON.stringify({ files: { [FN]: { content } } }) }); localStorage.ep_mt = String(t); }
      }
      errShown = false;
    } catch (e) { if (!errShown) { errShown = true; toast('المزامنة: ' + (e.message || e)); } }
    busy = false;
  }
  const soon = () => { if (!L('ep_tok')) return; clearTimeout(timer); timer = setTimeout(tick, 6000); };
  setInterval(tick, 60000); setTimeout(tick, 2500);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  const api = {
    applying: false, touch() { lastEdit = Date.now(); }, soon,
    async setup() {
      if (L('ep_tok')) { if (confirm('المزامنة شغّالة. فك الربط عن هذا الجهاز؟')) { ['ep_tok', 'ep_gid', 'ep_mt'].forEach(k => localStorage.removeItem(k)); toast('تم فك الربط'); } return; }
      const t = (prompt('الصق مفتاح المزامنة (نفس المفتاح على كل أجهزتك)') || '').trim(); if (!t) return;
      localStorage.ep_tok = t; localStorage.removeItem('ep_gid'); errShown = false; toast('جارٍ الربط…'); await tick();
      if (!errShown) toast('تم الربط ✔ — الجلسة تتزامن تلقائيًا'); else { localStorage.removeItem('ep_tok'); }
    }
  };
  return api;
}
