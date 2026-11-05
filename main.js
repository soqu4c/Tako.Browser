'use strict';
const { app, BrowserWindow, ipcMain, session, Menu, clipboard, dialog, shell, net, nativeTheme, webContents, protocol } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const vpn = require('./vpn');
const search = require('./search');
const exts = require('./extensions');

// tako://search — results page drawn in the browser's own style (see search.js)
protocol.registerSchemesAsPrivileged([{ scheme: 'tako', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

app.setName('Tako.Browser');
const PARTITION = 'persist:tako';
const PRIVATE = 'tako-private'; // no "persist:" — lives in memory only
const userDir = () => app.getPath('userData');
const file = (name) => path.join(userDir(), name);

let win = null;

// Read before the app is ready: some switches only work at startup
const boot = (() => { try { return JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'settings.json'), 'utf8')); } catch { return {}; } })();

// ---------- startup log: %APPDATA%\Tako.Browser\logs\main.log
const logDir = () => path.join(app.getPath('userData'), 'logs');
function log(...parts) {
  try {
    fs.mkdirSync(logDir(), { recursive: true });
    const f = path.join(logDir(), 'main.log');
    try { if (fs.statSync(f).size > 1024 * 1024) fs.renameSync(f, f + '.old'); } catch { /* first run */ }
    fs.appendFileSync(f, `[${new Date().toISOString()}] ${parts.map((p) => (p instanceof Error ? p.stack : typeof p === 'string' ? p : JSON.stringify(p))).join(' ')}\n`);
  } catch { /* nowhere to write */ }
}
process.on('uncaughtException', (e) => log('uncaught exception:', e));
process.on('unhandledRejection', (e) => log('unhandled rejection:', e));
log(`start ${app.getVersion()} on ${process.platform} ${os.release()}, electron ${process.versions.electron}`);

// If the last start never got as far as a working window, this one starts in safe mode:
// no GPU, no restored tabs. The flag is removed as soon as the interface reports it is up.
const startFlag = path.join(app.getPath('userData'), 'starting.flag');
let safeMode = process.argv.includes('--safe-mode');
try { if (fs.existsSync(startFlag)) { safeMode = true; log('previous start did not finish — safe mode'); } } catch { /* ignore */ }
try { fs.mkdirSync(app.getPath('userData'), { recursive: true }); fs.writeFileSync(startFlag, String(Date.now())); } catch { /* ignore */ }
if (boot.hwAccel === false || safeMode) app.disableHardwareAcceleration();
// "minimum memory": Chromium's low-end-device mode (smaller caches, lighter rendering) and fewer
// page processes — tabs share them instead of each getting its own
if (boot.memMode === 'max') {
  app.commandLine.appendSwitch('enable-low-end-device-mode');
  app.commandLine.appendSwitch('renderer-process-limit', '4');
  log('minimum memory mode');
}
const xray = new vpn.Xray();
let activeProfile = null; // the profile the browser session is routed through, for proxy auth
let proxyConfig = { mode: 'system' }; // applied to every browser session, private ones too
let adblock = null;
let searchTheme = {}; // colours of the interface, sent by the renderer
let searchRegion = boot.searchRegion || 'ru-ru';
const sessions = new Set();

// ---------- tiny JSON store

function readJson(name, fallback) {
  try { return JSON.parse(fs.readFileSync(file(name), 'utf8')); } catch { return fallback; }
}
function writeJson(name, data) {
  fs.mkdirSync(userDir(), { recursive: true });
  const tmp = file(name + '.tmp');
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file(name));
}

// ---------- shortcuts that must also work while a web page has focus
// The list is replaced by the renderer as soon as it starts (keys can be reassigned)

let SHORTCUTS = new Set([
  'Ctrl+T', 'Ctrl+W', 'Ctrl+Shift+T', 'Ctrl+L', 'Ctrl+R', 'F5', 'Ctrl+Shift+R', 'Ctrl+Tab', 'Ctrl+Shift+Tab',
  'Alt+ArrowLeft', 'Alt+ArrowRight', 'Ctrl+F', 'Ctrl+N', 'Ctrl+D', 'Ctrl+=', 'Ctrl+Shift+=', 'Ctrl++', 'Ctrl+-', 'Ctrl+0',
  'F11', 'F12', 'Escape', 'Ctrl+,', 'Ctrl+Shift+V',
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `Ctrl+${n}`),
]);

