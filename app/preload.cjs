const { contextBridge, ipcRenderer } = require('electron');
const listen = channel => callback => { const fn = (_event, value) => callback(value); ipcRenderer.on(channel, fn); return () => ipcRenderer.removeListener(channel, fn); };
contextBridge.exposeInMainWorld('voiz', {
  state: () => ipcRenderer.invoke('state'),
  import: () => ipcRenderer.invoke('import'),
  update: (id, value) => ipcRenderer.invoke('sound-update', id, value),
  remove: id => ipcRenderer.invoke('sound-remove', id),
  bytes: id => ipcRenderer.invoke('sound-bytes', id),
  settings: value => ipcRenderer.invoke('settings', value),
  startupState: () => ipcRenderer.invoke('startup-state'), setStartup: enabled => ipcRenderer.invoke('startup-set', enabled),
  arm: () => ipcRenderer.invoke('mic-arm'), disarm: () => ipcRenderer.invoke('mic-disarm'),
  prepare: (voice, tuning) => ipcRenderer.invoke('engine-prepare', voice, tuning), convert: (samples, voice) => ipcRenderer.invoke('engine-convert', samples, voice),
  warm: (voice, tuning) => ipcRenderer.invoke('engine-warm', voice, tuning),
  resourcesState: () => ipcRenderer.invoke('resources-state'), syncResources: () => ipcRenderer.invoke('resources-sync'), onResources: listen('resources-status'),
  driver: () => ipcRenderer.invoke('driver'), logs: () => ipcRenderer.invoke('logs'),
  cableSite: () => ipcRenderer.invoke('cable-site'),
  updateState: () => ipcRenderer.invoke('update-state'), checkUpdate: () => ipcRenderer.invoke('update-check'), downloadUpdate: () => ipcRenderer.invoke('update-download'), installUpdate: () => ipcRenderer.invoke('update-install'), updateRepository: () => ipcRenderer.invoke('update-repository'),
  onShortcut: listen('shortcut'), onEngine: listen('engine-status'), onUpdate: listen('update-status'), onCheckUpdates: listen('check-updates')
});
