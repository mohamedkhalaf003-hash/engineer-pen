const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
app.setAppUserModelId('com.mohamed.engineerpen.desktop');
if (!app.requestSingleInstanceLock()) app.quit();
let win;
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => {
  win = new BrowserWindow({ width: 1280, height: 860, minWidth: 600, minHeight: 500, backgroundColor: '#111827', autoHideMenuBar: true, title: 'Engineer Pen', icon: path.join(__dirname, 'icon.png'), webPreferences: { backgroundThrottling: false } });
  win.setMenuBarVisibility(false); win.maximize();
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
});
app.on('window-all-closed', () => app.quit());