// Letters are taken from the physical key so shortcuts also work on the Russian layout.
// The same function lives in renderer.js.
function keyString(input) {
  const code = input.code || '';
  let k = input.key || '';
  if (/^Key[A-Z]$/.test(code)) k = code.slice(3);
  else if (/^Digit\d$/.test(code)) k = code.slice(5);
  else if (code === 'Equal') k = '=';
  else if (code === 'Minus' || code === 'NumpadSubtract') k = '-';
  else if (code === 'NumpadAdd') k = '+';
  else if (code === 'Comma') k = ',';
  else if (code === 'Period') k = '.';
  else if (code === 'Slash') k = '/';
  else if (k.length === 1) k = k.toUpperCase();
  const parts = [];
  if (input.control || input.meta) parts.push('Ctrl');
  if (input.alt) parts.push('Alt');
  if (input.shift) parts.push('Shift');
  parts.push(k);
  return parts.join('+');
}

// ---------- window

function createWindow() {
  const settings = readJson('settings.json', {});
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 760,
    minHeight: 480,
    backgroundColor: settings.mode === 'light' ? '#f3f1ec' : '#0c0d12',
    title: 'Tako.Browser',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#00000000', symbolColor: '#9aa0b4', height: 40 },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: false,
      webviewTag: true,
      spellcheck: true,
    },
  });
  if (settings.maximized) win.maximize();
  win.removeMenu();
  // links from the reader view open as tabs, never as bare windows
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) send('tab:open', { url });
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.loadFile(path.join(__dirname, 'index.html'));
  win.once('ready-to-show', () => { log('window ready'); win.show(); });
  // ready-to-show needs the first paint; if the interface is stuck, show the window anyway
  setTimeout(() => { if (win && !win.isDestroyed() && !win.isVisible()) { log('ready-to-show did not come in 6 s, showing the window'); win.show(); } }, 6000);
  let reloads = 0;
  win.webContents.on('render-process-gone', (_e, d) => {
    log('interface process gone:', d);
    if (d.reason !== 'clean-exit' && reloads++ < 2 && win && !win.isDestroyed()) { win.webContents.reload(); win.show(); }
  });
  win.webContents.on('unresponsive', () => log('interface not responding'));
  win.webContents.on('responsive', () => log('interface responding again'));
  win.webContents.on('preload-error', (_e, p, err) => log('preload error', p, err));
  win.webContents.on('did-fail-load', (_e, code, desc) => log('interface failed to load', code, desc));
  win.webContents.on('console-message', (_e, level, message, line, source) => { if (level >= 3) log(`interface error: ${message} (${path.basename(source || '')}:${line})`); });
  win.on('close', () => {
    const s = readJson('settings.json', {});
    s.maximized = win.isMaximized();
    writeJson('settings.json', s);
  });
  win.on('closed', () => { win = null; });
  win.on('minimize', () => send('win:state', 'minimized'));
  win.on('restore', () => send('win:state', 'restored'));
  win.on('enter-full-screen', () => send('fullscreen', true));
  win.on('leave-full-screen', () => send('fullscreen', false));
}

function send(channel, ...args) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
}

// ---------- browser sessions

const downloads = new Map();

function setupSession(partition) {
  const ses = session.fromPartition(partition);
  if (sessions.has(ses)) return ses;
  sessions.add(ses);
  // Some sites (Google sign-in among them) refuse unknown browsers: drop the Electron tokens
  const ua = ses.getUserAgent().replace(/ Electron\/\S+/, '').replace(/ tako-browser\/\S+/i, '').replace(/ Tako\.Browser\/\S+/i, '');
  ses.setUserAgent(ua);
  app.userAgentFallback = ua;
  ses.setProxy(proxyConfig).catch(() => {});
  ses.protocol.handle('tako', (req) => search.handle(req, ses, searchTheme, searchRegion));
  if (adblock) adblock.attach(ses);

  ses.on('will-download', (_e, item) => {
    const id = String(Date.now()) + Math.random().toString(36).slice(2, 6);
    downloads.set(id, item);
    const info = (state) => ({
      id, state, name: item.getFilename(), url: item.getURL(), path: item.getSavePath(),
      received: item.getReceivedBytes(), total: item.getTotalBytes(), paused: item.isPaused(), started: item.getStartTime() * 1000,
    });
    send('download', info('started'));
    item.on('updated', (_ev, state) => send('download', info(state === 'interrupted' ? 'interrupted' : 'progress')));
    item.once('done', (_ev, state) => {
      send('download', info(state));
      setTimeout(() => downloads.delete(id), 60000);
    });
  });
  return ses;
}

