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
let list = [], fired = {}, firedFile, alarmOn = true;
function loadFired() { try { firedFile = path.join(app.getPath('userData'), 'fired.json'); fired = JSON.parse(fs.readFileSync(firedFile, 'utf8')); } catch (e) { fired = {}; } }
function saveFired() { try { const lim = Date.now() - 864e5; for (const k of Object.keys(fired)) if (fired[k] < lim) delete fired[k]; fs.writeFileSync(firedFile, JSON.stringify(fired)); } catch (e) { } }
const ALARM_HTML = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#101826;color:#fff;font-family:Segoe UI,Tahoma,sans-serif;text-align:center;direction:rtl"><div style="font-size:64px;margin-top:18px">⏰</div><h1 id="t" style="margin:6px 14px;font-size:26px"></h1><p id="b" style="color:#9fb3c8;margin:0 14px 18px;font-size:17px"></p><button onclick="alarmAct.act('stop')" style="font-size:22px;padding:12px 40px;border:0;border-radius:12px;background:#12a37f;color:#fff;cursor:pointer">إيقاف</button> <button onclick="alarmAct.act('snooze')" style="font-size:18px;padding:12px 24px;border:0;border-radius:12px;background:#2a3a52;color:#fff;cursor:pointer">غفوة 5 د</button><script>
document.getElementById('t').textContent=__T__;document.getElementById('b').textContent=__B__;
const A=new (window.AudioContext||window.webkitAudioContext)();function beep(f,t0,d){const o=A.createOscillator(),g=A.createGain();o.type='square';o.frequency.value=f;g.gain.setValueAtTime(0.0001,t0);g.gain.exponentialRampToValueAtTime(0.35,t0+0.01);g.gain.exponentialRampToValueAtTime(0.0001,t0+d);o.connect(g).connect(A.destination);o.start(t0);o.stop(t0+d+0.02)}
function round(){const n=A.currentTime+0.05;for(let i=0;i<4;i++){beep(i%2?988:1318,n+i*0.22,0.16)}}
A.resume();round();setInterval(()=>{A.resume();round()},1500);
</script>`;
let alarmWin = null, alarmCur = null, alarmTimer = null;
function closeAlarm() { clearTimeout(alarmTimer); try { if (alarmWin && !alarmWin.isDestroyed()) alarmWin.destroy(); } catch (e) { } alarmWin = null; }
function alarm(title, body) {
  closeAlarm(); alarmCur = { title, body };
  try {
    alarmWin = new BrowserWindow({ width: 480, height: 330, alwaysOnTop: true, center: true, resizable: false, minimizable: false, autoHideMenuBar: true, title: 'تنبيه خطتي', icon: path.join(__dirname, 'icon.png'), backgroundColor: '#101826', webPreferences: { preload: path.join(__dirname, 'alarm-preload.js'), contextIsolation: true, autoplayPolicy: 'no-user-gesture-required', backgroundThrottling: false } });
    alarmWin.setMenuBarVisibility(false); alarmWin.setAlwaysOnTop(true, 'screen-saver');
    const f = path.join(app.getPath('userData'), 'alarm.html'), js = x => JSON.stringify(String(x)).replace(/</g, '\\u003c');
    fs.writeFileSync(f, ALARM_HTML.replace('__T__', () => js(title)).replace('__B__', () => js(body)));
    alarmWin.loadFile(f);
    alarmWin.on('closed', () => { alarmWin = null; clearTimeout(alarmTimer); });
    alarmTimer = setTimeout(closeAlarm, 90000);
  } catch (e) { }
}
ipcMain.on('a:act', (e, a) => { const c = alarmCur; closeAlarm(); if (a === 'snooze' && c) setTimeout(() => alarm(c.title, c.body), 5 * 60000); });
function notify(title, body, pre) {
  if (!pre && alarmOn) alarm(title, body);
  try { const n = new Notification({ title, body, icon: path.join(__dirname, 'icon.png'), silent: !pre && alarmOn }); n.on('click', show); n.show(); } catch (e) { }
  try { if (win && !win.isDestroyed()) win.webContents.send('k:fired', title + ' — ' + body); } catch (e) { }
}
function tick() {
  const now = Date.now(); let ch = false;
  for (const n of list) {
    const k = n.id + '-' + n.at;
    if (n.at <= now && n.at > now - 600000 && !fired[k]) { fired[k] = now; ch = true; notify(n.title, n.body, n.pre); }
  }
  if (ch) saveFired();
}
ipcMain.on('k:list', (e, l) => { list = Array.isArray(l) ? l.filter(x => x && Number.isFinite(x.at)) : []; });
ipcMain.on('k:alarm', (e, v) => { alarmOn = v !== false; });
ipcMain.handle('k:test', (e, t, b) => { const ok = Notification.isSupported(); if (ok) notify(t, b, false); return ok; });
app.whenReady().then(() => { loadFired(); setInterval(tick, 10000); });
