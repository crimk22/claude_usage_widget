/** Narrow bridge between the sandboxed windows and the main process. */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('widget', {
  // figures, pushed by the main process after each poll
  onUsage: (cb) => ipcRenderer.on('usage', (_e, data) => cb(data)),
  refresh: () => ipcRenderer.send('refresh'),

  // widget window
  hide: () => ipcRenderer.send('hide'),
  quit: () => ipcRenderer.send('quit'),
  resize: (h) => ipcRenderer.send('resize', h),
  openDashboard: () => ipcRenderer.send('open-dashboard'),

  // dashboard
  getDashboard: () => ipcRenderer.invoke('dashboard:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  pickProfileFolder: () => ipcRenderer.invoke('profiles:pick'),
  installRelay: (profileId) => ipcRenderer.invoke('relay:install', profileId),
  uninstallRelay: (profileId) => ipcRenderer.invoke('relay:uninstall', profileId),
  editPricing: () => ipcRenderer.invoke('pricing:edit'),
  reloadPricing: () => ipcRenderer.invoke('pricing:reload'),
  exportCsv: (kind, profileId) => ipcRenderer.invoke('export:csv', kind, profileId),
  exportReport: (range) => ipcRenderer.invoke('export:report', range)
});
