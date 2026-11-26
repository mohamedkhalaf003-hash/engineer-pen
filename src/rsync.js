/* ربط الجوال واللابتوب: مستودع GitHub خاص (data.json + files/<id>) عبر Contents API.
   التوكن بيتدخّل مرة واحدة على كل جهاز وبيتخزن محلياً بس. مفتاح Claude API ما بيتزامنش. */
const GH = 'https://api.github.com';
const L = k => localStorage.getItem(k);
const b64 = u => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
async function gh(path, tok, opt = {}) {
  const r = await fetch(GH + path, { ...opt, headers: { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(opt.body ? { 'Content-Type': 'application/json' } : {}), ...(opt.headers || {}) } });
  if (r.status === 401) throw new Error('التوكن غلط أو منتهي');
  return r;
}
export const hasLink = () => !!(L('rs_tok') && L('rs_repo'));
export const linkInfo = () => ({ repo: L('rs_repo') || '', tok: !!L('rs_tok'), last: +L('rs_last') || 0 });
export async function link(tok, name) {
  tok = tok.trim(); name = (name || 'mashari3-data').trim();
  const me = await (await gh('/user', tok)).json(); if (!me.login) throw new Error('التوكن مش شغال');
  const repo = name.includes('/') ? name : me.login + '/' + name;
  let r = await gh('/repos/' + repo, tok);
  if (r.status === 404) {
    r = await gh('/user/repos', tok, { method: 'POST', body: JSON.stringify({ name: repo.split('/')[1], private: true, auto_init: true, description: 'مراجعة مشاريع - بيانات' }) });
    if (!r.ok) throw new Error('مقدرتش أنشئ المستودع الخاص — اعمله بنفسك باسم ' + repo + ' أو اديني صلاحية Administration');
  } else if (!r.ok) throw new Error('مفيش وصول للمستودع ' + repo);
  localStorage.rs_tok = tok; localStorage.rs_repo = repo; return repo;
}
export function unlink() { ['rs_tok', 'rs_repo', 'rs_last'].forEach(k => localStorage.removeItem(k)); }

