const { app, BrowserWindow, Tray, Menu, shell, nativeImage, Notification, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
app.setAppUserModelId('com.mohamed.khotati.desktop');
if (!app.requestSingleInstanceLock()) { app.quit(); }
let win, tray, quitting = false;
function show() { if (!win) return; if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
function create() {
  win = new BrowserWindow({ width: 1100, height: 800, minWidth: 380, minHeight: 600, backgroundColor: '#101826', autoHideMenuBar: true, title: 'خطتي', icon: path.join(__dirname, 'icon.png'), webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, backgroundThrottling: false } });
  win.setMenuBarVisibility(false); win.maximize();
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.on('close', e => { if (!quitting) { e.preventDefault(); win.hide(); } });
  const hidden = process.argv.includes('--hidden');
  if (hidden) win.hide();
}
app.on('second-instance', show);
app.whenReady().then(() => {
  create();
  const ic = nativeImage.createFromPath(path.join(__dirname, 'icon.png')).resize({ width: 20, height: 20 });
  tray = new Tray(ic); tray.setToolTip('خطتي');
  const auto = () => app.getLoginItemSettings().openAtLogin;
  const menu = () => Menu.buildFromTemplate([
    { label: 'فتح خطتي', click: show },
    { label: 'التشغيل مع ويندوز', type: 'checkbox', checked: auto(), click: i => app.setLoginItemSettings({ openAtLogin: i.checked, args: ['--hidden'] }) },
    { type: 'separator' },
    { label: 'خروج (توقف التنبيهات)', click: () => { quitting = true; app.quit(); } }
  ]);
  tray.setContextMenu(menu()); tray.on('click', show);
  if (!app.getLoginItemSettings().wasOpenedAtLogin && !process.argv.includes('--hidden')) { try { app.setLoginItemSettings({ openAtLogin: true, args: ['--hidden'] }); } catch (e) { } }
});
app.on('window-all-closed', () => { });

/* ---- التنبيهات من العملية الرئيسية (لا تتأثر بإخفاء النافذة في الصينية) ---- */
let list = [], fired = {}, firedFile;
function loadFired() { try { firedFile = path.join(app.getPath('userData'), 'fired.json'); fired = JSON.parse(fs.readFileSync(firedFile, 'utf8')); } catch (e) { fired = {}; } }
function saveFired() { try { const lim = Date.now() - 864e5; for (const k of Object.keys(fired)) if (fired[k] < lim) delete fired[k]; fs.writeFileSync(firedFile, JSON.stringify(fired)); } catch (e) { } }
function notify(title, body) {
  try { const n = new Notification({ title, body, icon: path.join(__dirname, 'icon.png'), silent: false }); n.on('click', show); n.show(); } catch (e) { }
  try { if (win && !win.isDestroyed()) win.webContents.send('k:fired', title + ' — ' + body); } catch (e) { }
}
function tick() {
  const now = Date.now(); let ch = false;
  for (const n of list) {
    const k = n.id + '-' + n.at;
    if (n.at <= now && n.at > now - 600000 && !fired[k]) { fired[k] = now; ch = true; notify(n.title, n.body); }
  }
  if (ch) saveFired();
}
ipcMain.on('k:list', (e, l) => { list = Array.isArray(l) ? l.filter(x => x && Number.isFinite(x.at)) : []; });
ipcMain.handle('k:test', (e, t, b) => { const ok = Notification.isSupported(); if (ok) notify(t, b); return ok; });
app.whenReady().then(() => { loadFired(); setInterval(tick, 10000); });
