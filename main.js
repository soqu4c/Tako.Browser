'use strict';
const { app, BrowserWindow, ipcMain, session, Menu, clipboard, dialog, shell, net, nativeTheme } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const vpn = require('./vpn');

app.setName('Tako.Browser');
const PARTITION = 'persist:tako';
const userDir = () => app.getPath('userData');
const file = (name) => path.join(userDir(), name);

let win = null;
const xray = new vpn.Xray();
let activeProfile = null; // the profile the browser session is routed through, for proxy auth

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

const SHORTCUTS = new Set([
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
    backgroundColor: '#0c0d12',
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
  win.loadFile(path.join(__dirname, 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.on('close', () => {
    const s = readJson('settings.json', {});
    s.maximized = win.isMaximized();
    writeJson('settings.json', s);
  });
  win.on('closed', () => { win = null; });
  win.on('enter-full-screen', () => send('fullscreen', true));
  win.on('leave-full-screen', () => send('fullscreen', false));
}

function send(channel, ...args) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
}

// ---------- browser session

function setupSession() {
  const ses = session.fromPartition(PARTITION);
  // Some sites (Google sign-in among them) refuse unknown browsers: drop the Electron tokens
  const ua = ses.getUserAgent().replace(/ Electron\/\S+/, '').replace(/ tako-browser\/\S+/i, '').replace(/ Tako\.Browser\/\S+/i, '');
  ses.setUserAgent(ua);
  app.userAgentFallback = ua;

  ses.on('will-download', (_e, item) => {
    const id = Date.now() + Math.random();
    send('download', { id, name: item.getFilename(), state: 'started' });
    item.on('updated', () => {
      const total = item.getTotalBytes();
      send('download', { id, name: item.getFilename(), state: 'progress', progress: total ? item.getReceivedBytes() / total : 0 });
    });
    item.once('done', (_ev, state) => {
      send('download', { id, name: item.getFilename(), state, path: item.getSavePath() });
    });
  });
  return ses;
}

app.on('web-contents-created', (_e, contents) => {
  if (contents.getType() !== 'webview') return;

  contents.setWindowOpenHandler(({ url, disposition }) => {
    // Real pop-ups (sign-in windows and the like) need window.opener, so they stay windows
    if (disposition === 'new-window') {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: { width: 520, height: 680, autoHideMenuBar: true, backgroundColor: '#0c0d12', icon: path.join(__dirname, 'assets', 'icon.png') },
      };
    }
    send('tab:open', { url, background: disposition === 'background-tab' });
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
    const tab = (url) => send('tab:open', { url, background: true });
    if (p.linkURL) {
      items.push(
        { label: 'Открыть ссылку в новой вкладке', click: () => tab(p.linkURL) },
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
        { label: 'Заметка к этой странице', click: () => send('ctx', { type: 'note', text: '', url: p.pageURL }) },
        { label: 'Этот сайт — через VPN / напрямую', click: () => send('ctx', { type: 'vpn-site', url: p.pageURL }) },
        { type: 'separator' },
      );
    }
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

// ---------- IPC

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

ipcMain.handle('win:overlay', (_e, color, symbolColor) => {
  try { win && win.setTitleBarOverlay({ color, symbolColor, height: 40 }); } catch { /* not supported here */ }
});
ipcMain.handle('win:fullscreen', (_e, on) => { if (win) win.setFullScreen(on == null ? !win.isFullScreen() : !!on); });

ipcMain.handle('bg:pick', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Картинка для фона',
    properties: ['openFile'],
    filters: [{ name: 'Изображения', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'bmp'] }],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const dir = file('backgrounds');
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, Date.now() + path.extname(r.filePaths[0]).toLowerCase());
  fs.copyFileSync(r.filePaths[0], dest);
  return pathToFileURL(dest).href;
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
ipcMain.handle('shell:external', (_e, url) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); });

ipcMain.handle('data:clear', async (_e, what) => {
  const ses = session.fromPartition(PARTITION);
  if (what === 'cache') await ses.clearCache();
  if (what === 'cookies') await ses.clearStorageData({ storages: ['cookies', 'localstorage', 'indexdb', 'serviceworkers', 'cachestorage'] });
  return true;
});

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

async function applyVpn(cfg) {
  const ses = session.fromPartition(PARTITION);
  const profile = cfg && cfg.enabled && (cfg.profiles || []).find((p) => p.id === cfg.active);
  if (!profile) {
    xray.stop();
    activeProfile = null;
    await ses.setProxy({ mode: 'system' });
    await ses.closeAllConnections();
    return { ok: true, on: false };
  }
  let port = 0;
  if (profile.kind === 'xray') {
    const bin = vpn.findXray(cfg.xrayPath, xrayDirs());
    if (!bin) {
      xray.stop();
      activeProfile = null;
      await ses.setProxy({ mode: 'system' });
      return { ok: false, needXray: true, error: 'Для ссылок vless/vmess/trojan/ss нужен Xray (xray.exe). Положите его в папку bin рядом с браузером или укажите путь в настройках VPN.' };
    }
    port = await xray.start(bin, profile, vpn.tmpDir());
  } else {
    xray.stop();
  }
  activeProfile = profile;
  await ses.setProxy(vpn.buildProxyConfig(profile, port, cfg.mode || 'all', cfg.domains || []));
  await ses.closeAllConnections();
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

// ---------- lifecycle

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
    const url = argv.find((a) => /^https?:\/\//.test(a));
    if (url) send('tab:open', { url });
  });

  app.whenReady().then(() => {
    nativeTheme.themeSource = 'dark';
    setupSession();
    createWindow();
    const url = process.argv.find((a) => /^https?:\/\//.test(a));
    if (url) win.webContents.once('did-finish-load', () => setTimeout(() => send('tab:open', { url }), 400));
  });

  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => xray.stop());
}