/* h: { D, save(skipHook), kvGet, kvSet, toast, rerender } */
export function initRepoSync(h) {
  let busy = false, timer = null, again = false; const st = { msg: '', ok: true };
  const clean = D => ({ v: 1, projects: D.projects, files: D.files, stamps: D.stamps, gone: D.gone || {}, t: Date.now() });
  function merge(rem) {
    const D = h.D; D.gone = D.gone || {}; let changed = false;
    for (const [k, t] of Object.entries(rem.gone || {})) if (!(D.gone[k] >= t)) { D.gone[k] = t; changed = true; }
    const dead = id => id in D.gone;
    for (const p of rem.projects || []) { const l = D.projects.find(x => x.id === p.id); if (!l) { if (!dead(p.id)) { D.projects.push(p); changed = true; } } else if ((p.t || 0) > (l.t || 0)) { Object.assign(l, p); changed = true; } }
    const before = D.projects.length; D.projects = D.projects.filter(p => !dead(p.id)); if (D.projects.length !== before) changed = true;
    for (const p of D.projects) {
      const F = D.files[p.id] = D.files[p.id] || Object.fromEntries(h.secs.map(k => [k, []])), R = (rem.files || {})[p.id] || {};
      for (const sec of h.secs) {
        for (const f of R[sec] || []) {
          if (dead(f.id)) continue;
          if (!F[sec].some(x => x.id === f.id)) {
            if (sec === 'out') { const i = F[sec].findIndex(x => x.name === f.name); if (i >= 0) { if (F[sec][i].t >= f.t) continue; F[sec].splice(i, 1); } }
            F[sec].push(f); changed = true;
          }
        }
        const n = F[sec].length; F[sec] = F[sec].filter(f => !dead(f.id)); if (F[sec].length !== n) changed = true;
      }
    }
    for (const s of rem.stamps || []) if (!dead(s.id) && !h.D.stamps.some(x => x.id === s.id)) { h.D.stamps.push(s); changed = true; }
    const n = D.stamps.length; D.stamps = D.stamps.filter(s => !dead(s.id)); if (D.stamps.length !== n) changed = true;
    return changed;
  }
  async function run(manual) {
    if (!hasLink()) { if (manual) h.toast('اربط الجهاز الأول من ⚙ الإعدادات'); return; }
    if (busy) { again = true; return; } busy = true;
    const tok = L('rs_tok'), repo = L('rs_repo');
    try {
      if (!navigator.onLine) throw new Error('مفيش نت');
      let sha = null, rem = null;
      const r = await gh(`/repos/${repo}/contents/data.json`, tok);
      if (r.ok) { const j = await r.json(); sha = j.sha; const raw = await gh(`/repos/${repo}/contents/data.json`, tok, { headers: { Accept: 'application/vnd.github.raw+json' } }); rem = await raw.json(); }
      else if (r.status !== 404) throw new Error('مشكلة في الوصول للمستودع (' + r.status + ')');
      let changed = rem ? merge(rem) : false;
      /* الملفات: نزّل الناقص ورفّع اللي مش موجود عند الطرف التاني */
      const tr = await gh(`/repos/${repo}/git/trees/HEAD?recursive=1`, tok), tree = tr.ok ? (await tr.json()).tree || [] : [];
      const have = new Set(tree.map(x => x.path));
      const ids = []; for (const p of h.D.projects) for (const sec of h.secs) for (const f of h.D.files[p.id][sec]) ids.push(f.id);
      let up = 0, down = 0;
      for (const id of ids) {
        const local = await h.kvGet('pjf:' + id);
        if (local && !have.has('files/' + id)) {
          const body = JSON.stringify({ message: 'file ' + id, content: b64(new Uint8Array(local)) });
          const pr = await gh(`/repos/${repo}/contents/files/${id}`, tok, { method: 'PUT', body });
          if (!pr.ok && pr.status !== 422) throw new Error('فشل رفع ملف (' + pr.status + ')'); up++;
        } else if (!local && have.has('files/' + id)) {
          const dr = await gh(`/repos/${repo}/contents/files/${id}`, tok, { headers: { Accept: 'application/vnd.github.raw+json' } });
          if (dr.ok) { await h.kvSet('pjf:' + id, await dr.arrayBuffer()); down++; changed = true; }
        }
      }
      const out = clean(h.D), body = JSON.stringify({ message: 'sync', content: b64(new TextEncoder().encode(JSON.stringify(out))), ...(sha ? { sha } : {}) });
      const same = rem && JSON.stringify({ ...clean(rem), t: 0 }) === JSON.stringify({ ...out, t: 0 });
      if (!same) {
        const pr = await gh(`/repos/${repo}/contents/data.json`, tok, { method: 'PUT', body });
        if (pr.status === 409 || pr.status === 422) { again = true; } else if (!pr.ok) throw new Error('فشل حفظ البيانات (' + pr.status + ')');
      }
      if (changed) { h.save(true); h.rerender(); h.after && h.after(); }
      localStorage.rs_last = String(Date.now()); st.ok = true; st.msg = '';
      if (manual) h.toast(`✔ تمت المزامنة${up || down ? ` (↑${up} ↓${down})` : ''}`);
    } catch (e) { st.ok = false; st.msg = e.message; if (manual) h.toast('❌ المزامنة: ' + e.message); }
    finally { busy = false; if (again) { again = false; setTimeout(() => run(false), 1500); } }
  }
  const soon = () => { if (!hasLink()) return; clearTimeout(timer); timer = setTimeout(() => run(false), 8000); };
  addEventListener('online', () => run(false)); document.addEventListener('visibilitychange', () => { if (!document.hidden) run(false); });
  setInterval(() => { if (!document.hidden) run(false); }, 120000);
  return { run, soon, status: () => st };
}
