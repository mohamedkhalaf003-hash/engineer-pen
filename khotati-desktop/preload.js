const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('khotatiDesk', {
  setList: l => ipcRenderer.send('k:list', l),
  setAlarm: v => ipcRenderer.send('k:alarm', v),
  test: (t, b) => ipcRenderer.invoke('k:test', t, b),
  onFired: cb => ipcRenderer.on('k:fired', (_e, m) => cb(m))
});
