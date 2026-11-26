const { app, BrowserWindow, shell, ipcMain, dialog, net } = require('electron');
const path = require('path'), http = require('http'), fs = require('fs'), os = require('os'), cp = require('child_process');
const { Readable } = require('stream'), { pipeline } = require('stream/promises');
app.setAppUserModelId('com.mohamed.mashari3.desktop');
if (!app.requestSingleInstanceLock()) app.quit();
let win;
const ROOT = path.join(__dirname, 'app');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.wasm': 'application/wasm', '.gz': 'application/gzip', '.bcmap': 'application/octet-stream', '.pfb': 'application/octet-stream', '.ttf': 'font/ttf' };
function serve(port) {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      let f = decodeURIComponent(q.url.split('?')[0]); if (f === '/') f = '/index.html';
      const fp = path.normalize(path.join(ROOT, f));
      if (!fp.startsWith(ROOT)) { r.writeHead(403); return r.end(); }
      fs.readFile(fp, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' }); r.end(d); });
    });
    srv.on('error', () => res(port < 47860 ? serve(port + 1) : serve(0)));
    srv.listen(port, '127.0.0.1', () => res(srv.address().port));
  });
}
/* ---- ربط الفولدرات ---- */
const SECS = ['مراجع', 'مدخلات', 'مخرجات', 'مستخلصات', 'جداول كميات', 'مخططات', 'مواد', 'تقارير'], EXT = /\.(pdf|png|jpe?g|txt|md|csv|xlsx|xls|dxf|dwg)$/i;
const cfgFile = () => path.join(app.getPath('userData'), 'folders.json');
const cfg = () => { try { return Object.assign({ root: '', map: {} }, JSON.parse(fs.readFileSync(cfgFile(), 'utf8'))); } catch (e) { return { root: '', map: {} }; } };
const saveCfg = c => { fs.mkdirSync(path.dirname(cfgFile()), { recursive: true }); fs.writeFileSync(cfgFile(), JSON.stringify(c)); };
const clean = s => String(s).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '').trim() || '_';
const projDir = (pid, name) => { const c = cfg(); return c.map[pid] || (c.root ? path.join(c.root, clean(name)) : null); };
const secDir = (pid, name, sec) => { const d = projDir(pid, name); if (!d || !SECS.includes(sec)) return null; const x = path.join(d, sec); fs.mkdirSync(x, { recursive: true }); return x; };
const pickDir = async (title, def) => {
  const r = await dialog.showOpenDialog(win, { title, defaultPath: def, properties: ['openDirectory', 'createDirectory'] });
  return r.canceled || !r.filePaths[0] ? null : r.filePaths[0];
};
ipcMain.handle('getRoot', () => cfg().root || '');
ipcMain.handle('pickRoot', async () => {
  const def = fs.existsSync('D:\\') ? 'D:\\' : app.getPath('documents');
  const d = await pickDir('اختار فولدر المشاريع (يفضّل على D:)', def); if (!d) return null;
  const c = cfg(); c.root = d; saveCfg(c); return d;
});
ipcMain.handle('folder', (e, pid, name) => projDir(pid, name));
ipcMain.handle('pickFolder', async (e, pid, name) => {
  const d = await pickDir('اختار فولدر مشروع «' + name + '»', projDir(pid, name) || undefined); if (!d) return null;
  const c = cfg(); c.map[pid] = d; saveCfg(c); return d;
});
ipcMain.handle('write', (e, pid, name, sec, fname, buf) => {
  const d = secDir(pid, name, sec); if (!d) return null;
  const fp = path.join(d, path.basename(clean(fname))); fs.writeFileSync(fp, Buffer.from(buf)); return fp;
});
const SKIP = /^(node_modules|\.git|\$RECYCLE\.BIN|System Volume Information)$/i;
function walk(base, dir, depth, out) {
  let items; try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const it of items) {
    if (it.name.startsWith('.') || it.name.startsWith('~$') || SKIP.test(it.name)) continue;
    const fp = path.join(dir, it.name);
    if (it.isDirectory()) { if (depth < 4) walk(base, fp, depth + 1, out); continue; }
    if (!EXT.test(it.name) || out.length > 3000) continue;
    try { const st = fs.statSync(fp), rel = path.relative(base, fp); out.push({ sec: rel.includes(path.sep) ? rel.split(path.sep)[0] : '', rel, name: it.name, size: st.size, mtime: st.mtimeMs }); } catch (e) { }
  }
}
ipcMain.handle('scan', (e, pid, name) => { const d = projDir(pid, name); if (!d || !fs.existsSync(d)) return []; const out = []; walk(d, d, 0, out); return out; });
ipcMain.handle('read', (e, pid, name, rel) => {
  const d = projDir(pid, name); if (!d) return null; const fp = path.normalize(path.join(d, rel)); if (!fp.startsWith(path.normalize(d + path.sep))) return null;
  try { const b = fs.readFileSync(fp); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); } catch (e) { return null; }
});
ipcMain.handle('open', (e, pid, name) => { const d = projDir(pid, name); if (!d) return; fs.mkdirSync(d, { recursive: true }); return shell.openPath(d); });
/* ---- تحديث مباشر من GitHub بدون متصفح ---- */
ipcMain.handle('update', async (e, url) => {
  try {
    if (!/^https:\/\/github\.com\/mohamedkhalaf003-hash\/engineer-pen\/releases\/download\//.test(url)) return false;
    const r = await net.fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status);
    const fp = path.join(os.tmpdir(), 'Mashari3-Setup.exe');
    await pipeline(Readable.fromWeb(r.body), fs.createWriteStream(fp));
    cp.spawn(fp, ['/S', '--updated', '--force-run'], { detached: true, stdio: 'ignore' }).unref(); app.quit(); return true;
  } catch (err) { dialog.showErrorBox('التحديث', 'فشل التحديث: ' + err.message); return false; }
});
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(async () => {
  const port = await serve(47841);
  win = new BrowserWindow({ width: 1280, height: 860, minWidth: 600, minHeight: 500, backgroundColor: '#eef1f6', autoHideMenuBar: true, title: 'مراجعة مشاريع', icon: path.join(__dirname, 'icon.png'), webPreferences: { backgroundThrottling: false, preload: path.join(__dirname, 'preload.js'), contextIsolation: true } });
  win.setMenuBarVisibility(false); win.maximize();
  win.loadURL('http://127.0.0.1:' + port + '/');
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
});
app.on('window-all-closed', () => app.quit());
