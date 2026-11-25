const { app, BrowserWindow, Tray, Menu, shell, nativeImage } = require('electron');
const path = require('path');
app.setAppUserModelId('com.mohamed.khotati.desktop');
if (!app.requestSingleInstanceLock()) { app.quit(); }
let win, tray, quitting = false;
function show() { if (!win) return; if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
function create() {
  win = new BrowserWindow({ width: 1100, height: 800, minWidth: 380, minHeight: 600, backgroundColor: '#101826', autoHideMenuBar: true, title: 'خطتي', icon: path.join(__dirname, 'icon.png'), webPreferences: { backgroundThrottling: false } });
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
