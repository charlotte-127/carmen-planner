const { contextBridge, ipcRenderer } = require('electron');

// The only bridge between the interface and the rest of the app.
contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('cfg:get'),
  setConfig: (patch) => ipcRenderer.invoke('cfg:set', patch),
  login: () => ipcRenderer.invoke('canvas:login'),
  status: () => ipcRenderer.invoke('canvas:status'),
  sync: () => ipcRenderer.invoke('canvas:sync'),
  signOut: () => ipcRenderer.invoke('canvas:signout'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  courseContent: (courseId) => ipcRenderer.invoke('canvas:content', courseId),
  courseItem: (courseId, item) => ipcRenderer.invoke('canvas:item', courseId, item),
  cacheGet: (key) => ipcRenderer.invoke('cache:get', key),
  cacheSet: (key, value) => ipcRenderer.invoke('cache:set', key, value),
  openExternal: (url) => ipcRenderer.invoke('open:external', url),
  onProgress: (cb) => {
    const fn = (_e, msg) => cb(msg);
    ipcRenderer.on('sync:progress', fn);
    return () => ipcRenderer.removeListener('sync:progress', fn);
  },
});
