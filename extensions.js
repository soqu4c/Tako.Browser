'use strict';
// Chrome extensions: the chrome.* APIs come from electron-chrome-extensions,
// installing and updating from the Chrome Web Store from electron-chrome-web-store.
// Extensions live in the normal browser session only — never in private tabs, like Chrome.

const fs = require('fs');
const path = require('path');
const { app, dialog, session, webContents } = require('electron');

let ext = null;      // ElectronChromeExtensions
let store = null;    // electron-chrome-web-store module
let ses = null;
let log = () => {};
let send = () => {};
let getWin = () => null;
const pendingTabs = new Map();

const unpackedFile = () => path.join(app.getPath('userData'), 'unpacked-extensions.json');
const readUnpacked = () => { try { return JSON.parse(fs.readFileSync(unpackedFile(), 'utf8')); } catch { return []; } };
const writeUnpacked = (list) => fs.writeFileSync(unpackedFile(), JSON.stringify(list, null, 2));

const api = () => (ses.extensions || ses); // Electron 35 moved these to session.extensions

/** An extension asked for a new tab: the renderer makes one and reports its webContents id */
function createTabFor(details) {
  return new Promise((resolve, reject) => {
    const reqId = String(Date.now()) + Math.random().toString(36).slice(2, 6);
    pendingTabs.set(reqId, (wcId) => {
      const wc = webContents.fromId(wcId);
      if (wc) resolve([wc, getWin()]); else reject(new Error('tab was not created'));
    });
    setTimeout(() => { if (pendingTabs.delete(reqId)) reject(new Error('tab timeout')); }, 8000);
    send('ext:create-tab', { reqId, url: details && details.url, active: !details || details.active !== false });
  });
}

function tabCreated(reqId, wcId) {
  const done = pendingTabs.get(reqId);
  if (done) { pendingTabs.delete(reqId); done(wcId); }
}

// electron-chrome-extensions is written for Electron 35+, where IPC events say whether they came from
// a page ('frame') or a service worker. Electron 33 has no such field, and the library then ignores
// clicks on extension buttons and listeners from extension pages. Its messages always come from
// pages here, so they are marked as such before the library sees them.
function markFrameEvents() {
  const { ipcMain } = require('electron');
  if (ipcMain.__takoPatched) return;
  ipcMain.__takoPatched = true;
  for (const method of ['handle', 'on']) {
    const orig = ipcMain[method].bind(ipcMain);
    ipcMain[method] = (channel, fn) => orig(channel, typeof channel === 'string' && channel.startsWith('crx-') ? (event, ...args) => {
      if (event && event.type === undefined && event.sender) {
        try { Object.defineProperty(event, 'type', { value: 'frame', configurable: true }); } catch { /* frozen */ }
      }
      return fn(event, ...args);
    } : fn);
  }
}

async function setup(opts) {
  ({ log, send, getWin } = opts);
  ses = opts.session;
  markFrameEvents();
  try {
    const { ElectronChromeExtensions } = require('electron-chrome-extensions');
    ext = new ElectronChromeExtensions({
      session: ses,
      createTab: createTabFor,
      selectTab: (wc) => send('ext:select-tab', wc.id),
      // the library also calls this when a page's webContents goes away — which happens when a tab is
      // unloaded to save memory. Only a real chrome.tabs.remove (page still alive) closes the tab.
      removeTab: (wc) => { if (!wc.isDestroyed()) send('ext:remove-tab', wc.id); },
      createWindow: async (details) => {
        const urls = [].concat((details && details.url) || []);
        for (const url of urls.length ? urls : ['about:blank']) await createTabFor({ url, active: true });
        return getWin();
      },
      removeWindow: () => getWin(),
    });
    // A popup waits for its window to report a preferred size before showing up. Hidden windows do
    // not always report one, so a popup that is still hidden after a moment is measured and shown here.
    ext.on('browser-action-popup-created', (popup) => {
      setTimeout(async () => {
        if (!popup || popup.isDestroyed() || !popup.hidden || !popup.browserWindow) return;
        try {
          const size = await popup.browserWindow.webContents.executeJavaScript(
            '(() => { const d = document.documentElement; return { width: Math.ceil(Math.max(d.scrollWidth, document.body ? document.body.scrollWidth : 0)), height: Math.ceil(Math.max(d.scrollHeight, document.body ? document.body.scrollHeight : 0)) }; })()');
          if (popup.isDestroyed()) return;
          popup.setSize(size);
          popup.updatePosition();
          popup.show();
        } catch (e) { log('popup fallback', e); }
      }, 700);
    });
    // icons of the extension buttons in the toolbar are served from crx://
    ElectronChromeExtensions.handleCRXProtocol(session.defaultSession);
  } catch (e) {
    log('chrome extensions API unavailable:', e);
  }
  try {
    store = require('electron-chrome-web-store');
    await store.installChromeWebStore({
      session: ses,
      minimumManifestVersion: 2, // Electron 33 still runs MV2 extensions such as the full uBlock Origin
      beforeInstall: async (details) => {
        const r = await dialog.showMessageBox(getWin(), {
          type: 'question',
          buttons: ['Установить', 'Отмена'],
          defaultId: 0,
          cancelId: 1,
          title: 'Установить расширение',
          message: `Установить «${details.localizedName}»?`,
          detail: 'Расширение сможет читать и менять страницы, на которых работает. Ставьте только то, чему доверяете.',
          icon: details.icon && !details.icon.isEmpty() ? details.icon : undefined,
        });
        if (r.response === 0) setTimeout(() => send('ext:changed'), 1500);
        return { action: r.response === 0 ? 'allow' : 'deny' };
      },
    });
  } catch (e) {
    log('chrome web store unavailable:', e);
  }
  for (const dir of readUnpacked()) {
    try { await api().loadExtension(dir, { allowFileAccess: true }); } catch (e) { log('unpacked extension failed', dir, e); }
  }
  log('extensions loaded:', list().map((x) => x.name).join(', ') || 'none');
}

