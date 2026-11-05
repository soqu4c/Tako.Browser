'use strict';
/* global tako */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const T = window.tako;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (id, cls = 'i') => `<svg class="${cls}"><use href="#i-${id}"/></svg>`;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------- presets

const ACCENTS = {
  salsa: ['#ff5a47', '#ff9a4a', 'Сальса'],
  berry: ['#ff4f8b', '#ff7a5c', 'Ягода'],
  grape: ['#9b6bff', '#d46bff', 'Виноград'],
  ocean: ['#3d8bff', '#3fd0ff', 'Океан'],
  lime: ['#2fc48d', '#9be15d', 'Лайм'],
  honey: ['#f5a524', '#ffd166', 'Мёд'],
  mustard: ['#e8b931', '#d9653b', 'Горчица'],
  tomato: ['#e0552f', '#e8b931', 'Томат'],
  moss: ['#9bbf6a', '#e8b931', 'Мох'],
  teal: ['#4fa3a5', '#e0a35a', 'Бирюза'],
  plum: ['#b07acc', '#e8b931', 'Слива'],
  chalk: ['#ece6d6', '#d9653b', 'Мел'],
};
const PANELS = {
  graphite: ['#15171f', 'Графит'],
  midnight: ['#111830', 'Полночь'],
  coal: ['#0d0d10', 'Уголь'],
  plum: ['#1e1524', 'Слива'],
  pine: ['#10201a', 'Хвоя'],
  mocha: ['#211915', 'Мокко'],
  ink: ['#171917', 'Тушь'],
  slate: ['#191b21', 'Сланец'],
  brick: ['#221613', 'Кирпич'],
};
const BACKGROUNDS = {
  tako: { name: 'Тако', css: (a, b) => `radial-gradient(1100px 620px at 50% -12%, rgba(${hexRgb(a)}, .30), transparent 62%), radial-gradient(900px 520px at 100% 110%, rgba(${hexRgb(b)}, .16), transparent 60%), #0c0d12` },
  night: { name: 'Ночь', css: () => 'radial-gradient(1000px 600px at 80% 0%, #1d2b5a 0%, transparent 60%), linear-gradient(160deg, #090c18, #0d1226 55%, #07080f)' },
  aurora: { name: 'Сияние', css: () => 'radial-gradient(at 18% 22%, #1b5a50 0, transparent 50%), radial-gradient(at 82% 28%, #44307a 0, transparent 50%), radial-gradient(at 50% 92%, #0f3b5a 0, transparent 55%), #0a0c13' },
  sunset: { name: 'Закат', css: () => 'linear-gradient(165deg, #1d0f2e 0%, #4a1735 45%, #a2402c 85%, #d9813a 100%)' },
  ocean: { name: 'Глубина', css: () => 'radial-gradient(900px 600px at 20% 10%, #0f5e7a 0%, transparent 60%), linear-gradient(170deg, #031a26, #062c43 60%, #020c13)' },
  forest: { name: 'Лес', css: () => 'radial-gradient(800px 500px at 70% 0%, #1f5a3c 0%, transparent 60%), linear-gradient(165deg, #07140e, #0d2419 60%, #050b08)' },
  candy: { name: 'Конфета', css: () => 'linear-gradient(135deg, #2b0f45 0%, #6d1f63 50%, #1c2259 100%)' },
  ink: { name: 'Тушь', css: () => 'radial-gradient(120% 90% at 50% 0%, #1d201c 0%, #0e100e 70%)' },
  mustard: { name: 'Горчица', css: (a) => `radial-gradient(70% 60% at 100% 0%, rgba(${hexRgb(a)}, .22), transparent 70%), linear-gradient(170deg, #181914, #0e0f0c)` },
  brick: { name: 'Кирпич', css: () => 'linear-gradient(170deg, #32190f 0%, #1c0f0b 60%, #100907 100%)' },
  dusk: { name: 'Сумерки', css: () => 'linear-gradient(178deg, #1a1f2e 0%, #2a2232 50%, #3d2a22 100%)' },
  paper: { name: 'Крафт', css: () => 'linear-gradient(170deg, #3a2e1f 0%, #261e14 60%, #17120c 100%)' },
  mono: { name: 'Без фона', css: () => 'var(--bg-solid)' },
};
// A theme is a stylesheet plus the colours that suit it; picking one resets just these
const THEMES = {
  tako: {
    name: 'Тако', css: 'styles.css', hint: 'Мягкие градиенты, стекло, свечение — как в Tako.player',
    preview: 'background:radial-gradient(120px 60px at 50% 0%, rgba(255,90,71,.45), transparent 70%), #0c0d12',
    defaults: { accent: 'salsa', panel: 'graphite', bg: 'tako', radius: 14, panelAlpha: 78, bgAnim: true, bgGrain: false, bgDim: 15 },
  },
  handmade: {
    name: 'Ручной', css: 'styles-handmade.css', hint: 'Плоские цвета, жёсткие тени, засечки, бумажное зерно',
    preview: 'background:radial-gradient(120% 90% at 50% 0%, #1d201c, #0e100e 70%)',
    defaults: { accent: 'mustard', panel: 'ink', bg: 'ink', radius: 6, panelAlpha: 92, bgAnim: false, bgGrain: true, bgDim: 10 },
  },
};
const FONTS = {
  default: ['Как в теме', ''],
  system: ['Системный', '"Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif'],
  rounded: ['Округлый', '"Nunito", "Varela Round", "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif'],
  serif: ['С засечками', '"Iowan Old Style", "Palatino Linotype", Georgia, Cambria, serif'],
  mono: ['Моноширинный', '"JetBrains Mono", "Cascadia Mono", Consolas, ui-monospace, monospace'],
  custom: ['Свой', ''],
};
const ENGINES = {
  google: ['Google', 'https://www.google.com/search?q='],
  yandex: ['Яндекс', 'https://yandex.ru/search/?text='],
  ddg: ['DuckDuckGo', 'https://duckduckgo.com/?q='],
  bing: ['Bing', 'https://www.bing.com/search?q='],
  custom: ['Свой', ''],
};
const COLORS = ['#ff5a47', '#ff9a4a', '#f5c84b', '#2fc48d', '#3fd0ff', '#3d8bff', '#9b6bff', '#ff4f8b', '#9bbf6a', '#ece6d6'];
const DEFAULT_DIAL = [
  { name: 'YouTube', url: 'https://www.youtube.com/' },
  { name: 'Google', url: 'https://www.google.com/' },
  { name: 'Яндекс', url: 'https://ya.ru/' },
  { name: 'GitHub', url: 'https://github.com/' },
  { name: 'ВКонтакте', url: 'https://vk.com/' },
  { name: 'Википедия', url: 'https://ru.wikipedia.org/' },
  { name: 'Telegram', url: 'https://web.telegram.org/' },
];

const DEFAULTS = {
  theme: 'tako',
  accent: 'salsa', accentCustom: '#ff5a47', accent2Custom: '',
  panel: 'graphite', panelCustom: '#15171f', panelAlpha: 78, textColor: '',
  radius: 14, motion: true,
  bg: 'tako', bgImage: '', bgColor1: '#1d1f4a', bgColor2: '#5a1f3a', bgAngle: 150, bgDim: 15, bgBlur: 0, bgAnim: true, bgGrain: false,
  font: 'default', fontCustom: '', uiScale: 100, density: 'normal', gap: 10, customCss: '',
  toolbar: { nav: true, reload: true, home: true, dialpin: true, vpn: true, notes: true, settings: true },
  showAppName: true, notesSide: 'auto',
  tabsPos: 'top', tabsCompact: false, tabsWidth: 240, tabMax: 210, tabClose: true, tabColorMode: 'accent', newTabNext: true, restore: true,
  engine: 'google', engineUrl: '', greeting: 'Куда отправимся?', clock: true,
  start: { logo: true, search: true, dial: true, customize: true, align: 'center', valign: 'center' },
  dial: DEFAULT_DIAL,
  notesWidth: 340, notesOpen: false,
  perfMode: false, suspendAfter: 30, lazyRestore: true, hwAccel: true,
  vpn: { enabled: false, active: null, mode: 'all', domains: [], profiles: [], xrayPath: '' },
};

// ---------- colour helpers

function hexRgb(hex) {
  const h = String(hex).replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}
