const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('khotatiDesk', {
  setList: l => ipcRenderer.send('k:list', l),
  test: (t, b) => ipcRenderer.invoke('k:test', t, b),
  onFired: cb => ipcRenderer.on('k:fired', (_e, m) => cb(m))
});