app.on('web-contents-created', (_e, contents) => {
  if (contents.getType() !== 'webview') return;
  exts.addTab(contents, win);

  contents.setWindowOpenHandler(({ url, disposition }) => {
    // Real pop-ups (sign-in windows and the like) need window.opener, so they stay windows
    if (disposition === 'new-window') {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: { width: 520, height: 680, autoHideMenuBar: true, backgroundColor: '#0c0d12', icon: path.join(__dirname, 'assets', 'icon.png') },
      };
    }
    send('tab:open', { url, background: disposition === 'background-tab', from: contents.id });
    return { action: 'deny' };
  });

  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const k = keyString(input);
    if (!SHORTCUTS.has(k)) return;
    if (k === 'Escape') { send('shortcut', k); return; } // pages still get Escape
    event.preventDefault();
    send('shortcut', k);
  });

  contents.on('context-menu', (_ev, p) => {
    const items = [];
    const tab = (url) => send('tab:open', { url, background: true, from: contents.id });
    if (p.linkURL) {
      items.push(
        { label: 'Открыть ссылку в новой вкладке', click: () => tab(p.linkURL) },
        { label: 'Открыть в приватной вкладке', click: () => send('tab:open', { url: p.linkURL, private: true }) },
        { label: 'Открыть рядом (разделить экран)', click: () => send('ctx', { type: 'split', url: p.linkURL }) },
        { label: 'Копировать адрес ссылки', click: () => clipboard.writeText(p.linkURL) },
        { type: 'separator' },
      );
    }
    if (p.mediaType === 'image' && p.srcURL) {
      items.push(
        { label: 'Открыть картинку в новой вкладке', click: () => tab(p.srcURL) },
        { label: 'Копировать картинку', click: () => contents.copyImageAt(p.x, p.y) },
        { label: 'Сохранить картинку как…', click: () => contents.downloadURL(p.srcURL) },
        { label: 'Сделать фоном браузера', click: () => send('ctx', { type: 'background', url: p.srcURL }) },
        { type: 'separator' },
      );
    }
    if (p.mediaType === 'video') {
      items.push({ label: 'Картинка в картинке', click: () => send('ctx', { type: 'pip' }) }, { type: 'separator' });
    }
    if (p.isEditable) {
      items.push(
        { label: 'Отменить', role: 'undo', enabled: p.editFlags.canUndo },
        { type: 'separator' },
        { label: 'Вырезать', role: 'cut', enabled: p.editFlags.canCut },
        { label: 'Копировать', role: 'copy', enabled: p.editFlags.canCopy },
        { label: 'Вставить', role: 'paste', enabled: p.editFlags.canPaste },
        { label: 'Выделить всё', role: 'selectAll' },
        { type: 'separator' },
      );
      for (const s of (p.dictionarySuggestions || []).slice(0, 4)) {
        items.unshift({ label: s, click: () => contents.replaceMisspelling(s) });
      }
    } else if (p.selectionText && p.selectionText.trim()) {
      const sel = p.selectionText.trim();
      const short = sel.length > 28 ? sel.slice(0, 28) + '…' : sel;
      items.push(
        { label: 'Копировать', role: 'copy' },
        { label: `Найти «${short}»`, click: () => send('ctx', { type: 'search', text: sel }) },
        { label: 'Перевести', click: () => send('ctx', { type: 'translate-text', text: sel }) },
        { label: 'Добавить в заметку', click: () => send('ctx', { type: 'note', text: sel, url: p.pageURL }) },
        { type: 'separator' },
      );
    }
    if (!p.linkURL && !p.isEditable && !(p.selectionText || '').trim()) {
      items.push(
        { label: 'Назад', enabled: contents.navigationHistory.canGoBack(), click: () => contents.navigationHistory.goBack() },
        { label: 'Вперёд', enabled: contents.navigationHistory.canGoForward(), click: () => contents.navigationHistory.goForward() },
        { label: 'Обновить', click: () => contents.reload() },
        { type: 'separator' },
        { label: 'Добавить в закладки', click: () => send('ctx', { type: 'bookmark' }) },
        { label: 'Заметка к этой странице', click: () => send('ctx', { type: 'note', text: '', url: p.pageURL }) },
        { label: 'Режим чтения', click: () => send('ctx', { type: 'reader' }) },
        { label: 'Перевести страницу', click: () => send('ctx', { type: 'translate' }) },
        { label: 'Скриншот страницы', click: () => send('ctx', { type: 'screenshot', full: true }) },
        { label: 'Этот сайт — через VPN / напрямую', click: () => send('ctx', { type: 'vpn-site', url: p.pageURL }) },
        { type: 'separator' },
      );
    }
    const extItems = exts.contextItems(contents, p);
    if (extItems.length) items.push(...extItems, { type: 'separator' });
    items.push({ label: 'Исследовать элемент', click: () => contents.inspectElement(p.x, p.y) });
    Menu.buildFromTemplate(items).popup({ window: win });
  });
});

