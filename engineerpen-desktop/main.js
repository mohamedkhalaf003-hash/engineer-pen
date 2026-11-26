const { app, BrowserWindow, shell } = require('electron');
const path = require('path'), http = require('http'), fs = require('fs');
app.setAppUserModelId('com.mohamed.engineerpen.desktop');
if (!app.requestSingleInstanceLock()) app.quit();
let win;
const ROOT = path.join(__dirname, 'app');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.wasm': 'application/wasm', '.gz': 'application/gzip', '.bcmap': 'application/octet-stream', '.pfb': 'application/octet-stream', '.ttf': 'font/ttf' };
// Local server on a fixed port so the app has a stable origin (settings/sync token survive restarts)
function serve(port) {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      let f = decodeURIComponent(q.url.split('?')[0]); if (f === '/') f = '/index.html';
      const fp = path.normalize(path.join(ROOT, f));
      if (!fp.startsWith(ROOT)) { r.writeHead(403); return r.end(); }
      fs.readFile(fp, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' }); r.end(d); });
    });
    srv.on('error', () => res(port < 47850 ? serve(port + 1) : serve(0)));
    srv.listen(port, '127.0.0.1', () => res(srv.address().port));
  });
}
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(async () => {
  const port = await serve(47831);
  win = new BrowserWindow({ width: 1280, height: 860, minWidth: 600, minHeight: 500, backgroundColor: '#111827', autoHideMenuBar: true, title: 'Engineer Pen', icon: path.join(__dirname, 'icon.png'), webPreferences: { backgroundThrottling: false } });
  win.setMenuBarVisibility(false); win.maximize();
  win.loadURL('http://127.0.0.1:' + port + '/');
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
});
app.on('window-all-closed', () => app.quit());
