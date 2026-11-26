const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('alarmAct', { act: a => ipcRenderer.send('a:act', a) });
