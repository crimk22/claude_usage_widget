const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('widget', {
  onUsage: (cb) => ipcRenderer.on('usage', (_e, data) => cb(data)),
  refresh: () => ipcRenderer.send('refresh'),
  hide: () => ipcRenderer.send('hide'),
  quit: () => ipcRenderer.send('quit'),
  resize: (h) => ipcRenderer.send('resize', h)
});