function rgbArr(hex) { return hexRgb(hex).split(',').map(Number); }
function toHex([r, g, b]) { return '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join(''); }
function shade(hex, add) { return toHex(rgbArr(hex).map((v) => v + add)); }
function hueShift(hex, deg, light = 0.06) {
  let [r, g, b] = rgbArr(hex).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  h = (h + deg / 360 + 1) % 1;
  l = clamp(l + light, 0, 0.9);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return toHex([f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255]);
}

// ---------- state

let S = structuredClone(DEFAULTS);
let notes = [];
let tabs = [];
let activeId = null;
let seq = 0;
const closedStack = [];
const vpnState = { on: false, error: null, busy: false };

function merge(base, over) {
  const out = structuredClone(base);
  for (const [k, v] of Object.entries(over || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) out[k] = merge(base[k], v);
    else if (v !== undefined) out[k] = v;
  }
  return out;
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
const saveSettings = debounce(() => T.store.set('settings', S), 300);
const saveNotes = debounce(() => T.store.set('notes', notes), 300);
const saveSession = debounce(() => {
  const list = tabs.map((t) => ({ url: t.url, title: t.title, pinned: t.pinned, color: t.color, favicon: t.favicon }));
  T.store.set('session', { tabs: list, active: tabs.findIndex((t) => t.id === activeId) });
}, 500);

// ---------- toasts

function toast(msg, opts = {}) {
  const el = document.createElement('div');
  el.className = 'toast' + (opts.err ? ' err' : '');
  el.innerHTML = `<span>${esc(msg)}</span>`;
  if (opts.action) {
    const b = document.createElement('button');
    b.className = 'btn small';
    b.textContent = opts.action.label;
    b.onclick = () => { opts.action.fn(); kill(); };
    el.append(b);
  }
  $('#toasts').append(el);
  const kill = () => { el.classList.add('out'); setTimeout(() => el.remove(), 300); };
  setTimeout(kill, opts.ms || (opts.err ? 7000 : 3500));
  return el;
}

// ---------- appearance

function accentPair() {
  if (S.accent === 'custom') return [S.accentCustom, S.accent2Custom || hueShift(S.accentCustom, 22, 0.08)];
  return ACCENTS[S.accent] || ACCENTS.salsa;
}

function searchUrl(q) {
  if (S.engine === 'custom' && /%s/.test(S.engineUrl || '')) return S.engineUrl.replace(/%s/g, encodeURIComponent(q));
  const [, base] = ENGINES[S.engine] && ENGINES[S.engine][1] ? ENGINES[S.engine] : ENGINES.google;
  return base + encodeURIComponent(q);
}
const engineName = () => (S.engine === 'custom' ? 'поисковике' : (ENGINES[S.engine] || ENGINES.google)[0]);

function backgroundCss() {
  const [a, b] = accentPair();
  if (S.bg === 'image' && S.bgImage) return `url("${S.bgImage.replace(/"/g, '%22')}") center / cover no-repeat, #0c0d12`;
  if (S.bg === 'gradient') return `linear-gradient(${S.bgAngle}deg, ${S.bgColor1}, ${S.bgColor2})`;
  return (BACKGROUNDS[S.bg] || BACKGROUNDS.tako).css(a, b);
}

function applyTheme(key, withColours) {
  S.theme = THEMES[key] ? key : 'tako';
  if (withColours) Object.assign(S, THEMES[S.theme].defaults);
}

function applyAppearance() {
  const root = document.documentElement.style;
  const body = document.body.classList;
  const theme = THEMES[S.theme] || THEMES.tako;
  const link = $('#theme-css');
  if (link.getAttribute('href') !== theme.css) link.setAttribute('href', theme.css);
  for (const k of Object.keys(THEMES)) body.toggle('theme-' + k, k === S.theme);
  const hand = S.theme === 'handmade';

  const [a, b] = accentPair();
  root.setProperty('--accent', a);
  root.setProperty('--accent-2', b);
  root.setProperty('--accent-rgb', hexRgb(a));
  root.setProperty('--accent2-rgb', hexRgb(b));
  const [r, g, bl] = rgbArr(a);
  root.setProperty('--on-accent', (0.299 * r + 0.587 * g + 0.114 * bl) > 150 ? '#17150f' : '#ffffff');

  const panel = S.panel === 'custom' ? S.panelCustom : (PANELS[S.panel] || PANELS.graphite)[0];
  root.setProperty('--panel-rgb', hexRgb(panel));
  root.setProperty('--panel-a', String(S.perfMode ? 1 : clamp(S.panelAlpha, 20, 100) / 100));
  root.setProperty('--surface', shade(panel, 2));
  root.setProperty('--surface-2', shade(panel, 9));
  root.setProperty('--surface-3', shade(panel, 19));
  root.setProperty('--bg-solid', shade(panel, -8));
  if (hand) root.removeProperty('--glass');
  else root.setProperty('--glass', `rgba(${hexRgb(shade(panel, -2))}, ${S.perfMode ? 1 : 0.86})`);
  if (S.textColor) {
    root.setProperty('--text', S.textColor);
    root.setProperty('--soft', `color-mix(in srgb, ${S.textColor} 78%, ${panel})`);
    root.setProperty('--muted', `color-mix(in srgb, ${S.textColor} 52%, ${panel})`);
  } else {
    for (const v of ['--text', '--soft', '--muted']) root.removeProperty(v);
  }
  root.setProperty('--r', S.radius + 'px');
  root.setProperty('--tabs-w', S.tabsWidth + 'px');
  root.setProperty('--notes-w', S.notesWidth + 'px');
  root.setProperty('--tab-max', S.tabMax + 'px');
  root.setProperty('--gap', S.gap + 'px');
  root.setProperty('--bg-dim', String(S.bgDim / 100));
  root.setProperty('--bg-blur', (S.perfMode ? 0 : S.bgBlur) + 'px');
  const bgCss = backgroundCss();
  const bgEl = $('#bg-img');
  if (bgEl.dataset.css !== bgCss) { bgEl.dataset.css = bgCss; bgEl.style.background = bgCss; }

  body.toggle('bg-anim', !!S.bgAnim && !S.perfMode && S.bg !== 'image');
  body.toggle('grain', !!S.bgGrain && !S.perfMode);
  body.toggle('no-motion', !S.motion);
  body.toggle('perf', !!S.perfMode);
  for (const d of ['compact', 'large']) body.toggle('density-' + d, S.density === d);
  for (const [k, on] of Object.entries(S.toolbar)) body.toggle('hide-' + (k === 'vpn' ? 'vpnbtn' : k === 'notes' ? 'notesbtn' : k === 'settings' ? 'settingsbtn' : k), !on);
  body.toggle('hide-appname', !S.showAppName);
  body.toggle('hide-tabclose', !S.tabClose);
  body.toggle('hide-logo', !S.start.logo);
  body.toggle('hide-dial', !S.start.dial);
  body.toggle('hide-search', !S.start.search);
  body.toggle('hide-customize', !S.start.customize);
  body.toggle('start-left', S.start.align === 'left');
  body.toggle('start-top', S.start.valign === 'top');
  body.toggle('notes-left', S.notesSide === 'left');
  body.toggle('notes-right', S.notesSide === 'right');

  const font = S.font === 'custom' ? (S.fontCustom ? `"${S.fontCustom.replace(/"/g, '')}", system-ui, sans-serif` : '') : (FONTS[S.font] || FONTS.default)[1];
  document.body.style.fontFamily = font;
  const zoom = clamp(S.uiScale, 70, 150) / 100;
  T.win.uiZoom(zoom);
  const titlebar = S.density === 'compact' ? 34 : S.density === 'large' ? 46 : 40;
  T.win.overlay('#00000000', hand ? '#c2bba8' : '#aab0c4', Math.round(titlebar * zoom));
  $('#user-css').textContent = S.customCss || '';

  // the few words that differ between the themes
  $('#app-name').innerHTML = hand ? 'tako<span class="app-suffix">/browser</span>' : 'Tako<span class="app-suffix">.browser</span>';
  $('#start-go').innerHTML = hand ? 'Найти <kbd>↵</kbd>' : 'Найти';
  const cust = $('#start-customize');
  cust.className = hand ? 'link-btn start-customize' : 'btn ghost small start-customize';
  cust.innerHTML = hand ? 'настроить вид →' : `${icon('palette')}Настроить вид`;
  tickClock(true);
  if (lastTheme !== S.theme) { lastTheme = S.theme; renderDial(); }
  renderTabs();
}
let lastTheme = null;

function applyLayout() {
  const pos = ['top', 'bottom', 'left', 'right'].includes(S.tabsPos) ? S.tabsPos : 'top';
  for (const p of ['top', 'bottom', 'left', 'right']) document.body.classList.toggle('tabs-' + p, p === pos);
  document.body.classList.toggle('tabs-compact', !!S.tabsCompact && (pos === 'left' || pos === 'right'));
  const slot = $('#slot-' + pos);
  if ($('#tabstrip').parentElement !== slot) slot.append($('#tabstrip'));
  $('#page-title').hidden = pos === 'top';
}

// ---------- URLs

function toUrl(text) {
  const s = String(text || '').trim();
  if (!s) return '';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s) || /^(about|data|view-source|file|mailto):/i.test(s)) return s;
  if (/^(localhost|\d{1,3}(\.\d{1,3}){3}|\[[0-9a-f:]+\])(:\d+)?(\/|$)/i.test(s)) return 'http://' + s;
  if (!/\s/.test(s) && /^[^/?#]+\.[a-zа-яё0-9-]{2,}(:\d+)?([/?#]|$)/i.test(s)) return 'https://' + s;
  return searchUrl(s);
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

function displayUrl(url) {
  if (!url) return '';
  let u = url;
  try { u = decodeURI(url); } catch { /* keep as is */ }
  return u.replace(/^https:\/\//, '').replace(/^([^/?#]+)\/$/, '$1');
}

// ---------- tabs

const active = () => tabs.find((t) => t.id === activeId) || null;
const byId = (id) => tabs.find((t) => t.id === id) || null;

function createTab(url = '', opts = {}) {
  const tab = {
    id: ++seq, url: '', title: opts.title || 'Новая вкладка', favicon: null, loading: false,
    wv: null, pinned: !!opts.pinned, color: opts.color || null, themeColor: null, error: null,
    lazy: false, suspended: false, lastActive: Date.now(),
  };
  let idx = tabs.length;
  if (opts.index != null) idx = opts.index;
  else if (S.newTabNext && active() && url) idx = tabs.indexOf(active()) + 1;
  if (!tab.pinned) idx = Math.max(idx, tabs.filter((t) => t.pinned).length);
  tabs.splice(idx, 0, tab);
  if (url && opts.lazy) {
    // known address, nothing loaded until the tab is opened
    tab.url = url;
    tab.lazy = true;
    tab.favicon = opts.favicon || null;
  } else if (url) navigate(url, tab);
  if (!opts.restoring && (!opts.background || !activeId)) activate(tab.id);
  renderTabs();
  saveSession();
  return tab;
}

function makeWebview(tab) {
  const wv = document.createElement('webview');
  wv.className = 'wv';
  wv.setAttribute('partition', 'persist:tako');
  wv.setAttribute('allowpopups', '');
  const upd = () => { updateTab(tab); if (tab.id === activeId) updateToolbar(); };

  wv.addEventListener('did-start-loading', () => { tab.loading = true; tab.error = null; upd(); progress(tab, 'start'); });
  wv.addEventListener('did-stop-loading', () => { tab.loading = false; upd(); progress(tab, 'stop'); });
  wv.addEventListener('did-navigate', (e) => { tab.url = e.url; tab.themeColor = null; upd(); saveSession(); updateNotesBadge(); if (tab.id === activeId) renderNotes(); });
  wv.addEventListener('did-navigate-in-page', (e) => { if (e.isMainFrame) { tab.url = e.url; upd(); saveSession(); } });
  wv.addEventListener('page-title-updated', (e) => { tab.title = e.title || tab.title; upd(); saveSession(); });
  wv.addEventListener('page-favicon-updated', (e) => { tab.favicon = (e.favicons || [])[0] || null; upd(); });
  wv.addEventListener('did-change-theme-color', (e) => { tab.themeColor = e.themeColor || null; upd(); });
  wv.addEventListener('did-fail-load', (e) => {
    if (!e.isMainFrame || e.errorCode === -3) return; // -3: aborted by a new navigation
    tab.error = { code: e.errorCode, desc: e.errorDescription, url: e.validatedURL };
    tab.loading = false;
    upd();
    progress(tab, 'stop');
  });
  wv.addEventListener('found-in-page', (e) => {
    const r = e.result;
    if (r && r.matches != null) $('#find-count').textContent = r.matches ? `${r.activeMatchOrdinal} из ${r.matches}` : 'нет';
  });
  wv.addEventListener('enter-html-full-screen', () => { document.body.classList.add('html-fs'); T.win.fullscreen(true); });
  wv.addEventListener('leave-html-full-screen', () => { document.body.classList.remove('html-fs'); T.win.fullscreen(false); });
  wv.addEventListener('focus', closeFloating);
  wv.addEventListener('dom-ready', () => { if (tab.id === activeId) updateToolbar(); });

  if (tab.id === activeId) wv.classList.add('active');
  $('#content').append(wv);
  tab.wv = wv;
  return wv;
}

function navigate(input, tab = active()) {
  const url = toUrl(input);
  if (!url || !tab) return;
  tab.error = null;
  tab.url = url;
  if (!tab.wv) {
    const wv = makeWebview(tab);
    wv.src = url;
  } else {
    tab.wv.loadURL(url).catch(() => {}); // failures arrive as did-fail-load
  }
  if (tab.title === 'Новая вкладка') tab.title = hostOf(url) || url;
  if (tab.id === activeId) {
    showTabContent(tab);
    updateToolbar();
    tab.wv.focus();
  }
  updateTab(tab);
  saveSession();
}

function activate(id) {
  const tab = byId(id);
  if (!tab) return;
  const prev = active();
  if (prev) prev.lastActive = Date.now();
  tab.lastActive = Date.now();
  activeId = id;
  if (tab.lazy && tab.url) {
    tab.lazy = false;
    tab.suspended = false;
    navigate(tab.url, tab);
  }
  for (const t of tabs) {
    if (t.wv) t.wv.classList.toggle('active', t.id === id);
    const el = tabEls.get(t.id);
    if (el) el.classList.toggle('active', t.id === id);
  }
  showTabContent(tab);
  hideFind();
  updateToolbar();
  updateNotesBadge();
  renderNotes();
  const el = tabEls.get(id);
  if (el) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  saveSession();
  if (!tab.wv) setTimeout(() => $('#start-input').focus(), 30);
}

function showTabContent(tab) {
  $('#start').hidden = !!tab.wv;
  const err = $('#page-error');
  if (tab.error && tab.wv) {
    err.hidden = false;
    $('#page-error-text').textContent = `${hostOf(tab.error.url) || tab.error.url} — ${tab.error.desc || 'ошибка ' + tab.error.code}`;
  } else {
    err.hidden = true;
  }
}

function closeTab(id) {
  const i = tabs.findIndex((t) => t.id === id);
  if (i < 0) return;
  const tab = tabs[i];
  if (tab.url) closedStack.push({ url: tab.url, title: tab.title, index: i });
  if (closedStack.length > 25) closedStack.shift();
  tabs.splice(i, 1);
  if (tab.wv) tab.wv.remove();
  const el = tabEls.get(id);
  if (el) el.remove();
  tabEls.delete(id);
  if (!tabs.length) { activeId = null; createTab(); return; }
  if (activeId === id) activate((tabs[i] || tabs[i - 1]).id);
  renderTabs();
  saveSession();
}

/** Frees the memory of a background tab; it reloads when opened again */
function suspendTab(t) {
  if (!t || !t.wv || t.id === activeId) return false;
  t.wv.remove();
  t.wv = null;
  t.lazy = true;
  t.suspended = true;
  t.loading = false;
  updateTab(t);
  return true;
}

function suspendIdleTabs(force) {
  const limit = S.suspendAfter * 60000;
  let n = 0;
  for (const t of tabs) {
    if (!t.wv || t.id === activeId) continue;
    if (!force && (!S.suspendAfter || Date.now() - t.lastActive < limit)) continue;
    try { if (t.wv.isCurrentlyAudible()) continue; } catch { /* not attached */ }
    if (suspendTab(t)) n++;
  }
  return n;
}

function reopenClosed() {
  const t = closedStack.pop();
  if (t) createTab(t.url, { title: t.title, index: Math.min(t.index, tabs.length) });
}

function cycleTab(dir) {
  if (tabs.length < 2) return;
  const i = tabs.findIndex((t) => t.id === activeId);
  activate(tabs[(i + dir + tabs.length) % tabs.length].id);
}

// Tab elements are kept and updated in place, so hover states and animations survive updates
const tabEls = new Map();

function tabColor(t) {
  if (t.color) return t.color;
  if (S.tabColorMode === 'site' && t.themeColor) return t.themeColor;
  return null;
}

function updateTab(t) {
  let el = tabEls.get(t.id);
  if (!el) {
    el = document.createElement('div');
    el.className = 'tab';
    el.dataset.id = t.id;
    el.draggable = true;
    el.innerHTML = `<span class="fav"></span><span class="title"></span><i class="vpn-dot" hidden></i><button class="close" title="Закрыть (Ctrl+W)">${icon('x')}</button>`;
    tabEls.set(t.id, el);
  }
  el.classList.toggle('active', t.id === activeId);
  el.classList.toggle('loading', !!t.loading);
  el.classList.toggle('pinned', !!t.pinned);
  el.classList.toggle('suspended', !!t.suspended);
  const c = tabColor(t);
  el.classList.toggle('colored', !!c);
  if (c) el.style.setProperty('--tab-c', c);
  else if (S.tabColorMode === 'neutral') el.style.setProperty('--tab-c', 'rgba(255, 255, 255, .7)');
  else el.style.removeProperty('--tab-c');
  el.title = (t.url ? `${t.title}\n${t.url}` : t.title) + (t.suspended ? '\nВыгружена из памяти — откроется заново' : '');
  el.querySelector('.title').textContent = t.title;

  const fav = el.querySelector('.fav');
  const favKey = !t.url ? 'taco' : t.favicon || 'globe';
  if (fav.dataset.k !== favKey) {
    fav.dataset.k = favKey;
    fav.className = 'fav' + (favKey === 'taco' ? ' taco' : '');
    if (favKey === 'taco') fav.innerHTML = '<img src="assets/logo.png" alt="">';
    else if (favKey === 'globe') fav.innerHTML = icon('globe');
    else {
      fav.innerHTML = '';
      const img = new Image();
      img.alt = '';
      img.onerror = () => { fav.innerHTML = icon('globe'); };
      img.src = t.favicon;
      fav.append(img);
    }
  }
  el.querySelector('.vpn-dot').hidden = !(t.url && siteViaVpn(hostOf(t.url)));
  if (t.id === activeId) $('#page-title').textContent = t.wv ? t.title : '';
  return el;
}

function renderTabs() {
  const box = $('#tabs');
  const els = tabs.map(updateTab);
  const current = [...box.children];
  if (current.length !== els.length || current.some((e, i) => e !== els[i])) {
    els.forEach((el, i) => { if (box.children[i] !== el) box.insertBefore(el, box.children[i] || null); });
    while (box.children.length > els.length) box.lastChild.remove();
  }
}

function moveTab(id, toIndex) {
  const from = tabs.findIndex((t) => t.id === id);
  if (from < 0) return;
  const [t] = tabs.splice(from, 1);
  if (toIndex > from) toIndex--;
  const pinnedCount = tabs.filter((x) => x.pinned).length;
  toIndex = t.pinned ? Math.min(toIndex, pinnedCount) : Math.max(toIndex, pinnedCount);
  tabs.splice(toIndex, 0, t);
  renderTabs();
  saveSession();
}

function togglePin(t) {
  t.pinned = !t.pinned;
  const idx = tabs.filter((x) => x.pinned && x !== t).length;
  tabs.splice(tabs.indexOf(t), 1);
  tabs.splice(idx, 0, t);
  renderTabs();
  saveSession();
}

function progress(tab, what) {
  if (tab.id !== activeId) return;
  const p = $('#progress');
  if (what === 'start') {
    p.classList.remove('done', 'on');
    void p.offsetWidth;
    p.classList.add('on');
  } else {
    p.classList.remove('on');
    p.classList.add('done');
  }
}

// ---------- toolbar

function updateToolbar() {
  const t = active();
  const wv = t && t.wv;
  let back = false, fwd = false;
  try { back = !!wv && wv.canGoBack(); fwd = !!wv && wv.canGoForward(); } catch { /* not attached yet */ }
  $('#nav-back').disabled = !back;
  $('#nav-fwd').disabled = !fwd;
  $('#nav-reload').innerHTML = icon(t && t.loading ? 'x' : 'reload');
  $('#nav-reload').title = t && t.loading ? 'Остановить' : 'Обновить (F5)';
  const addr = $('#address');
  if (document.activeElement !== addr) addr.value = t && t.url ? displayUrl(t.url) : '';
  const secure = !!(t && t.url && t.url.startsWith('https://'));
  $('#omnibox').classList.toggle('secure', secure);
  $('#omni-icon').innerHTML = `<use href="#i-${t && t.url ? (secure ? 'lock' : 'globe') : 'search'}"/>`;
  const host = t && t.url ? hostOf(t.url) : '';
  $('#vpn-site-chip').hidden = !(host && siteViaVpn(host));
  $('#omni-dial').hidden = !host;
  $('#omni-dial').classList.toggle('on', !!(t && t.url && S.dial.some((d) => hostOf(d.url) === host)));
  updateZoomChip();
  if (t) showTabContent(t);
  $('#page-title').textContent = t && t.wv ? t.title : '';
}

function updateZoomChip() {
  const t = active();
  let level = 0;
  try { level = t && t.wv ? t.wv.getZoomLevel() : 0; } catch { /* not ready */ }
  const chip = $('#zoom-chip');
  chip.hidden = !level;
  chip.textContent = Math.round(Math.pow(1.2, level) * 100) + '%';
}

function zoom(dir) {
  const t = active();
  if (!t || !t.wv) return;
  try {
    const lv = dir === 0 ? 0 : clamp(t.wv.getZoomLevel() + dir * 0.5, -4, 5);
    t.wv.setZoomLevel(lv);
  } catch { /* not ready */ }
  setTimeout(updateZoomChip, 50);
}

// ---------- find in page

function showFind() {
  const t = active();
  if (!t || !t.wv) return;
  $('#findbar').hidden = false;
  const inp = $('#find-input');
  inp.focus();
  inp.select();
  if (inp.value) t.wv.findInPage(inp.value);
}
function hideFind() {
  if ($('#findbar').hidden) return;
  $('#findbar').hidden = true;
  $('#find-count').textContent = '';
  for (const t of tabs) if (t.wv) { try { t.wv.stopFindInPage('clearSelection'); } catch { /* fine */ } }
}
function findStep(forward) {
  const t = active();
  const q = $('#find-input').value;
  if (!t || !t.wv || !q) return;
  t.wv.findInPage(q, { forward, findNext: true });
}

// ---------- start page

function renderDial() {
  const box = $('#dial');
  box.innerHTML = '';
  S.dial.forEach((d, i) => {
    const host = hostOf(d.url);
    const el = document.createElement('button');
    el.className = 'tile';
    el.title = d.url;
    el.innerHTML = `<div class="ico"><img alt=""></div><span>${esc(d.name || host)}</span><i class="rm" role="button" title="Убрать">${icon('x')}</i>`;
    const img = el.querySelector('img');
    img.onerror = () => {
      const ico = el.querySelector('.ico');
      ico.classList.add('letter');
      ico.textContent = (d.name || host || '?').trim()[0].toUpperCase();
    };
    img.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
    el.onclick = (e) => {
      if (e.target.closest('.rm')) {
        S.dial.splice(i, 1);
        saveSettings();
        renderDial();
        updateToolbar();
        return;
      }
      navigate(d.url);
    };
    el.onauxclick = (e) => { if (e.button === 1) createTab(d.url, { background: true }); };
    el.oncontextmenu = (e) => {
      e.preventDefault();
      showMenu(e.clientX, e.clientY, [
        { label: 'Открыть в новой вкладке', icon: 'plus', fn: () => createTab(d.url, { background: true }) },
        { label: 'Изменить', icon: 'note', fn: () => editDial(i) },
        { label: 'Убрать', icon: 'trash', fn: () => { S.dial.splice(i, 1); saveSettings(); renderDial(); } },
      ]);
    };
    box.append(el);
  });
  const add = document.createElement('button');
  add.className = 'tile add';
  add.innerHTML = `<div class="ico">${icon('plus')}</div><span>${S.theme === 'handmade' ? 'добавить' : 'Добавить'}</span>`;
  add.onclick = () => editDial(-1);
  box.append(add);
  $('#greeting').textContent = S.greeting || '';
  $('#greeting').hidden = !S.greeting;
  $('#start-input').placeholder = `Искать в ${engineName()} или ввести адрес`;
}

function editDial(i) {
  const dlg = $('#dial-dlg');
  const d = S.dial[i] || { name: '', url: '' };
  $('#dial-dlg-title').textContent = i < 0 ? 'Новая плитка' : 'Изменить плитку';
  $('#dial-name').value = d.name;
  $('#dial-url').value = d.url;
  dlg.returnValue = '';
  dlg.showModal();
  dlg.onclose = () => {
    if (dlg.returnValue !== 'ok') return;
    const url = toUrl($('#dial-url').value);
    if (!url) return;
    const item = { name: $('#dial-name').value.trim() || hostOf(url), url };
    if (i < 0) S.dial.push(item); else S.dial[i] = item;
    saveSettings();
    renderDial();
    updateToolbar();
  };
}

function toggleDialForActive() {
  const t = active();
  if (!t || !t.url) return;
  const host = hostOf(t.url);
  const i = S.dial.findIndex((d) => hostOf(d.url) === host);
  if (i >= 0) {
    S.dial.splice(i, 1);
    toast('Убрано со стартовой');
  } else {
    S.dial.push({ name: (t.title || host).slice(0, 24), url: t.url });
    toast('Добавлено на стартовую');
  }
  saveSettings();
  renderDial();
  updateToolbar();
}

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const DAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
let clockKey = '';
function tickClock(force) {
  const c = $('#clock');
  c.hidden = !S.clock;
  document.body.classList.toggle('has-clock', !!S.clock);
  if (!S.clock || (!force && $('#start').hidden)) return; // nobody sees it
  const d = new Date();
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const date = `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  const key = S.theme + hm + date;
  if (key === clockKey) return;
  clockKey = key;
  c.innerHTML = S.theme === 'handmade' ? `${date.replace(',', ' ·')} · <b>${hm}</b>` : `${hm}<small>${date}</small>`;
}

// ---------- floating menus

function closeFloating() {
  $('#menu').hidden = true;
  $('#popover').hidden = true;
  $('#btn-vpn').classList.remove('active');
}

function place(el, x, y) {
  el.hidden = false;
  const r = el.getBoundingClientRect();
  el.style.left = clamp(x, 8, innerWidth - r.width - 8) + 'px';
  el.style.top = clamp(y, 8, innerHeight - r.height - 8) + 'px';
}

/** items: {label, icon, fn} | '-' | {header} | {colors, value, pick} */
function showMenu(x, y, items) {
  closeFloating();
  const m = $('#menu');
  m.innerHTML = '';
  for (const it of items) {
    if (it === '-') { m.append(document.createElement('hr')); continue; }
    if (it.header) {
      const h = document.createElement('div');
      h.className = 'menu-label';
      h.textContent = it.header;
      m.append(h);
      continue;
    }
    if (it.colors) {
      const row = document.createElement('div');
      row.className = 'menu-colors';
      for (const c of it.colors) {
        const b = document.createElement('button');
        b.style.background = c || 'transparent';
        if (!c) b.innerHTML = icon('x');
        b.title = c ? c : 'Без цвета';
        b.classList.toggle('on', c === it.value);
        b.onclick = () => { closeFloating(); it.pick(c); };
        row.append(b);
      }
      m.append(row);
      continue;
    }
    const b = document.createElement('button');
    b.innerHTML = `${it.icon ? icon(it.icon) : '<span class="i"></span>'}<span>${esc(it.label)}</span>`;
    b.disabled = !!it.disabled;
    b.onclick = () => { closeFloating(); it.fn(); };
    m.append(b);
  }
  place(m, x, y);
}

function tabMenu(t, x, y) {
  const host = t.url ? hostOf(t.url) : '';
  showMenu(x, y, [
    { label: 'Новая вкладка рядом', icon: 'plus', fn: () => { const n = createTab(''); moveTab(n.id, tabs.indexOf(t) + 1); } },
    { label: 'Обновить', icon: 'reload', fn: () => t.wv && t.wv.reload(), disabled: !t.wv },
    { label: 'Дублировать', icon: 'tabs', fn: () => createTab(t.url, { index: tabs.indexOf(t) + 1 }), disabled: !t.url },
    { label: t.pinned ? 'Открепить' : 'Закрепить', icon: 'pin', fn: () => togglePin(t) },
    '-',
    { header: 'Цвет вкладки' },
    { colors: [null, ...COLORS], value: t.color, pick: (c) => { t.color = c; updateTab(t); saveSession(); } },
    '-',
    { label: 'Заметка к этой странице', icon: 'note', fn: () => { activate(t.id); openNotes(true); newNote({ url: t.url, title: t.title }); }, disabled: !t.url },
    { label: host && siteViaVpn(host) ? 'Открывать напрямую' : 'Открывать через VPN', icon: 'shield', fn: () => toggleSiteVpn(host), disabled: !host },
    '-',
    { label: 'Закрыть', icon: 'x', fn: () => closeTab(t.id) },
    { label: 'Закрыть другие', fn: () => tabs.filter((x) => x !== t && !x.pinned).forEach((x) => closeTab(x.id)), disabled: tabs.length < 2 },
    { label: 'Закрыть вкладки после этой', fn: () => tabs.slice(tabs.indexOf(t) + 1).filter((x) => !x.pinned).forEach((x) => closeTab(x.id)) },
    '-',
    { label: 'Выгрузить из памяти', icon: 'zap', fn: () => suspendTab(t), disabled: !t.wv || t.id === activeId },
    { label: 'Выгрузить все фоновые', fn: () => toast(`Выгружено вкладок: ${suspendIdleTabs(true)}`) },
  ]);
}

// ---------- notes

let notesFilter = 'all';
let editingId = null;
let notesQuery = '';

function openNotes(on) {
  S.notesOpen = on == null ? !S.notesOpen : !!on;
  $('#notes').hidden = !S.notesOpen;
  $('#btn-notes').classList.toggle('active', S.notesOpen);
  saveSettings();
  renderNotes();
}

function currentHost() {
  const t = active();
  return t && t.url ? hostOf(t.url) : '';
}

function updateNotesBadge() {
  const host = currentHost();
  const n = host ? notes.filter((x) => x.host === host).length : 0;
  const b = $('#notes-badge');
  b.hidden = !n;
  b.textContent = n;
}

function ago(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'только что';
  if (s < 3600) return `${Math.floor(s / 60)} мин назад`;
  if (s < 86400) return `${Math.floor(s / 3600)} ч назад`;
  const d = new Date(ts);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''}`;
}

function renderNotes() {
  if (!S.notesOpen) return;
  for (const b of $$('#notes-filter button')) b.classList.toggle('on', b.dataset.f === notesFilter);
  const editing = notes.find((n) => n.id === editingId);
  $('#note-editor').hidden = !editing;
  $('#notes-list-view').hidden = !!editing;
  if (editing) return renderEditor(editing);

  const host = currentHost();
  const q = notesQuery.toLowerCase();
  let list = notes.slice().sort((a, b) => b.updated - a.updated);
  if (notesFilter === 'site') list = list.filter((n) => host && n.host === host);
  if (q) list = list.filter((n) => (n.title + '\n' + n.text + '\n' + (n.url || '')).toLowerCase().includes(q));
  const box = $('#notes-list');
  box.innerHTML = '';
  if (!list.length) {
    const msg = notesFilter === 'site'
      ? (host ? `У сайта ${host} пока нет заметок` : 'Откройте сайт, чтобы видеть его заметки')
      : q ? 'Ничего не нашлось' : 'Здесь будут ваши заметки';
    box.innerHTML = `<div class="notes-empty"><img src="assets/logo.png" alt=""><div>${esc(msg)}</div><br><button class="btn small accent" id="notes-empty-add">${icon('plus')}Новая заметка</button></div>`;
    $('#notes-empty-add').onclick = () => newNote({ url: notesFilter === 'site' ? (active() || {}).url : '' });
    return;
  }
  for (const n of list) {
    const b = document.createElement('button');
    b.className = 'note-card';
    b.style.setProperty('--nc', n.color || 'var(--accent)');
    const firstLine = n.text.split('\n').find((l) => l.trim()) || '';
    const title = n.title || firstLine || 'Без названия';
    const body = n.title ? n.text : n.text.slice(n.text.indexOf(firstLine) + firstLine.length);
    b.innerHTML = `<b>${esc(title)}</b>${body.trim() ? `<p>${esc(body.trim())}</p>` : ''}<div class="meta">${n.host ? `<span class="site-chip">${esc(n.host)}</span>` : ''}<span>${ago(n.updated)}</span></div>`;
    b.onclick = () => { editingId = n.id; renderNotes(); };
    box.append(b);
  }
}

function renderEditor(n) {
  const title = $('#ne-title');
  const text = $('#ne-text');
  if (title.dataset.id !== n.id) {
    title.dataset.id = n.id;
    title.value = n.title;
    text.value = n.text;
  }
  const cols = $('#ne-colors');
  cols.innerHTML = '';
  for (const c of COLORS) {
    const b = document.createElement('button');
    b.style.background = c;
    b.classList.toggle('on', (n.color || COLORS[0]) === c);
    b.onclick = () => { n.color = c; touch(n); renderEditor(n); };
    cols.append(b);
  }
  const site = $('#ne-site');
  site.innerHTML = n.url ? `<span class="site-chip" title="${esc(n.url)}">${icon('link')}${esc(n.host || n.url)}</span>` : '';
  const chip = site.querySelector('.site-chip');
  if (chip) chip.onclick = () => openUrlSomewhere(n.url);
  const link = $('#ne-link');
  link.querySelector('span').textContent = n.url ? 'Отвязать от сайта' : 'К этой странице';
  link.disabled = !n.url && !(active() && active().url);
  $('#ne-quote').disabled = !(active() && active().wv);
  $('#ne-meta').textContent = `Создана ${ago(n.created)} · изменена ${ago(n.updated)}`;
}

function touch(n) {
  n.updated = Date.now();
  saveNotes();
  updateNotesBadge();
}

function newNote({ text = '', url = '', title = '' } = {}) {
  const n = {
    id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title: title || '', text, url: url || '', host: url ? hostOf(url) : '',
    color: COLORS[Math.floor(Math.random() * COLORS.length)], created: Date.now(), updated: Date.now(),
  };
  notes.unshift(n);
  saveNotes();
  editingId = n.id;
  if (!S.notesOpen) openNotes(true); else renderNotes();
  updateNotesBadge();
  setTimeout(() => (text ? $('#ne-text') : $('#ne-title')).focus(), 50);
  return n;
}

function openUrlSomewhere(url) {
  const existing = tabs.find((t) => t.url === url);
  if (existing) activate(existing.id);
  else createTab(url);
}

async function quoteSelection() {
  const t = active();
  const n = notes.find((x) => x.id === editingId);
  if (!t || !t.wv || !n) return;
  let sel = '';
  try { sel = await t.wv.executeJavaScript('String(window.getSelection())'); } catch { /* page refused */ }
  sel = (sel || '').trim();
  if (!sel) { toast('Сначала выделите текст на странице'); return; }
  const quote = sel.split('\n').map((l) => '> ' + l).join('\n');
  n.text = (n.text.trim() ? n.text.replace(/\s*$/, '\n\n') : '') + quote + '\n';
  if (!n.url) { n.url = t.url; n.host = hostOf(t.url); }
  $('#ne-text').value = n.text;
  touch(n);
  renderEditor(n);
}

function deleteNote(id) {
  const i = notes.findIndex((n) => n.id === id);
  if (i < 0) return;
  const [n] = notes.splice(i, 1);
  saveNotes();
  editingId = null;
  renderNotes();
  updateNotesBadge();
  toast('Заметка удалена', { action: { label: 'Вернуть', fn: () => { notes.splice(i, 0, n); saveNotes(); renderNotes(); updateNotesBadge(); } } });
}

function notesMarkdown() {
  return notes.slice().sort((a, b) => b.updated - a.updated).map((n) => {
    const head = `## ${n.title || (n.text.split('\n')[0] || 'Без названия').slice(0, 80)}`;
    const meta = [n.url ? `<${n.url}>` : '', new Date(n.updated).toLocaleString('ru-RU')].filter(Boolean).join(' · ');
    return `${head}\n_${meta}_\n\n${n.text}\n`;
  }).join('\n---\n\n');
}

// ---------- VPN

function vpnProfile() { return S.vpn.profiles.find((p) => p.id === S.vpn.active) || null; }

function domainListed(host) {
  return S.vpn.domains.some((d) => host === d || host.endsWith('.' + d));
}

function siteViaVpn(host) {
  if (!vpnState.on || !host) return false;
  if (S.vpn.mode === 'only') return domainListed(host);
  if (S.vpn.mode === 'except') return !domainListed(host);
  return true;
}

async function vpnApply(report = true) {
  vpnState.busy = true;
  updateVpnButton();
  let r;
  try { r = await T.vpn.apply(S.vpn); } catch (e) { r = { ok: false, error: e.message }; }
  vpnState.busy = false;
  vpnState.on = !!(r.ok && r.on);
  vpnState.error = r.ok ? null : r.error;
  if (!r.ok && report) toast(r.error, { err: true, ms: 9000 });
  else if (report) toast(vpnState.on ? `VPN включён: ${vpnProfile().name}` : 'VPN выключен');
  updateVpnButton();
  renderTabs();
  updateToolbar();
  if (!$('#popover').hidden) renderVpnPopover();
  if ($('#settings-dlg').open && setSection === 'vpn') renderSettings();
  return r;
}

function updateVpnButton() {
  const b = $('#btn-vpn');
  b.classList.toggle('on', vpnState.on);
  b.classList.toggle('err', !!vpnState.error && S.vpn.enabled);
  b.innerHTML = icon(vpnState.on ? 'shield-on' : 'shield');
  b.title = vpnState.busy ? 'VPN подключается…' : vpnState.on ? `VPN: ${vpnProfile().name}` : 'VPN выключен';
}

async function setVpnEnabled(on) {
  if (on && !vpnProfile()) {
    if (S.vpn.profiles[0]) S.vpn.active = S.vpn.profiles[0].id;
    else { openSettings('vpn'); toast('Сначала добавьте сервер: вставьте ссылку в поле «Добавить»'); return; }
  }
  S.vpn.enabled = on;
  saveSettings();
  await vpnApply();
  reloadAffected();
}

function reloadAffected() {
  const t = active();
  if (t && t.wv && t.url) t.wv.reload();
}

async function toggleSiteVpn(host) {
  if (!host) return;
  if (!S.vpn.profiles.length) { openSettings('vpn'); toast('Сначала добавьте сервер VPN'); return; }
  const was = siteViaVpn(host);
  const d = S.vpn.domains;
  const rm = () => { S.vpn.domains = d.filter((x) => !(host === x || host.endsWith('.' + x))); };
  if (!S.vpn.enabled || !vpnProfile()) {
    if (!vpnProfile()) S.vpn.active = S.vpn.profiles[0].id;
    S.vpn.enabled = true;
    if (S.vpn.mode !== 'all') { S.vpn.mode = 'only'; if (!domainListed(host)) d.push(host); }
  } else if (S.vpn.mode === 'all') {
    S.vpn.mode = 'except';
    d.push(host);
  } else if (S.vpn.mode === 'only') {
    if (was) rm(); else d.push(host);
  } else if (was) d.push(host); else rm();
  saveSettings();
  await vpnApply(false);
  toast(siteViaVpn(host) ? `${host} теперь открывается через VPN` : `${host} теперь открывается напрямую`);
  reloadAffected();
}

function renderVpnPopover() {
  const pop = $('#popover');
  const p = vpnProfile();
  const host = currentHost();
  const state = vpnState.busy ? 'Подключение…' : vpnState.on ? 'Подключено' : vpnState.error && S.vpn.enabled ? 'Ошибка' : 'Выключен';
  const modeName = { all: 'все сайты', only: 'только выбранные сайты', except: 'все, кроме выбранных' }[S.vpn.mode];
  pop.innerHTML = `
    <div class="pop-head"><b>VPN</b><label class="switch"><input type="checkbox" id="pv-on" ${S.vpn.enabled ? 'checked' : ''}><span></span></label></div>
    <div class="pop-status ${vpnState.on ? 'on' : vpnState.error && S.vpn.enabled ? 'err' : ''}"><i class="dot"></i><div><div>${state}</div><small>${p ? esc(p.name) + ' · ' + modeName : 'Сервер не выбран'}</small></div></div>
    ${S.vpn.profiles.length ? `<div class="pop-row"><span>Сервер</span><select id="pv-profile">${S.vpn.profiles.map((x) => `<option value="${x.id}" ${x.id === S.vpn.active ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>` : '<div class="vpn-empty">Нет серверов. Добавьте ссылку в настройках.</div>'}
    ${host ? `<div class="pop-row"><span>${esc(host)}</span><button class="btn small" id="pv-site">${siteViaVpn(host) ? 'Открывать напрямую' : 'Через VPN'}</button></div>` : ''}
    ${vpnState.error && S.vpn.enabled ? `<div class="note-box">${esc(vpnState.error)}</div>` : ''}
    <div class="pop-actions"><button class="btn small" id="pv-ip">${icon('globe')}Мой IP</button><button class="btn small ghost" id="pv-settings">${icon('gear')}Настройки VPN</button></div>
    <div id="pv-ip-out" class="mono" style="margin-top:8px;color:var(--soft)"></div>`;
  $('#pv-on').onchange = (e) => setVpnEnabled(e.target.checked);
  const sel = $('#pv-profile');
  if (sel) sel.onchange = async () => { S.vpn.active = sel.value; saveSettings(); if (S.vpn.enabled) { await vpnApply(); reloadAffected(); } else renderVpnPopover(); };
  const site = $('#pv-site');
  if (site) site.onclick = () => toggleSiteVpn(host);
  $('#pv-settings').onclick = () => { closeFloating(); openSettings('vpn'); };
  $('#pv-ip').onclick = () => checkIp($('#pv-ip-out'));
}

async function checkIp(out) {
  out.textContent = 'Проверяю…';
  const r = await T.vpn.ip();
  out.textContent = r.ok ? `${r.ip} · ${[r.city, r.country].filter(Boolean).join(', ')}${r.org ? '\n' + r.org : ''}` : 'Не удалось: ' + r.error;
}

function toggleVpnPopover() {
  const pop = $('#popover');
  if (!pop.hidden) { closeFloating(); return; }
  closeFloating();
  renderVpnPopover();
  const r = $('#btn-vpn').getBoundingClientRect();
  place(pop, r.right - 320, r.bottom + 8);
  $('#btn-vpn').classList.add('active');
}

// ---------- settings

const SECTIONS = [
  ['look', 'palette', 'Внешний вид'],
  ['ui', 'sidebar', 'Интерфейс'],
  ['tabs', 'tabs', 'Вкладки'],
  ['start', 'home', 'Стартовая и поиск'],
  ['vpn', 'shield', 'VPN'],
  ['perf', 'zap', 'Оптимизация'],
  ['data', 'note', 'Заметки и данные'],
  ['about', 'info', 'О программе'],
];
const chip = (key, label) => `<button class="chip ${getKey(key) ? 'on' : ''}" data-chip="${key}">${label}</button>`;
let setSection = 'look';

function openSettings(section) {
  if (section) setSection = section;
  closeFloating();
  const nav = $('#set-tabs');
  nav.innerHTML = '<div class="set-title">Настройки</div>';
  for (const [id, ic, name] of SECTIONS) {
    const b = document.createElement('button');
    b.innerHTML = icon(ic) + esc(name);
    b.classList.toggle('on', id === setSection);
    b.onclick = () => { setSection = id; openSettings(); };
    nav.append(b);
  }
  renderSettings();
  if (!$('#settings-dlg').open) $('#settings-dlg').showModal();
}

const row = (title, hint, ctl, cls = '') => `<div class="set-row ${cls}"><div class="txt"><div>${title}</div>${hint ? `<small>${hint}</small>` : ''}</div><div class="ctl">${ctl}</div></div>`;
const sw = (key) => `<label class="switch"><input type="checkbox" data-key="${key}" ${getKey(key) ? 'checked' : ''}><span></span></label>`;
const range = (key, min, max, unit = '', step = 1) => `<input type="range" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${getKey(key)}"><span class="range-val" data-for="${key}">${getKey(key)}${unit}</span>`;
const seg = (key, opts) => `<div class="seg" data-seg="${key}">${opts.map(([v, l]) => `<button data-v="${v}" class="${getKey(key) === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;

function getKey(path) { return path.split('.').reduce((o, k) => (o == null ? o : o[k]), S); }
function setKey(path, v) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => o[k], S)[last] = v;
}

function renderSettings() {
  const p = $('#set-panel');
  p.style.animation = 'none';
  void p.offsetWidth;
  p.style.animation = '';
  const scroll = p.dataset.section === setSection ? p.scrollTop : 0;
  p.dataset.section = setSection;
  p.innerHTML = SETTINGS_PANELS[setSection]();
  bindSettings(p);
  p.scrollTop = scroll;
  clearInterval(statsTimer);
  statsTimer = null;
  if (setSection === 'perf') { updateStats(); statsTimer = setInterval(updateStats, 2000); }
}

const SETTINGS_PANELS = {
  look: () => {
    const accents = Object.entries(ACCENTS).map(([k, [a, b, name]]) => `<button class="swatch ${S.accent === k ? 'on' : ''}" data-accent="${k}" title="${name}" style="background:linear-gradient(135deg,${a} 70%,${b} 70%)"></button>`).join('')
      + `<label class="color-in ${S.accent === 'custom' ? 'on' : ''}" title="Свой цвет"><input type="color" id="accent-custom" value="${S.accentCustom}"></label>`;
    const panels = Object.entries(PANELS).map(([k, [c, name]]) => `<button class="swatch ${S.panel === k ? 'on' : ''}" data-panel="${k}" title="${name}" style="background:${c}"></button>`).join('')
      + `<label class="color-in ${S.panel === 'custom' ? 'on' : ''}" title="Свой цвет"><input type="color" id="panel-custom" value="${S.panelCustom}"></label>`;
    const [a, b] = accentPair();
    const bgs = Object.entries(BACKGROUNDS).map(([k, v]) => `<button class="bg-opt ${S.bg === k ? 'on' : ''}" data-bg="${k}" style="background:${v.css(a, b).replace('var(--bg-solid)', '#101210')}"><span>${v.name}</span></button>`).join('')
      + `<button class="bg-opt ${S.bg === 'gradient' ? 'on' : ''}" data-bg="gradient" style="background:linear-gradient(${S.bgAngle}deg,${S.bgColor1},${S.bgColor2})"><span>Свой градиент</span></button>`
      + (S.bgImage ? `<button class="bg-opt ${S.bg === 'image' ? 'on' : ''}" data-bg="image" style="background:url('${esc(S.bgImage)}') center/cover"><span>Картинка</span></button>` : '')
      + `<button class="bg-opt upload" id="bg-upload">${icon('image')}<span>Своя картинка…</span></button>`;
    const themes = Object.entries(THEMES).map(([k, t]) => `<button class="layout-opt theme-opt ${S.theme === k ? 'on' : ''}" data-theme="${k}"><div class="pv" style="${t.preview}">${k === 'tako'
      ? '<i style="left:8px;right:8px;top:8px;height:10px;border-radius:5px;background:rgba(255,255,255,.08)"></i><i style="left:30%;right:30%;top:34px;height:14px;border-radius:7px;background:linear-gradient(135deg,#ff5a47,#ff9a4a);box-shadow:0 4px 14px rgba(255,90,71,.6)"></i>'
      : '<i style="left:8px;right:8px;top:8px;height:10px;border:1px solid rgba(236,230,214,.2);background:#171917"></i><i style="left:30%;right:30%;top:34px;height:14px;background:#e8b931;box-shadow:3px 3px 0 #000"></i>'}</div><b>${t.name}</b><small>${t.hint}</small></button>`).join('');
    return `<h3>Внешний вид</h3>
      <div class="set-row col"><div class="txt"><div>Тема</div><small>Меняет оформление целиком. Цвета и фон после выбора можно настроить как угодно</small></div><div class="theme-cards">${themes}</div></div>
      ${row('Цвет акцента', 'Кнопки, индикаторы, подсветка', `<div class="swatches">${accents}</div>`)}
      ${S.accent === 'custom' ? row('Второй цвет акцента', 'Для градиентов и мелких деталей. Пусто — подберётся сам', `<input type="color" class="plain" id="accent2-custom" value="${S.accent2Custom || accentPair()[1]}"><button class="btn small ghost" id="accent2-auto">Авто</button>`) : ''}
      ${row('Цвет панелей', 'Вкладки, адресная строка, заметки', `<div class="swatches">${panels}</div>`)}
      ${row('Цвет текста', S.textColor ? 'Свой цвет' : 'Как в теме', `<input type="color" class="plain" id="text-color" value="${S.textColor || (S.theme === 'handmade' ? '#ece6d6' : '#eef0f6')}">${S.textColor ? '<button class="btn small ghost" id="text-reset">Сбросить</button>' : ''}`)}
      ${row('Прозрачность панелей', S.perfMode ? 'В режиме экономии панели всегда непрозрачные' : 'Чем меньше — тем сильнее виден фон', range('panelAlpha', 20, 100, '%'))}
      ${row('Скругление углов', '0 — совсем острые', range('radius', 0, 26, ' px'))}
      <h4>Фон</h4>
      <div class="set-row col"><div class="bg-grid">${bgs}</div></div>
      ${S.bg === 'gradient' ? row('Цвета градиента', '', `<input type="color" class="plain" data-key="bgColor1" value="${S.bgColor1}"><input type="color" class="plain" data-key="bgColor2" value="${S.bgColor2}">${range('bgAngle', 0, 360, '°')}`) : ''}
      <div class="set-row col"><div class="txt"><div>Картинка по ссылке</div><small>Вставьте адрес изображения из интернета. Ещё можно нажать правой кнопкой на картинку на любом сайте → «Сделать фоном браузера»</small></div>
        <form class="inline-form" id="bg-url-form"><input class="text-input" id="bg-url" placeholder="https://…/wallpaper.jpg" value="${S.bg === 'image' && /^https?:/.test(S.bgImage) ? esc(S.bgImage) : ''}"><button class="btn">Применить</button></form></div>
      ${row('Затемнение фона', '', range('bgDim', 0, 85, '%'))}
      ${row('Размытие фона', '', range('bgBlur', 0, 40, ' px'))}
      ${row('Живой фон', 'Медленно плывущие пятна цвета акцента', sw('bgAnim'))}
      ${row('Зерно', 'Лёгкая шероховатость, как у бумаги', sw('bgGrain'))}
      ${row('Анимации интерфейса', '', sw('motion'))}`;
  },
  ui: () => `<h3>Интерфейс</h3>
      ${row('Шрифт', '', seg('font', Object.entries(FONTS).map(([k, [n]]) => [k, n])), 'col')}
      ${S.font === 'custom' ? `<div class="set-row col"><div class="txt"><div>Название шрифта</div><small>Любой шрифт, установленный в системе, например <code>Comic Sans MS</code> или <code>Montserrat</code></small></div><input class="text-input" data-key="fontCustom" value="${esc(S.fontCustom)}" placeholder="Montserrat"></div>` : ''}
      <div class="set-row col"><div class="font-preview">Съешь же ещё этих мягких французских булок, да выпей чаю — 0123456789</div></div>
      ${row('Масштаб интерфейса', 'Размер панелей, кнопок и текста. Страницы сайтов не меняются', range('uiScale', 70, 150, '%', 5))}
      ${row('Плотность', 'Высота вкладок и панели адреса', seg('density', [['compact', 'Компактно'], ['normal', 'Обычно'], ['large', 'Просторно']]))}
      ${row('Отступы', 'Расстояние между панелями и краем окна', range('gap', 0, 28, ' px'))}
      ${row('Кнопки на панели', S.toolbar.settings ? '' : 'Настройки всё равно открываются по Ctrl+,', `<div class="chips">${chip('toolbar.nav', 'Назад / вперёд')}${chip('toolbar.reload', 'Обновить')}${chip('toolbar.home', 'Домой')}${chip('toolbar.dialpin', 'На стартовую')}${chip('toolbar.vpn', 'VPN')}${chip('toolbar.notes', 'Заметки')}${chip('toolbar.settings', 'Настройки')}</div>`, 'col')}
      ${row('Логотип и название в заголовке', '', sw('showAppName'))}
      ${row('Панель заметок', 'С какой стороны открывается', seg('notesSide', [['auto', 'Авто'], ['left', 'Слева'], ['right', 'Справа']]))}
      <h4>Свой CSS</h4>
      <div class="set-row col"><div class="txt"><small>Для тех, кому мало настроек: любые правила, применяются сразу. Например <code>.tab { font-weight: 700 }</code> или <code>:root { --accent: hotpink }</code></small></div>
        <textarea class="text-input" id="user-css-input" data-key="customCss" spellcheck="false" placeholder="/* ваши стили */">${esc(S.customCss)}</textarea></div>`,
  tabs: () => {
    const lay = (v, name) => `<button class="layout-opt ${S.tabsPos === v ? 'on' : ''}" data-layout="${v}"><div class="lay ${v}"><i class="tb"></i><i class="pg"></i></div>${name}</button>`;
    return `<h3>Вкладки</h3>
      <div class="set-row col"><div class="txt"><div>Где показывать вкладки</div></div>
        <div class="layouts">${lay('top', 'Сверху')}${lay('bottom', 'Снизу')}${lay('left', 'Слева')}${lay('right', 'Справа')}</div></div>
      ${row('Только значки', 'Для боковых вкладок: узкая панель с иконками сайтов', sw('tabsCompact'))}
      ${row('Ширина боковой панели', '', range('tabsWidth', 170, 380, ' px'))}
      ${row('Ширина вкладки', 'Для вкладок сверху и снизу', range('tabMax', 110, 340, ' px', 10))}
      ${row('Крестик на вкладках', 'Без него вкладка закрывается средней кнопкой мыши или Ctrl+W', sw('tabClose'))}
      ${row('Цвет вкладок', 'Свой цвет каждой вкладке можно задать правой кнопкой по ней', seg('tabColorMode', [['accent', 'Акцент'], ['site', 'Цвет сайта'], ['neutral', 'Нейтральный']]))}
      ${row('Открывать новые вкладки рядом с текущей', '', sw('newTabNext'))}
      ${row('Восстанавливать вкладки при запуске', '', sw('restore'))}`;
  },
  start: () => `<h3>Стартовая и поиск</h3>
      ${row('Поисковая система', '', seg('engine', Object.entries(ENGINES).map(([k, [n]]) => [k, n])), 'col')}
      ${S.engine === 'custom' ? `<div class="set-row col"><div class="txt"><div>Адрес поиска</div><small>Вместо запроса поставьте <code>%s</code>, например <code>https://search.brave.com/search?q=%s</code></small></div><input class="text-input mono" data-key="engineUrl" value="${esc(S.engineUrl)}" placeholder="https://example.com/search?q=%s"></div>` : ''}
      ${row('Что показывать', '', `<div class="chips">${chip('start.logo', 'Логотип')}${chip('clock', 'Часы')}${chip('start.search', 'Поиск')}${chip('start.dial', 'Плитки')}${chip('start.customize', '«Настроить вид»')}</div>`, 'col')}
      ${row('Выравнивание', '', seg('start.align', [['center', 'По центру'], ['left', 'Слева']]))}
      ${row('Положение', '', seg('start.valign', [['center', 'Посередине'], ['top', 'Сверху']]))}
      <div class="set-row col"><div class="txt"><div>Приветствие</div></div><input class="text-input" data-key="greeting" value="${esc(S.greeting)}" placeholder="Оставьте пустым, чтобы скрыть"></div>
      ${row('Плитки сайтов', `Сейчас: ${S.dial.length}. Добавляйте кнопкой «+» на стартовой или значком в адресной строке`, '<button class="btn small" id="dial-reset">Вернуть стандартные</button>')}`,
  vpn: () => {
    const v = S.vpn;
    const list = v.profiles.length
      ? v.profiles.map((p) => `<div class="vpn-item ${p.id === v.active ? 'on' : ''}" data-profile="${p.id}"><i class="radio"></i><span class="proto">${esc(p.type)}</span><div class="name"><div>${esc(p.name)}</div><small>${esc(p.host)}:${p.port}${p.kind === 'xray' ? ' · через Xray' : ''}</small></div><button class="icon sm danger" data-del="${p.id}" title="Удалить">${icon('trash')}</button></div>`).join('')
      : '<div class="vpn-empty">Серверов пока нет. Вставьте ссылку выше.</div>';
    const status = vpnState.busy ? 'Подключение…' : vpnState.on ? `Подключено: ${esc(vpnProfile().name)}` : vpnState.error && v.enabled ? esc(vpnState.error) : 'Выключен';
    return `<h3>VPN</h3>
      ${row('Включить VPN', status, `<label class="switch"><input type="checkbox" id="vpn-on" ${v.enabled ? 'checked' : ''}><span></span></label>`)}
      <div class="set-row col"><div class="txt"><div>Добавить по ссылке</div><small>Поддерживаются <code>vless://</code> <code>vmess://</code> <code>trojan://</code> <code>ss://</code>, прокси <code>socks5://</code> <code>http://</code> <code>https://</code> (можно с логином: <code>http://user:pass@host:port</code>) и ссылки на подписку — браузер сам скачает список серверов.</small></div>
        <form class="inline-form" id="vpn-add-form"><input class="text-input mono" id="vpn-add" placeholder="vless://… или https://example.com/sub/…"><button class="btn accent" id="vpn-add-btn">${icon('plus')}Добавить</button></form></div>
      <div class="set-row col"><div class="vpn-list">${list}</div></div>
      ${row('Что пускать через VPN', S.vpn.mode === 'all' ? 'Весь трафик браузера идёт через сервер' : S.vpn.mode === 'only' ? 'Через VPN — только сайты из списка ниже' : 'Через VPN — всё, кроме сайтов из списка', seg('vpn.mode', [['all', 'Все сайты'], ['only', 'Только список'], ['except', 'Кроме списка']]))}
      ${v.mode !== 'all' ? `<div class="set-row col"><div class="txt"><div>${v.mode === 'only' ? 'Сайты через VPN' : 'Сайты напрямую'}</div><small>По одному домену в строке — поддомены учитываются автоматически. Быстрее: правая кнопка по странице → «Этот сайт — через VPN / напрямую».</small></div><textarea class="text-input mono" id="vpn-domains" rows="5" placeholder="youtube.com&#10;instagram.com">${esc(v.domains.join('\n'))}</textarea></div>` : ''}
      <h4>Ядро Xray</h4>
      <div class="set-row col"><div class="note-box" id="xray-status">Проверяю…</div>
        <div class="pop-actions"><button class="btn small" id="xray-pick">Указать xray.exe…</button>${v.xrayPath ? '<button class="btn small ghost" id="xray-clear">Сбросить путь</button>' : ''}<button class="btn small ghost" id="xray-dl">${icon('external')}Скачать Xray</button></div></div>
      ${row('Проверить IP', 'Какой адрес видят сайты', '<button class="btn small" id="vpn-ip">Проверить</button>')}
      <div class="mono" id="vpn-ip-out" style="color:var(--soft);white-space:pre-wrap"></div>`;
  },
  perf: () => `<h3>Оптимизация</h3>
      <div class="set-row col"><div class="stats" id="perf-stats"><div class="stat"><b>…</b><small>память</small></div><div class="stat"><b>…</b><small>загружено вкладок</small></div><div class="stat"><b>…</b><small>процессов</small></div></div></div>
      ${row('Режим экономии', 'Без размытия, анимаций, живого фона и зерна. Меньше нагрузка на видеокарту и батарею', sw('perfMode'))}
      ${row('Выгружать неактивные вкладки', 'Фоновая вкладка освобождает память и загружается заново, когда вы на неё вернётесь. Вкладки, где играет звук, не трогаются', seg('suspendAfter', [[0, 'Никогда'], [5, '5 мин'], [15, '15 мин'], [30, '30 мин'], [60, '1 час']]), 'col')}
      ${row('Выгрузить фоновые вкладки сейчас', '', '<button class="btn small" id="suspend-now">Выгрузить</button>')}
      ${row('Ленивая загрузка при запуске', 'Восстановленные вкладки загружаются только когда вы их откроете — запуск в разы быстрее', sw('lazyRestore'))}
      ${row('Аппаратное ускорение', 'Выключите, если видео дёргается или окно мерцает. Нужен перезапуск', `${sw('hwAccel')}<button class="btn small" id="relaunch">Перезапустить</button>`)}`,
  data: () => `<h3>Заметки и данные</h3>
      ${row('Ширина панели заметок', '', range('notesWidth', 280, 560, ' px'))}
      ${row('Экспорт заметок', `Всего заметок: ${notes.length}. Сохраняются в один файл Markdown`, '<button class="btn small" id="notes-export">Сохранить в файл…</button>')}
      ${row('Очистить кэш', 'Картинки и файлы сайтов, сохранённые для скорости', '<button class="btn small" id="clear-cache">Очистить</button>')}
      ${row('Очистить cookies и данные сайтов', 'Вы выйдете из аккаунтов на всех сайтах', '<button class="btn small danger" id="clear-cookies">Очистить</button>')}
      <h4>Настройки</h4>
      ${row('Экспорт и импорт', 'Все настройки внешнего вида, вкладок и VPN в одном файле — удобно перенести на другой компьютер', '<button class="btn small" id="set-export">Сохранить…</button><button class="btn small" id="set-import">Загрузить…</button>')}
      ${row('Сбросить всё', 'Вернуть все настройки как при первом запуске. Заметки и серверы VPN останутся', '<button class="btn small danger" id="set-reset">Сбросить</button>')}`,
  about: () => `<div class="about"><img src="assets/logo.png" alt=""><div class="app-name">Tako<span class="app-suffix">.browser</span></div><div>Браузер в стиле Tako.player: свой фон, вкладки где удобно, заметки и VPN по ссылке.</div>
      <table class="keys">
        <tr><td><kbd>Ctrl</kbd> <kbd>T</kbd></td><td>Новая вкладка</td></tr>
        <tr><td><kbd>Ctrl</kbd> <kbd>W</kbd></td><td>Закрыть вкладку</td></tr>
        <tr><td><kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>T</kbd></td><td>Вернуть закрытую вкладку</td></tr>
        <tr><td><kbd>Ctrl</kbd> <kbd>Tab</kbd></td><td>Следующая вкладка (с Shift — предыдущая)</td></tr>
        <tr><td><kbd>Ctrl</kbd> <kbd>1</kbd>…<kbd>9</kbd></td><td>Перейти к вкладке</td></tr>
        <tr><td><kbd>Ctrl</kbd> <kbd>L</kbd></td><td>Адресная строка</td></tr>
        <tr><td><kbd>Ctrl</kbd> <kbd>F</kbd></td><td>Поиск на странице</td></tr>
        <tr><td><kbd>Ctrl</kbd> <kbd>N</kbd></td><td>Заметки</td></tr>
        <tr><td><kbd>Ctrl</kbd> <kbd>D</kbd></td><td>Добавить сайт на стартовую</td></tr>
        <tr><td><kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>V</kbd></td><td>Включить / выключить VPN</td></tr>
        <tr><td><kbd>Ctrl</kbd> <kbd>+</kbd> <kbd>-</kbd> <kbd>0</kbd></td><td>Масштаб</td></tr>
        <tr><td><kbd>F5</kbd> · <kbd>F11</kbd> · <kbd>F12</kbd></td><td>Обновить · Весь экран · Инструменты разработчика</td></tr>
        <tr><td><kbd>Ctrl</kbd> <kbd>,</kbd></td><td>Настройки</td></tr>
      </table></div>`,
};

// options whose change shows or hides other rows in the panel
const RERENDER = new Set(['font', 'engine', 'accent', 'textColor', 'perfMode']);
let statsTimer = null;

async function updateStats() {
  const box = $('#perf-stats');
  if (!box || !$('#settings-dlg').open) { clearInterval(statsTimer); statsTimer = null; return; }
  const m = await T.metrics();
  const loaded = tabs.filter((t) => t.wv).length;
  const cells = box.querySelectorAll('b');
  cells[0].textContent = m.memMB + ' МБ';
  cells[1].textContent = `${loaded} из ${tabs.length}`;
  cells[2].textContent = m.processes;
}

function onSettingChanged(key) {
  if (key === 'tabsPos' || key === 'tabsCompact') applyLayout();
  if (['engine', 'engineUrl', 'greeting', 'theme'].includes(key)) renderDial();
  if (key === 'clock') tickClock();
  applyAppearance();
  saveSettings();
}

function bindSettings(p) {
  for (const inp of $$('[data-key]', p)) {
    const key = inp.dataset.key;
    const handler = () => {
      let v = inp.type === 'checkbox' ? inp.checked : inp.type === 'range' ? Number(inp.value) : inp.value;
      setKey(key, v);
      if (inp.type === 'range') {
        inp.style.setProperty('--fill', ((v - inp.min) / (inp.max - inp.min)) * 100 + '%');
        const out = $(`[data-for="${key}"]`, p);
        if (out) out.textContent = v + out.textContent.replace(/^[-\d.]+/, '');
      }
      onSettingChanged(key);
      if (RERENDER.has(key)) renderSettings();
      if (key === 'bgColor1' || key === 'bgColor2' || key === 'bgAngle') {
        const opt = $('[data-bg="gradient"]', p);
        if (opt) opt.style.background = `linear-gradient(${S.bgAngle}deg,${S.bgColor1},${S.bgColor2})`;
      }
    };
    // the interface scale changes the slider itself, so it applies on release
    inp.addEventListener(inp.type === 'checkbox' || key === 'uiScale' ? 'change' : 'input', handler);
    if (key === 'uiScale') inp.addEventListener('input', () => { const o = $('[data-for="uiScale"]', p); if (o) o.textContent = inp.value + '%'; });
    if (inp.type === 'range') inp.style.setProperty('--fill', ((inp.value - inp.min) / (inp.max - inp.min)) * 100 + '%');
  }
  for (const s of $$('[data-seg]', p)) {
    s.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const old = getKey(s.dataset.seg);
      setKey(s.dataset.seg, typeof old === 'number' ? Number(b.dataset.v) : b.dataset.v);
      for (const x of s.children) x.classList.toggle('on', x === b);
      if (s.dataset.seg === 'vpn.mode') { saveSettings(); renderSettings(); if (S.vpn.enabled) vpnApply(false).then(reloadAffected); return; }
      onSettingChanged(s.dataset.seg);
      if (RERENDER.has(s.dataset.seg)) renderSettings();
    });
  }
  for (const c of $$('[data-chip]', p)) {
    c.onclick = () => {
      setKey(c.dataset.chip, !getKey(c.dataset.chip));
      c.classList.toggle('on', !!getKey(c.dataset.chip));
      onSettingChanged(c.dataset.chip);
      if (c.dataset.chip === 'toolbar.settings') renderSettings();
    };
  }
  for (const b of $$('[data-theme]', p)) b.onclick = () => { applyTheme(b.dataset.theme, true); applyLayout(); onSettingChanged('theme'); renderSettings(); };
  const a2 = $('#accent2-custom', p);
  if (a2) a2.oninput = () => { S.accent2Custom = a2.value; onSettingChanged('accent2Custom'); };
  const a2a = $('#accent2-auto', p);
  if (a2a) a2a.onclick = () => { S.accent2Custom = ''; onSettingChanged('accent2Custom'); renderSettings(); };
  const tc = $('#text-color', p);
  if (tc) {
    tc.oninput = () => { S.textColor = tc.value; onSettingChanged('textColor'); };
    tc.onchange = () => renderSettings();
  }
  const tr = $('#text-reset', p);
  if (tr) tr.onclick = () => { S.textColor = ''; onSettingChanged('textColor'); renderSettings(); };
  const sn = $('#suspend-now', p);
  if (sn) sn.onclick = () => { toast(`Выгружено вкладок: ${suspendIdleTabs(true)}`); updateStats(); };
  const rl = $('#relaunch', p);
  if (rl) rl.onclick = async () => { await T.store.set('settings', S); T.relaunch(); };
  const se = $('#set-export', p);
  if (se) se.onclick = async () => { if (await T.saveJson('Tako.Browser — настройки.json', { tako: 'settings', version: 1, settings: S })) toast('Настройки сохранены'); };
  const si = $('#set-import', p);
  if (si) si.onclick = async () => {
    const data = await T.openJson();
    if (!data) return;
    const incoming = data.settings || data;
    if (data.error || typeof incoming !== 'object' || !incoming.theme && !incoming.accent) { toast(data.error || 'Это не файл настроек Tako.Browser', { err: true }); return; }
    S = merge(DEFAULTS, incoming);
    applyLayout();
    applyAppearance();
    renderDial();
    saveSettings();
    renderSettings();
    if (S.vpn.enabled) vpnApply(false);
    toast('Настройки загружены');
  };
  const sr = $('#set-reset', p);
  if (sr) sr.onclick = () => {
    if (!confirm('Сбросить все настройки?')) return;
    const keep = { vpn: S.vpn, dial: S.dial, notesOpen: S.notesOpen };
    S = merge(DEFAULTS, keep);
    applyLayout();
    applyAppearance();
    renderDial();
    saveSettings();
    renderSettings();
    toast('Настройки сброшены');
  };
  for (const b of $$('[data-accent]', p)) b.onclick = () => { S.accent = b.dataset.accent; onSettingChanged('accent'); renderSettings(); };
  for (const b of $$('[data-panel]', p)) b.onclick = () => { S.panel = b.dataset.panel; onSettingChanged('panel'); renderSettings(); };
  for (const b of $$('[data-bg]', p)) b.onclick = () => { S.bg = b.dataset.bg; onSettingChanged('bg'); renderSettings(); };
  for (const b of $$('[data-layout]', p)) b.onclick = () => { S.tabsPos = b.dataset.layout; onSettingChanged('tabsPos'); renderSettings(); };
  const ac = $('#accent-custom', p);
  if (ac) ac.onchange = () => renderSettings();
  if (ac) ac.oninput = () => { S.accent = 'custom'; S.accentCustom = ac.value; onSettingChanged('accent'); $$('.swatch[data-accent]', p).forEach((x) => x.classList.remove('on')); ac.parentElement.classList.add('on'); };
  const pc = $('#panel-custom', p);
  if (pc) pc.oninput = () => { S.panel = 'custom'; S.panelCustom = pc.value; onSettingChanged('panel'); $$('.swatch[data-panel]', p).forEach((x) => x.classList.remove('on')); pc.parentElement.classList.add('on'); };
  const up = $('#bg-upload', p);
  if (up) up.onclick = async () => { const url = await T.pickBackground(); if (url) { S.bg = 'image'; S.bgImage = url; onSettingChanged('bg'); renderSettings(); } };
  const bf = $('#bg-url-form', p);
  if (bf) bf.onsubmit = (e) => { e.preventDefault(); const u = $('#bg-url', p).value.trim(); if (!/^https?:\/\//.test(u)) { toast('Нужна ссылка вида https://…', { err: true }); return; } S.bg = 'image'; S.bgImage = u; onSettingChanged('bg'); renderSettings(); };
  const dr = $('#dial-reset', p);
  if (dr) dr.onclick = () => { S.dial = structuredClone(DEFAULT_DIAL); saveSettings(); renderDial(); renderSettings(); };

  // VPN section
  const von = $('#vpn-on', p);
  if (von) von.onchange = () => setVpnEnabled(von.checked).then(() => renderSettings());
  const vf = $('#vpn-add-form', p);
  if (vf) vf.onsubmit = async (e) => {
    e.preventDefault();
    const text = $('#vpn-add', p).value.trim();
    if (!text) return;
    const btn = $('#vpn-add-btn', p);
    btn.disabled = true;
    btn.textContent = 'Загружаю…';
    const r = await T.vpn.parse(text);
    btn.disabled = false;
    if (!r.ok) { toast(r.error, { err: true }); renderSettings(); return; }
    const known = new Set(S.vpn.profiles.map((x) => x.link));
    const fresh = r.profiles.filter((x) => !known.has(x.link)).map((x) => ({ ...x, id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), sub: r.sub || undefined }));
    S.vpn.profiles.push(...fresh);
    if (!vpnProfile() && fresh[0]) S.vpn.active = fresh[0].id;
    saveSettings();
    toast(fresh.length ? `Добавлено серверов: ${fresh.length}` : 'Эти серверы уже есть в списке');
    renderSettings();
  };
  for (const it of $$('[data-profile]', p)) {
    it.onclick = async (e) => {
      if (e.target.closest('[data-del]')) return;
      S.vpn.active = it.dataset.profile;
      saveSettings();
      renderSettings();
      if (S.vpn.enabled) { await vpnApply(); reloadAffected(); }
    };
  }
  for (const b of $$('[data-del]', p)) {
    b.onclick = async () => {
      S.vpn.profiles = S.vpn.profiles.filter((x) => x.id !== b.dataset.del);
      const wasActive = S.vpn.active === b.dataset.del;
      if (wasActive) S.vpn.active = S.vpn.profiles[0] ? S.vpn.profiles[0].id : null;
      if (!S.vpn.profiles.length) S.vpn.enabled = false;
      saveSettings();
      renderSettings();
      if (wasActive) await vpnApply(false);
    };
  }
  const dom = $('#vpn-domains', p);
  if (dom) {
    const applyDomains = debounce(() => { if (S.vpn.enabled) vpnApply(false); }, 900);
    dom.oninput = () => {
      S.vpn.domains = dom.value.split(/[\s,]+/).map((d) => d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')).filter(Boolean);
      saveSettings();
      applyDomains();
    };
  }
  const xs = $('#xray-status', p);
  if (xs) {
    T.vpn.xrayStatus(S.vpn.xrayPath).then((r) => {
      xs.className = 'note-box' + (r.path ? ' ok' : '');
      xs.innerHTML = r.path
        ? `Xray найден: <code>${esc(r.path)}</code><br>Ссылки vless / vmess / trojan / ss будут работать.`
        : 'Xray не найден. Он нужен только для ссылок <code>vless://</code> <code>vmess://</code> <code>trojan://</code> <code>ss://</code> — обычные прокси работают и без него.<br>Скачайте архив <b>Xray-windows-64.zip</b>, распакуйте <code>xray.exe</code> в папку <code>bin</code> рядом с браузером или укажите его кнопкой ниже.';
    });
    $('#xray-pick', p).onclick = async () => { const f = await T.vpn.pickXray(); if (f) { S.vpn.xrayPath = f; saveSettings(); renderSettings(); if (S.vpn.enabled) vpnApply(); } };
    const xc = $('#xray-clear', p);
    if (xc) xc.onclick = () => { S.vpn.xrayPath = ''; saveSettings(); renderSettings(); };
    $('#xray-dl', p).onclick = () => T.openExternal('https://github.com/XTLS/Xray-core/releases/latest');
  }
  const ipb = $('#vpn-ip', p);
  if (ipb) ipb.onclick = () => checkIp($('#vpn-ip-out', p));

  // Data section
  const ne = $('#notes-export', p);
  if (ne) ne.onclick = async () => { if (await T.exportNotes('Заметки Tako.md', notesMarkdown())) toast('Заметки сохранены'); };
  const cc = $('#clear-cache', p);
  if (cc) cc.onclick = async () => { await T.clearData('cache'); toast('Кэш очищен'); };
  const ck = $('#clear-cookies', p);
  if (ck) ck.onclick = async () => { if (!confirm('Удалить cookies и данные всех сайтов?')) return; await T.clearData('cookies'); toast('Cookies и данные сайтов удалены'); };
}

// ---------- shortcuts

function keyString(e) {
  const code = e.code || '';
  let k = e.key || '';
  if (/^Key[A-Z]$/.test(code)) k = code.slice(3);
  else if (/^Digit\d$/.test(code)) k = code.slice(5);
  else if (code === 'Equal') k = '=';
  else if (code === 'Minus' || code === 'NumpadSubtract') k = '-';
  else if (code === 'NumpadAdd') k = '+';
  else if (code === 'Comma') k = ',';
  else if (k.length === 1) k = k.toUpperCase();
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  parts.push(k);
  return parts.join('+');
}

function shortcut(k) {
  const t = active();
  const m = k.match(/^Ctrl\+(\d)$/);
  if (m) {
    const n = Number(m[1]);
    const target = n === 9 ? tabs[tabs.length - 1] : tabs[n - 1];
    if (target) activate(target.id);
    return true;
  }
  switch (k) {
    case 'Ctrl+T': createTab(); return true;
    case 'Ctrl+W': if (t) closeTab(t.id); return true;
    case 'Ctrl+Shift+T': reopenClosed(); return true;
    case 'Ctrl+L': $('#address').focus(); $('#address').select(); return true;
    case 'Ctrl+R': case 'F5': if (t && t.wv) t.wv.reload(); return true;
    case 'Ctrl+Shift+R': if (t && t.wv) t.wv.reloadIgnoringCache(); return true;
    case 'Ctrl+Tab': cycleTab(1); return true;
    case 'Ctrl+Shift+Tab': cycleTab(-1); return true;
    case 'Alt+ArrowLeft': if (t && t.wv && t.wv.canGoBack()) t.wv.goBack(); return true;
    case 'Alt+ArrowRight': if (t && t.wv && t.wv.canGoForward()) t.wv.goForward(); return true;
    case 'Ctrl+F': showFind(); return true;
    case 'Ctrl+N': openNotes(); return true;
    case 'Ctrl+D': toggleDialForActive(); return true;
    case 'Ctrl+=': case 'Ctrl+Shift+=': case 'Ctrl++': zoom(1); return true;
    case 'Ctrl+-': zoom(-1); return true;
    case 'Ctrl+0': zoom(0); return true;
    case 'F11': T.win.fullscreen(); return true;
    case 'F12': if (t && t.wv) t.wv.isDevToolsOpened() ? t.wv.closeDevTools() : t.wv.openDevTools(); return true;
    case 'Ctrl+,': openSettings(); return true;
    case 'Ctrl+Shift+V': setVpnEnabled(!S.vpn.enabled); return true;
    case 'Escape':
      if (!$('#menu').hidden || !$('#popover').hidden) { closeFloating(); return true; }
      if (!$('#findbar').hidden) { hideFind(); return true; }
      return false;
    default: return false;
  }
}

// ---------- wiring

function wire() {
  // tabs
  const box = $('#tabs');
  box.addEventListener('mousedown', (e) => {
    const el = e.target.closest('.tab');
    if (!el || e.button !== 0 || e.target.closest('.close')) return;
    activate(Number(el.dataset.id));
  });
  box.addEventListener('click', (e) => {
    const c = e.target.closest('.close');
    if (c) closeTab(Number(c.closest('.tab').dataset.id));
  });
  box.addEventListener('auxclick', (e) => {
    const el = e.target.closest('.tab');
    if (el && e.button === 1) { e.preventDefault(); closeTab(Number(el.dataset.id)); }
  });
  box.addEventListener('contextmenu', (e) => {
    const el = e.target.closest('.tab');
    if (!el) return;
    e.preventDefault();
    tabMenu(byId(Number(el.dataset.id)), e.clientX, e.clientY);
  });
  $('#tabstrip').addEventListener('dblclick', (e) => { if (!e.target.closest('.tab, button')) createTab(); });
  $('#tab-new').onclick = () => createTab();

  let dragId = null;
  const clearDrag = () => $$('.tab.drag-over-before, .tab.drag-over-after').forEach((x) => x.classList.remove('drag-over-before', 'drag-over-after'));
  const before = (el, e) => {
    const r = el.getBoundingClientRect();
    const vertical = document.body.classList.contains('tabs-left') || document.body.classList.contains('tabs-right');
    return vertical ? e.clientY < r.top + r.height / 2 : e.clientX < r.left + r.width / 2;
  };
  box.addEventListener('dragstart', (e) => {
    const el = e.target.closest('.tab');
    if (!el) return;
    dragId = Number(el.dataset.id);
    el.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    const t = byId(dragId);
    if (t && t.url) e.dataTransfer.setData('text/uri-list', t.url);
  });
  box.addEventListener('dragover', (e) => {
    if (dragId == null) return;
    const el = e.target.closest('.tab');
    if (!el) return;
    e.preventDefault();
    clearDrag();
    el.classList.add(before(el, e) ? 'drag-over-before' : 'drag-over-after');
  });
  box.addEventListener('drop', (e) => {
    const el = e.target.closest('.tab');
    if (dragId == null || !el) return;
    e.preventDefault();
    const target = tabs.findIndex((t) => t.id === Number(el.dataset.id));
    moveTab(dragId, before(el, e) ? target : target + 1);
  });
  box.addEventListener('dragend', () => {
    clearDrag();
    $$('.tab.dragging').forEach((x) => x.classList.remove('dragging'));
    dragId = null;
  });

  // toolbar
  $('#nav-back').onclick = () => { const t = active(); if (t && t.wv) t.wv.goBack(); };
  $('#nav-fwd').onclick = () => { const t = active(); if (t && t.wv) t.wv.goForward(); };
  $('#nav-reload').onclick = () => { const t = active(); if (!t || !t.wv) return; if (t.loading) t.wv.stop(); else t.wv.reload(); };
  $('#nav-home').onclick = () => {
    const t = active();
    if (!t || !t.wv) return;
    // a fresh start tab in place of the current one
    const i = tabs.indexOf(t);
    const n = createTab('', { index: i + 1 });
    closeTab(t.id);
    activate(n.id);
  };
  const addr = $('#address');
  addr.addEventListener('focus', () => { const t = active(); addr.value = t && t.url ? t.url : ''; setTimeout(() => addr.select(), 0); });
  addr.addEventListener('blur', () => updateToolbar());
  $('#omnibox').onsubmit = (e) => { e.preventDefault(); navigate(addr.value); addr.blur(); };
  addr.addEventListener('keydown', (e) => { if (e.key === 'Escape') { addr.blur(); const t = active(); if (t && t.wv) t.wv.focus(); } });
  $('#omni-dial').onclick = toggleDialForActive;
  $('#zoom-chip').onclick = () => zoom(0);
  $('#vpn-site-chip').onclick = toggleVpnPopover;
  $('#btn-vpn').onclick = (e) => { e.stopPropagation(); toggleVpnPopover(); };
  $('#btn-notes').onclick = () => openNotes();
  $('#btn-settings').onclick = () => openSettings();

  // find
  $('#find-input').addEventListener('input', (e) => {
    const t = active();
    if (!t || !t.wv) return;
    if (e.target.value) t.wv.findInPage(e.target.value);
    else { t.wv.stopFindInPage('clearSelection'); $('#find-count').textContent = ''; }
  });
  $('#find-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') findStep(!e.shiftKey);
    if (e.key === 'Escape') hideFind();
  });
  $('#find-next').onclick = () => findStep(true);
  $('#find-prev').onclick = () => findStep(false);
  $('#find-close').onclick = hideFind;

  // start page
  $('#start-search').onsubmit = (e) => { e.preventDefault(); const v = $('#start-input').value; if (v.trim()) { navigate(v); $('#start-input').value = ''; } };
  $('#start-customize').onclick = () => openSettings('look');
  $('#page-error-retry').onclick = () => { const t = active(); if (t && t.wv) { t.error = null; showTabContent(t); t.wv.loadURL(t.url).catch(() => {}); } };
  $('#page-error-vpn').onclick = async () => {
    const t = active();
    if (!t) return;
    const url = t.error ? t.error.url : t.url;
    const host = hostOf(url);
    if (!S.vpn.profiles.length) { openSettings('vpn'); toast('Добавьте сервер VPN — и страница откроется через него'); return; }
    if (!siteViaVpn(host)) await toggleSiteVpn(host);
    t.error = null;
    showTabContent(t);
    if (t.wv) t.wv.loadURL(url).catch(() => {});
  };

  // notes
  $('#notes-close').onclick = () => openNotes(false);
  $('#notes-add').onclick = () => { const t = active(); newNote({ url: notesFilter === 'site' && t ? t.url : '' }); };
  $('#notes-filter').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; notesFilter = b.dataset.f; editingId = null; renderNotes(); };
  $('#notes-search').oninput = (e) => { notesQuery = e.target.value; renderNotes(); };
  $('#ne-back').onclick = () => { const n = notes.find((x) => x.id === editingId); if (n && !n.title.trim() && !n.text.trim()) { notes = notes.filter((x) => x !== n); saveNotes(); } editingId = null; renderNotes(); updateNotesBadge(); };
  $('#ne-title').oninput = (e) => { const n = notes.find((x) => x.id === editingId); if (n) { n.title = e.target.value; touch(n); } };
  $('#ne-text').oninput = (e) => { const n = notes.find((x) => x.id === editingId); if (n) { n.text = e.target.value; touch(n); } };
  $('#ne-link').onclick = () => {
    const n = notes.find((x) => x.id === editingId);
    const t = active();
    if (!n) return;
    if (n.url) { n.url = ''; n.host = ''; } else if (t && t.url) { n.url = t.url; n.host = hostOf(t.url); }
    touch(n);
    renderEditor(n);
  };
  $('#ne-quote').onclick = quoteSelection;
  $('#ne-delete').onclick = () => deleteNote(editingId);

  // dialogs
  for (const b of $$('.close-dlg')) b.onclick = () => b.closest('dialog').close();
  $('#settings-dlg').addEventListener('close', () => saveSettings());

  // floating menus
  document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('#menu, #popover, #btn-vpn, #vpn-site-chip')) closeFloating();
  });
  window.addEventListener('blur', () => { if ($('#menu').hidden === false) closeFloating(); });
  window.addEventListener('resize', closeFloating);

  // keys typed while the browser UI (not a page) has focus
  document.addEventListener('keydown', (e) => {
    const k = keyString(e);
    if (k === 'Escape' && document.activeElement && document.activeElement.closest && document.activeElement.closest('dialog')) return;
    if (shortcut(k)) e.preventDefault();
  });

  // from the main process
  T.onShortcut((k) => shortcut(k));
  T.onTabOpen(({ url, background }) => createTab(url, { background }));
  T.onFullscreen((on) => { if (!on) document.body.classList.remove('html-fs'); });
  T.onCtx((c) => {
    if (c.type === 'search') createTab(toUrl(c.text).startsWith('http') && !/\s/.test(c.text) ? c.text : searchUrl(c.text));
    if (c.type === 'note') {
      const t = active();
      newNote({ text: c.text ? c.text.split('\n').map((l) => '> ' + l).join('\n') + '\n\n' : '', url: c.url, title: c.text ? '' : (t && t.title) || '' });
    }
    if (c.type === 'vpn-site') toggleSiteVpn(hostOf(c.url));
    if (c.type === 'background') { S.bg = 'image'; S.bgImage = c.url; onSettingChanged('bg'); toast('Готово — это теперь фон браузера'); }
  });
  const downloads = new Map();
  T.onDownload((d) => {
    if (d.state === 'started') downloads.set(d.id, toast(`Загрузка: ${d.name}`));
    if (d.state === 'completed') toast(`Загружено: ${d.name}`, { action: { label: 'Показать', fn: () => T.showItem(d.path) }, ms: 7000 });
    if (d.state === 'interrupted') toast(`Загрузка прервалась: ${d.name}`, { err: true });
  });
}

// ---------- start

async function init() {
  S = merge(DEFAULTS, await T.store.get('settings', {}));
  if (!Array.isArray(S.dial)) S.dial = structuredClone(DEFAULT_DIAL);
  notes = await T.store.get('notes', []);
  if (!Array.isArray(notes)) notes = [];
  applyLayout();
  applyAppearance();
  renderDial();
  tickClock();
  setInterval(tickClock, 5000);
  setInterval(() => suspendIdleTabs(false), 60000);
  wire();
  updateVpnButton();
  $('#notes').hidden = !S.notesOpen;
  $('#btn-notes').classList.toggle('active', S.notesOpen);

  // Route traffic before any page loads, so nothing leaks past the VPN
  if (S.vpn.enabled) await vpnApply(false);
  if (S.vpn.enabled && vpnState.error) toast(vpnState.error, { err: true, ms: 9000 });

  const sess = S.restore ? await T.store.get('session', null) : null;
  if (sess && Array.isArray(sess.tabs) && sess.tabs.length) {
    // with lazy restore only the active tab loads; the rest wait for a click
    const made = sess.tabs.map((t, i) => createTab(t.url || '', {
      title: t.title, pinned: t.pinned, color: t.color, favicon: t.favicon, background: true, restoring: true, index: tabs.length,
      lazy: S.lazyRestore && i !== sess.active,
    }));
    activate((made[sess.active] || made[0]).id);
  } else {
    createTab();
  }
  renderNotes();
  updateNotesBadge();
}

init();