// Credentials for HTTP(S) proxies that need them
app.on('login', (event, _wc, _details, authInfo, callback) => {
  if (authInfo.isProxy && activeProfile && activeProfile.kind === 'plain' && activeProfile.username) {
    event.preventDefault();
    callback(activeProfile.username, activeProfile.password || '');
  }
});

// ---------- IPC: storage, window, files

ipcMain.handle('store:get', (_e, name, fallback) => readJson(name + '.json', fallback));
ipcMain.handle('store:set', (_e, name, data) => {
  // keep window state that only the main process writes
  if (name === 'settings') {
    const old = readJson('settings.json', {});
    data = { ...data, maximized: old.maximized };
  }
  writeJson(name + '.json', data);
  return true;
});

ipcMain.handle('win:overlay', (_e, color, symbolColor, height = 40) => {
  try { win && win.setTitleBarOverlay({ color, symbolColor, height }); } catch { /* not supported here */ }
});
ipcMain.handle('win:fullscreen', (_e, on) => { if (win) win.setFullScreen(on == null ? !win.isFullScreen() : !!on); });
// 'dark' | 'light' | 'system' — also what sites see as prefers-color-scheme
ipcMain.handle('theme:source', (_e, src) => {
  nativeTheme.themeSource = ['dark', 'light', 'system'].includes(src) ? src : 'dark';
  return nativeTheme.shouldUseDarkColors;
});
nativeTheme.on('updated', () => send('theme:system', nativeTheme.shouldUseDarkColors));

// The Task Manager's "Memory" column is the private working set: pages a process holds alone that
// are in RAM right now. Electron only reports the working set (shared pages counted in every process)
// and private bytes (also counts what is committed but paged out), so on Windows the number comes
// from the same performance counter the Task Manager reads.
let pwsCache = { at: 0, key: '', bytes: null };
function privateWorkingSet(pids) {
  const key = pids.join(',');
  if (pwsCache.key === key && Date.now() - pwsCache.at < 4000) return Promise.resolve(pwsCache.bytes);
  return new Promise((resolve) => {
    const filter = pids.map((p) => `IDProcess=${Number(p)}`).join(' OR ');
    const cmd = `(Get-CimInstance Win32_PerfFormattedData_PerfProc_Process -Filter '${filter}' | Measure-Object -Property WorkingSetPrivate -Sum).Sum`;
    require('child_process').execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], { windowsHide: true, timeout: 8000 }, (err, out) => {
      const bytes = err ? null : Number(String(out).trim()) || null;
      pwsCache = { at: Date.now(), key, bytes };
      resolve(bytes);
    });
  });
}

ipcMain.handle('app:metrics', async () => {
  const list = app.getAppMetrics();
  const pids = list.map((m) => m.pid);
  if (xray.proc && xray.proc.pid) pids.push(xray.proc.pid);
  const cpu = list.reduce((sum, m) => sum + ((m.cpu && m.cpu.percentCPUUsage) || 0), 0);
  if (process.platform === 'win32') {
    const bytes = await privateWorkingSet(pids);
    if (bytes) return { memMB: Math.round(bytes / 1048576), exact: true, processes: pids.length, cpu: Math.round(cpu) };
  }
  // elsewhere (or if the counter is unavailable): private bytes where known, else the working set
  const priv = list.every((m) => m.memory && m.memory.privateBytes != null);
  const kb = list.reduce((sum, m) => sum + ((m.memory && (priv ? m.memory.privateBytes : m.memory.workingSetSize)) || 0), 0);
  return { memMB: Math.round(kb / 1024), exact: false, processes: pids.length, cpu: Math.round(cpu) };
});
ipcMain.handle('search:theme', (_e, theme, region) => { searchTheme = theme || {}; if (region) searchRegion = region; });
ipcMain.handle('app:ready', () => {
  log('interface ready');
  try { fs.unlinkSync(startFlag); } catch { /* already gone */ }
  return { safeMode };
});
ipcMain.handle('ext:list', () => exts.list());
ipcMain.handle('ext:install', (_e, input) => exts.install(input));
ipcMain.handle('ext:unpacked', () => exts.loadUnpacked());
ipcMain.handle('ext:remove', (_e, id) => exts.remove(id));
ipcMain.handle('ext:update', () => exts.update());
ipcMain.handle('ext:private', (_e, on) => exts.setPrivate(session.fromPartition(PRIVATE), on));
ipcMain.handle('ext:select', (_e, wcId) => exts.selectTab(wcId));
ipcMain.handle('ext:tab-created', (_e, reqId, wcId) => exts.tabCreated(reqId, wcId));
ipcMain.handle('app:logs', () => { fs.mkdirSync(logDir(), { recursive: true }); shell.openPath(logDir()); });
ipcMain.handle('app:relaunch', () => { app.relaunch(); app.quit(); });
ipcMain.handle('app:version', () => app.getVersion());

