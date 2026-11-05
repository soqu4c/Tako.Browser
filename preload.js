'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (cb) => {
  const fn = (_e, ...args) => cb(...args);
  ipcRenderer.on(channel, fn);
  return () => ipcRenderer.removeListener(channel, fn);
};

contextBridge.exposeInMainWorld('tako', {
  platform: process.platform,
  store: {
    get: (name, fallback) => ipcRenderer.invoke('store:get', name, fallback),
    set: (name, data) => ipcRenderer.invoke('store:set', name, data),
  },
  win: {
    overlay: (color, symbolColor) => ipcRenderer.invoke('win:overlay', color, symbolColor),
    fullscreen: (on) => ipcRenderer.invoke('win:fullscreen', on),
  },
  pickBackground: () => ipcRenderer.invoke('bg:pick'),
  exportNotes: (name, text) => ipcRenderer.invoke('notes:export', name, text),
  showItem: (p) => ipcRenderer.invoke('shell:show', p),
  openExternal: (url) => ipcRenderer.invoke('shell:external', url),
  clearData: (what) => ipcRenderer.invoke('data:clear', what),
  vpn: {
    parse: (text) => ipcRenderer.invoke('vpn:parse', text),
    apply: (cfg) => ipcRenderer.invoke('vpn:apply', cfg),
    ip: () => ipcRenderer.invoke('vpn:ip'),
    xrayStatus: (custom) => ipcRenderer.invoke('vpn:xray-status', custom),
    pickXray: () => ipcRenderer.invoke('vpn:pick-xray'),
  },
  onTabOpen: on('tab:open'),
  onShortcut: on('shortcut'),
  onCtx: on('ctx'),
  onDownload: on('download'),
  onFullscreen: on('fullscreen'),
});
