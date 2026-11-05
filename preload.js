'use strict';
const { contextBridge, ipcRenderer, webFrame } = require('electron');

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
    overlay: (color, symbolColor, height) => ipcRenderer.invoke('win:overlay', color, symbolColor, height),
    uiZoom: (f) => webFrame.setZoomFactor(f),
    relaunch: () => ipcRenderer.invoke('app:relaunch'),
    fullscreen: (on) => ipcRenderer.invoke('win:fullscreen', on),
  },
  pickBackground: (kind) => ipcRenderer.invoke('bg:pick', kind),
  exportNotes: (name, text) => ipcRenderer.invoke('notes:export', name, text),
  showItem: (p) => ipcRenderer.invoke('shell:show', p),
  openExternal: (url) => ipcRenderer.invoke('shell:external', url),
  clearData: (what) => ipcRenderer.invoke('data:clear', what),
  metrics: () => ipcRenderer.invoke('app:metrics'),
  saveJson: (name, data) => ipcRenderer.invoke('file:save-json', name, data),
  openJson: () => ipcRenderer.invoke('file:open-json'),
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
  onAdblockCount: on('adblock:count'),
  onAdblockReady: on('adblock:ready'),
  onUpdate: on('update'),
  onSystemTheme: on('theme:system'),
  themeSource: (src) => ipcRenderer.invoke('theme:source', src),
  version: () => ipcRenderer.invoke('app:version'),
  ready: () => ipcRenderer.invoke('app:ready'),
  openLogs: () => ipcRenderer.invoke('app:logs'),
  searchTheme: (theme, region) => ipcRenderer.invoke('search:theme', theme, region),
  setKeys: (list) => ipcRenderer.invoke('keys:set', list),
  downloadAction: (id, action) => ipcRenderer.invoke('download:action', id, action),
  openPath: (p) => ipcRenderer.invoke('shell:open', p),
  screenshot: (wcId, full, toClipboard) => ipcRenderer.invoke('shot:page', wcId, full, toClipboard),
  readerSource: () => ipcRenderer.invoke('reader:source'),
  importBookmarks: (from) => ipcRenderer.invoke('bookmarks:import', from),
  clearPrivate: () => ipcRenderer.invoke('private:clear'),
  adblock: {
    set: (cfg) => ipcRenderer.invoke('adblock:set', cfg),
    status: () => ipcRenderer.invoke('adblock:status'),
    update: () => ipcRenderer.invoke('adblock:update'),
  },
  setDns: (mode, custom) => ipcRenderer.invoke('dns:set', mode, custom),
  vpnPing: (list) => ipcRenderer.invoke('vpn:ping', list),
  updates: {
    check: () => ipcRenderer.invoke('update:check'),
    install: () => ipcRenderer.invoke('update:install'),
  },
});