ipcMain.handle('file:save-json', async (_e, name, data) => {
  const r = await dialog.showSaveDialog(win, { title: 'Сохранить', defaultPath: name, filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (r.canceled || !r.filePath) return false;
  fs.writeFileSync(r.filePath, JSON.stringify(data, null, 2), 'utf8');
  return true;
});
ipcMain.handle('file:open-json', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Открыть', properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  try { return JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8')); } catch { return { error: 'Это не файл настроек' }; }
});

function copyToBackgrounds(src) {
  const dir = file('backgrounds');
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, Date.now() + path.extname(src).toLowerCase());
  fs.copyFileSync(src, dest);
  return pathToFileURL(dest).href;
}
ipcMain.handle('bg:pick', async (_e, kind) => {
  const video = kind === 'video';
  const r = await dialog.showOpenDialog(win, {
    title: video ? 'Видео для фона' : 'Картинка для фона',
    properties: ['openFile'],
    filters: [video ? { name: 'Видео', extensions: ['mp4', 'webm', 'mov', 'm4v'] } : { name: 'Изображения', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'bmp'] }],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  return copyToBackgrounds(r.filePaths[0]);
});

ipcMain.handle('notes:export', async (_e, name, text) => {
  const r = await dialog.showSaveDialog(win, {
    title: 'Сохранить заметки',
    defaultPath: name,
    filters: [{ name: 'Markdown', extensions: ['md'] }, { name: 'Текст', extensions: ['txt'] }],
  });
  if (r.canceled || !r.filePath) return false;
  fs.writeFileSync(r.filePath, text, 'utf8');
  return true;
});

ipcMain.handle('shell:show', (_e, p) => { if (p) shell.showItemInFolder(p); });
ipcMain.handle('shell:open', (_e, p) => { if (p) shell.openPath(p); });
ipcMain.handle('shell:external', (_e, url) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); });

ipcMain.handle('data:clear', async (_e, what) => {
  const ses = session.fromPartition(PARTITION);
  if (what === 'cache') await ses.clearCache();
  if (what === 'cookies') await ses.clearStorageData({ storages: ['cookies', 'localstorage', 'indexdb', 'serviceworkers', 'cachestorage'] });
  return true;
});

// Everything a private tab left behind is dropped when the last one closes
ipcMain.handle('private:clear', async () => {
  const ses = session.fromPartition(PRIVATE);
  await ses.clearStorageData();
  await ses.clearCache();
  return true;
});

// ---------- IPC: shortcuts, downloads, keys

ipcMain.handle('keys:set', (_e, list) => { if (Array.isArray(list)) SHORTCUTS = new Set([...list, 'Escape']); });

ipcMain.handle('download:action', (_e, id, action) => {
  const item = downloads.get(id);
  if (!item) return false;
  if (action === 'pause' && !item.isPaused()) item.pause();
  if (action === 'resume' && item.canResume()) item.resume();
  if (action === 'cancel') item.cancel();
  return true;
});

// ---------- IPC: screenshots, reader mode

function shotName() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `Tako ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}.png`;
}