function addTab(wc, win) {
  if (ext && wc.session === ses) { try { ext.addTab(wc, win); } catch (e) { log('ext addTab', e); } }
}
function selectTab(wcId) {
  const wc = webContents.fromId(wcId);
  if (ext && wc && wc.session === ses) { try { ext.selectTab(wc); } catch (e) { log('ext selectTab', e); } }
}
function contextItems(wc, params) {
  if (!ext || wc.session !== ses) return [];
  try { return ext.getContextMenuItems(wc, params) || []; } catch { return []; }
}

function iconOf(e) {
  const icons = (e.manifest && e.manifest.icons) || {};
  const best = Object.keys(icons).map(Number).sort((a, b) => Math.abs(a - 48) - Math.abs(b - 48))[0];
  if (!best) return '';
  try { return 'data:image/png;base64,' + fs.readFileSync(path.join(e.path, icons[best])).toString('base64'); } catch { return ''; }
}

function list() {
  if (!ses) return [];
  const unpacked = new Set(readUnpacked());
  return api().getAllExtensions().map((e) => ({
    id: e.id, name: e.name, version: e.version,
    description: (e.manifest && e.manifest.description) || '',
    mv: e.manifest && e.manifest.manifest_version,
    options: e.manifest && (e.manifest.options_page || (e.manifest.options_ui && e.manifest.options_ui.page)) ? `chrome-extension://${e.id}/${e.manifest.options_page || e.manifest.options_ui.page}` : '',
    unpacked: unpacked.has(e.path),
    icon: iconOf(e),
  }));
}

async function install(input) {
  const id = (String(input || '').match(/[a-p]{32}/) || [])[0];
  if (!id) return { ok: false, error: 'Нужна ссылка на расширение в Chrome Web Store или его ID (32 латинские буквы)' };
  if (!store) return { ok: false, error: 'Установка из магазина недоступна' };
  try { await store.installExtension(id, { session: ses }); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; }
}

async function loadUnpacked() {
  const r = await dialog.showOpenDialog(getWin(), { title: 'Папка распакованного расширения (с manifest.json)', properties: ['openDirectory'] });
  if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true };
  const dir = r.filePaths[0];
  if (!fs.existsSync(path.join(dir, 'manifest.json'))) return { ok: false, error: 'В этой папке нет manifest.json' };
  try {
    await api().loadExtension(dir, { allowFileAccess: true });
    writeUnpacked([...new Set([...readUnpacked(), dir])]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function remove(id) {
  const e = api().getExtension(id);
  if (!e) return { ok: false, error: 'Расширение не найдено' };
  const unpacked = readUnpacked();
  if (unpacked.includes(e.path)) {
    api().removeExtension(id);
    writeUnpacked(unpacked.filter((p) => p !== e.path));
    return { ok: true };
  }
  try {
    if (store) await store.uninstallExtension(id, { session: ses });
    else api().removeExtension(id);
    return { ok: true };
  } catch (e2) {
    return { ok: false, error: e2.message };
  }
}

async function update() {
  if (!store || !store.updateExtensions) return { ok: false };
  try { await store.updateExtensions(ses); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; }
}

/** The same extensions in private tabs (content scripts and blocking work; toolbar buttons stay with normal tabs) */
async function setPrivate(privateSes, on) {
  const papi = privateSes.extensions || privateSes;
  if (!on) {
    for (const e of papi.getAllExtensions()) papi.removeExtension(e.id);
    return { ok: true };
  }
  if (!ses) return { ok: false };
  const have = new Set(papi.getAllExtensions().map((e) => e.id));
  for (const e of api().getAllExtensions()) {
    if (have.has(e.id)) continue;
    try { await papi.loadExtension(e.path, { allowFileAccess: true }); } catch (err) { log('private extension', e.name, err); }
  }
  return { ok: true };
}

module.exports = { setPrivate, setup, addTab, selectTab, contextItems, tabCreated, list, install, loadUnpacked, remove, update };
