const { contextBridge, ipcRenderer } = require('electron');
const i = (c, ...a) => ipcRenderer.invoke(c, ...a);
contextBridge.exposeInMainWorld('desktop', {
  getRoot: () => i('getRoot'), pickRoot: () => i('pickRoot'),
  folder: (pid, name) => i('folder', pid, name), pickFolder: (pid, name) => i('pickFolder', pid, name),
  write: (pid, name, sec, fname, buf) => i('write', pid, name, sec, fname, buf),
  scan: (pid, name) => i('scan', pid, name), read: (pid, name, sec, fname) => i('read', pid, name, sec, fname),
  open: (pid, name) => i('open', pid, name), update: url => i('update', url)
});