ipcMain.handle('shot:page', async (_e, wcId, full, toClipboard) => {
  const wc = webContents.fromId(wcId);
  if (!wc) return { ok: false, error: 'Страница не найдена' };
  try {
    let png;
    if (full) {
      // the whole page, not only what fits in the window: through the DevTools protocol
      const dbg = wc.debugger;
      const attached = dbg.isAttached();
      if (!attached) dbg.attach('1.3');
      try {
        const m = await dbg.sendCommand('Page.getLayoutMetrics');
        const size = m.cssContentSize || m.contentSize;
        const height = Math.min(Math.ceil(size.height), 16000);
        const r = await dbg.sendCommand('Page.captureScreenshot', {
          format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: Math.ceil(size.width), height, scale: 1 },
        });
        png = Buffer.from(r.data, 'base64');
      } finally {
        if (!attached) dbg.detach();
      }
    } else {
      png = (await wc.capturePage()).toPNG();
    }
    if (toClipboard) {
      const { nativeImage } = require('electron');
      clipboard.writeImage(nativeImage.createFromBuffer(png));
      return { ok: true, clipboard: true };
    }
    const r = await dialog.showSaveDialog(win, { title: 'Сохранить скриншот', defaultPath: path.join(app.getPath('pictures'), shotName()), filters: [{ name: 'PNG', extensions: ['png'] }] });
    if (r.canceled || !r.filePath) return { ok: false, canceled: true };
    fs.writeFileSync(r.filePath, png);
    return { ok: true, path: r.filePath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

let readability = null;
ipcMain.handle('reader:source', () => {
  if (readability == null) {
    try { readability = fs.readFileSync(require.resolve('@mozilla/readability/Readability.js'), 'utf8'); } catch { readability = ''; }
  }
  return readability;
});

// ---------- IPC: bookmarks import

function browserBookmarkFiles() {
  const home = os.homedir();
  const local = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  const cfg = process.platform === 'darwin' ? path.join(home, 'Library', 'Application Support') : path.join(home, '.config');
  const win32 = process.platform === 'win32';
  const p = (...a) => path.join(...a, 'Default', 'Bookmarks');
  return {
    chrome: win32 ? p(local, 'Google', 'Chrome', 'User Data') : p(cfg, process.platform === 'darwin' ? 'Google/Chrome' : 'google-chrome'),
    yandex: win32 ? p(local, 'Yandex', 'YandexBrowser', 'User Data') : p(cfg, process.platform === 'darwin' ? 'Yandex/YandexBrowser' : 'yandex-browser'),
    edge: win32 ? p(local, 'Microsoft', 'Edge', 'User Data') : p(cfg, process.platform === 'darwin' ? 'Microsoft Edge' : 'microsoft-edge'),
    brave: win32 ? p(local, 'BraveSoftware', 'Brave-Browser', 'User Data') : p(cfg, 'BraveSoftware/Brave-Browser'),
  };
}

// Chromium-style Bookmarks file -> flat list; items of the bookmarks bar get folder ''
function flattenChromium(json) {
  const out = [];
  const walk = (node, folder) => {
    for (const ch of (node && node.children) || []) {
      if (ch.type === 'url' && /^https?:/.test(ch.url || '')) out.push({ title: ch.name || ch.url, url: ch.url, folder });
      else if (ch.type === 'folder') walk(ch, folder ? `${folder} / ${ch.name}` : ch.name);
    }
  };
  const roots = json.roots || {};
  walk(roots.bookmark_bar, '');
  if (roots.other) walk(roots.other, 'Другие закладки');
  if (roots.synced) walk(roots.synced, 'С телефона');
  return out;
}

ipcMain.handle('bookmarks:import', async (_e, from) => {
  try {
    let f = browserBookmarkFiles()[from];
    if (from === 'file' || !f || !fs.existsSync(f)) {
      if (from !== 'file') return { ok: false, error: 'Не нашёл закладки этого браузера на компьютере' };
      const r = await dialog.showOpenDialog(win, { title: 'Файл закладок (Bookmarks из папки профиля Chrome/Яндекса)', properties: ['openFile'] });
      if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true };
      f = r.filePaths[0];
    }
    const list = flattenChromium(JSON.parse(fs.readFileSync(f, 'utf8')));
    return { ok: true, list };
  } catch (e) {
    return { ok: false, error: 'Не удалось прочитать закладки: ' + e.message };
  }
});

// ---------- IPC: ad blocking and DNS

ipcMain.handle('adblock:set', async (_e, cfg) => {
  if (!adblock) return { ok: false };
  adblock.enabled = !!cfg.enabled;
  adblock.allow = new Set(cfg.allow || []);
  return { ok: true, ...adblock.status() };
});
ipcMain.handle('adblock:status', () => (adblock ? adblock.status() : { enabled: false }));
ipcMain.handle('adblock:update', async () => {
  if (!adblock) return { ok: false };
  const r = await adblock.load(true);
  return { ...r, ...adblock.status() };
});

const DOH = {
  cloudflare: 'https://cloudflare-dns.com/dns-query',
  google: 'https://dns.google/dns-query',
  adguard: 'https://dns.adguard-dns.com/dns-query',
  quad9: 'https://dns.quad9.net/dns-query',
};
function applyDns(mode, custom) {
  try {
    if (!mode || mode === 'off') app.configureHostResolver({ secureDnsMode: 'off' });
    else app.configureHostResolver({ secureDnsMode: 'secure', secureDnsServers: [mode === 'custom' ? custom : DOH[mode]].filter(Boolean) });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
ipcMain.handle('dns:set', (_e, mode, custom) => applyDns(mode, custom));

// ---------- IPC: VPN

function fetchText(url, ses) {
  return new Promise((resolve, reject) => {
    const req = net.request({ url, session: ses, redirect: 'follow' });
    req.setHeader('User-Agent', 'Tako.Browser');
    const timer = setTimeout(() => { req.abort(); reject(new Error('Сервер не ответил')); }, 15000);
    req.on('response', (res) => {
      let body = '';
      res.on('data', (c) => { body += c.toString(); });
      res.on('end', () => {
        clearTimeout(timer);
        if (res.statusCode >= 400) reject(new Error(`Ошибка ${res.statusCode}`));
        else resolve(body);
      });
    });
    req.on('error', (e) => { clearTimeout(timer); reject(e); });
    req.end();
  });
}

// Turns text the user pasted (a link, several links, or a subscription URL) into profiles
ipcMain.handle('vpn:parse', async (_e, text) => {
  try {
    text = String(text || '').trim();
    // one link per line; links pasted in one line are split where the next scheme starts
    const lines = text.split(/\r?\n|\s+(?=[a-z][a-z0-9+]*:\/\/)/i).map((l) => l.trim()).filter(Boolean);
    let profiles = [];
    let sub = null;
    if (lines.length === 1 && vpn.looksLikeSubscription(lines[0])) {
      sub = lines[0];
      profiles = vpn.parseSubscription(await fetchText(sub, session.fromPartition(PARTITION)));
      if (!profiles.length) throw new Error('В подписке не нашлось ни одного сервера');
    } else {
      profiles = lines.length === 1 ? [vpn.parseLink(lines[0])] : vpn.parseSubscription(lines.join('\n'));
      if (!profiles.length) throw new Error('Не нашлось ни одной ссылки, которую я понимаю');
    }
    return { ok: true, profiles, sub };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// How long a TCP handshake with each server takes, in ms (null — did not answer)
ipcMain.handle('vpn:ping', async (_e, list) => {
  const one = ({ id, host, port }) => new Promise((resolve) => {
    const t0 = Date.now();
    const s = require('net').connect({ host, port, timeout: 3000 });
    const done = (ms) => { s.destroy(); resolve([id, ms]); };
    s.once('connect', () => done(Date.now() - t0));
    s.once('timeout', () => done(null));
    s.once('error', () => done(null));
  });
  return Object.fromEntries(await Promise.all((list || []).map(one)));
});

function xrayDirs() {
  return [process.resourcesPath, path.join(__dirname), path.dirname(app.getPath('exe')), userDir()].filter(Boolean);
}

ipcMain.handle('vpn:xray-status', (_e, custom) => ({ path: vpn.findXray(custom, xrayDirs()) }));

ipcMain.handle('vpn:pick-xray', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Где лежит Xray?',
    properties: ['openFile'],
    filters: process.platform === 'win32' ? [{ name: 'xray.exe', extensions: ['exe'] }] : [],
  });
  return r.canceled ? null : r.filePaths[0];
});

let applying = Promise.resolve();
ipcMain.handle('vpn:apply', (_e, cfg) => {
  applying = applying.then(() => applyVpn(cfg)).catch((e) => ({ ok: false, error: e.message }));
  return applying;
});

async function setProxyEverywhere(config) {
  proxyConfig = config;
  for (const ses of sessions) {
    await ses.setProxy(config);
    await ses.closeAllConnections();
  }
}

async function applyVpn(cfg) {
  const profile = cfg && cfg.enabled && (cfg.profiles || []).find((p) => p.id === cfg.active);
  if (!profile) {
    xray.stop();
    activeProfile = null;
    await setProxyEverywhere({ mode: 'system' });
    return { ok: true, on: false };
  }
  let port = 0;
  if (profile.kind === 'xray') {
    const bin = vpn.findXray(cfg.xrayPath, xrayDirs());
    if (!bin) {
      xray.stop();
      activeProfile = null;
      await setProxyEverywhere({ mode: 'system' });
      return { ok: false, needXray: true, error: 'Для ссылок vless/vmess/trojan/ss нужен Xray (xray.exe). Положите его в папку bin рядом с браузером или укажите путь в настройках VPN.' };
    }
    port = await xray.start(bin, profile, vpn.tmpDir());
  } else {
    xray.stop();
  }
  activeProfile = profile;
  await setProxyEverywhere(vpn.buildProxyConfig(profile, port, cfg.mode || 'all', cfg.domains || []));
  return { ok: true, on: true, via: profile.kind };
}

ipcMain.handle('vpn:ip', async () => {
  try {
    const body = await fetchText('https://ipinfo.io/json', session.fromPartition(PARTITION));
    const j = JSON.parse(body);
    return { ok: true, ip: j.ip, country: j.country, city: j.city, org: j.org };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ---------- updates (only in the installed app)

let updater = null;
function setupUpdates() {
  if (!app.isPackaged) return;
  try {
    ({ autoUpdater: updater } = require('electron-updater'));
  } catch { return; }
  updater.autoDownload = true;
  // a beta build follows the betas; a stable one only stable releases
  updater.allowPrerelease = app.getVersion().includes('-');
  updater.autoInstallOnAppQuit = true;
  updater.on('update-available', (i) => send('update', { state: 'available', version: i.version }));
  updater.on('update-not-available', () => send('update', { state: 'none' }));
  updater.on('download-progress', (p) => send('update', { state: 'progress', percent: Math.round(p.percent) }));
  updater.on('update-downloaded', (i) => send('update', { state: 'ready', version: i.version }));
  updater.on('error', (e) => send('update', { state: 'error', error: e.message }));
  setTimeout(() => updater.checkForUpdates().catch(() => {}), 8000);
}
ipcMain.handle('update:check', async () => {
  if (!updater) return { ok: false, error: app.isPackaged ? 'Обновления недоступны' : 'Обновления работают только в установленной версии' };
  try { await updater.checkForUpdates(); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('update:install', () => { if (updater) updater.quitAndInstall(); });

// ---------- lifecycle

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    log('second launch');
    if (!win || win.isDestroyed()) { createWindow(); return; }
    if (win.isMinimized()) win.restore();
    if (!win.isVisible()) win.show();
    win.focus();
    const url = argv.find((a) => /^https?:\/\//.test(a));
    if (url) send('tab:open', { url });
  });

  app.whenReady().then(async () => {
    nativeTheme.themeSource = boot.mode === 'light' ? 'light' : boot.mode === 'system' ? 'system' : 'dark';
    try {
      const { AdBlock } = require('./adblock');
      adblock = new AdBlock(userDir(), (url) => net.fetch(url), (wcId, n) => send('adblock:count', { wcId, n }));
      adblock.enabled = boot.adblock ? boot.adblock.enabled !== false : true;
      adblock.allow = new Set((boot.adblock && boot.adblock.allow) || []);
      // compiling the filter lists takes the main thread for a while: only after the window is up
      setTimeout(() => adblock.load(false).then((r) => { log('adblock', r); send('adblock:ready', adblock.status()); }).catch((e) => log('adblock failed', e)), 4000);
    } catch (e) {
      console.error('adblock disabled:', e.message);
    }
    if (boot.dns) applyDns(boot.dns, boot.dnsCustom);
    log('app ready');
    for (const step of [() => setupSession(PARTITION), () => setupSession(PRIVATE)]) {
      try { step(); } catch (e) { log('session setup failed:', e); }
    }
    // extensions load before the first page, so their scripts are there from the start (at most 5 s)
    try {
      await Promise.race([
        exts.setup({ session: session.fromPartition(PARTITION), log, send, getWin: () => win }),
        new Promise((r) => setTimeout(r, 5000)),
      ]);
    } catch (e) { log('extensions setup failed:', e); }
    if (boot.extPrivate) exts.setPrivate(session.fromPartition(PRIVATE), true).catch((e) => log('private extensions', e));
    createWindow();
    log('window created');
    try { setupUpdates(); } catch (e) { log('updates failed:', e); }
    const url = process.argv.find((a) => /^https?:\/\//.test(a));
    if (url) win.webContents.once('did-finish-load', () => setTimeout(() => send('tab:open', { url }), 400));
  });

  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => {
    xray.stop();
    log('quit');
  });
}
