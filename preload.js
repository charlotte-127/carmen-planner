const { contextBridge, ipcRenderer } = require('electron');

// The only bridge between the interface and the rest of the app.
contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('cfg:get'),
  setConfig: (patch) => ipcRenderer.invoke('cfg:set', patch),
  setKey: (key) => ipcRenderer.invoke('key:set', key),
  clearKey: () => ipcRenderer.invoke('key:clear'),
  login: () => ipcRenderer.invoke('canvas:login'),
  status: () => ipcRenderer.invoke('canvas:status'),
  sync: () => ipcRenderer.invoke('canvas:sync'),
  signOut: () => ipcRenderer.invoke('canvas:signout'),
  aiBrief: (payload) => ipcRenderer.invoke('ai:brief', payload),
  openExternal: (url) => ipcRenderer.invoke('open:external', url),
  onProgress: (cb) => {
    const fn = (_e, msg) => cb(msg);
    ipcRenderer.on('sync:progress', fn);
    return () => ipcRenderer.removeListener('sync:progress', fn);
  },
});
