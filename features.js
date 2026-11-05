'use strict';
/* global tako */
// Everything added on top of the core browser in renderer.js:
// history and address-bar suggestions, bookmarks, downloads, tab groups, workspaces,
// split view, tab previews, light mode, saved looks, video backgrounds, private tabs,
// ad blocking, secure DNS, VPN ping and subscription refresh, picture-in-picture,
// screenshots, reader mode, translation, custom shortcuts, updates and the main menu.
// It plugs into renderer.js through HOOKS and by replacing a few window functions.

(() => {
  Object.assign(DEFAULTS, {
    saveHistory: true, bmBar: 'always', tabPreview: true, showWs: true,
    workspaces: [{ id: 'main', name: 'Основное', color: '#ff5a47' }], activeWs: 'main',
    adblock: { enabled: true, allow: [] }, dns: 'off', dnsCustom: '',
    siteDark: false, siteDarkSites: {},
    translateTo: 'ru', translator: 'google',
    readerSize: 19, readerTheme: 'app',
    keys: {}, presets: [], splitRatio: 0.5,
  });
  Object.assign(DEFAULTS.vpn, { autoFastest: false, subEvery: 24, subsAt: 0 });
  for (const k of ['mode', 'bmBar', 'translator', 'dns']) RERENDER.add(k);

  // ===================================================================== small helpers

  const later = (ms) => new Promise((r) => setTimeout(r, ms));
  const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const fav = (url) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostOf(url))}&sz=32`;
  const fmtSize = (b) => (b >= 1073741824 ? (b / 1073741824).toFixed(2) + ' ГБ' : b >= 1048576 ? (b / 1048576).toFixed(1) + ' МБ' : b >= 1024 ? Math.round(b / 1024) + ' КБ' : (b || 0) + ' Б');
  const hhmm = (ts) => { const d = new Date(ts); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

  /** A little form in a dialog: fields [{ key, label, value, placeholder, list }] -> values or null */
  function ask(title, fields, okLabel = 'Готово') {
    const dlg = $('#ask-dlg');
    $('#ask-title').textContent = title;
    $('#ask-ok').textContent = okLabel;
    const box = $('#ask-fields');
    box.innerHTML = fields.map((f, i) => `<label class="field"><span class="label">${esc(f.label)}</span><input class="text-input" data-i="${i}" value="${esc(f.value || '')}" placeholder="${esc(f.placeholder || '')}" ${f.list ? `list="ask-list-${i}"` : ''}>${f.list ? `<datalist id="ask-list-${i}">${f.list.map((o) => `<option value="${esc(o)}">`).join('')}</datalist>` : ''}</label>`).join('');
    dlg.returnValue = '';
    dlg.showModal();
    setTimeout(() => { const first = box.querySelector('input'); if (first) { first.focus(); first.select(); } }, 30);
    return new Promise((resolve) => {
      dlg.onclose = () => {
        if (dlg.returnValue !== 'ok') return resolve(null);
        const out = {};
        fields.forEach((f, i) => { out[f.key] = box.querySelector(`[data-i="${i}"]`).value.trim(); });
        resolve(out);
      };
    });
  }

  function anchorMenu(btn, items) {
    const r = btn.getBoundingClientRect();
    showMenu(r.left, r.bottom + 6, items);
    // keep it under the button, right-aligned when near the edge
    const m = $('#menu');
    const mr = m.getBoundingClientRect();
    if (mr.right > innerWidth - 8) m.style.left = Math.max(8, r.right - mr.width) + 'px';
  }

  function popoverAt(btn, html, width = 340) {
    closeFloating();
    const pop = $('#popover');
    pop.innerHTML = html;
    pop.style.width = width + 'px';
    const r = btn.getBoundingClientRect();
    place(pop, Math.min(r.right - width, innerWidth - width - 8), r.bottom + 8);
    return pop;
  }

  // ===================================================================== history

  let history = []; // newest first: { url, title, ts, n }
  const saveHistory = debounce(() => T.store.set('history', history), 1500);

  function visit(tab, titleOnly) {
    if (!S.saveHistory || tab.priv || !/^https?:/.test(tab.url || '')) return;
    const i = history.findIndex((h) => h.url === tab.url);
    if (titleOnly) {
      if (i >= 0 && tab.title) { history[i].title = tab.title; saveHistory(); }
      return;
    }
    const e = i >= 0 ? history.splice(i, 1)[0] : { url: tab.url, title: tab.title, n: 0 };
    e.n++;
    e.ts = Date.now();
    if (tab.title && tab.title !== hostOf(tab.url)) e.title = tab.title;
    history.unshift(e);
    if (history.length > 5000) history.length = 5000;
    saveHistory();
  }
  HOOKS.navigate.push(visit);

  function dayLabel(ts) {
    const d = new Date(ts); d.setHours(0, 0, 0, 0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.round((today - d) / 86400000);
    if (diff === 0) return 'Сегодня';
    if (diff === 1) return 'Вчера';
    return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() !== today.getFullYear() ? ' ' + d.getFullYear() : ''}`;
  }

  function renderHistory() {
    const q = $('#history-search').value.trim().toLowerCase();
    const list = (q ? history.filter((h) => (h.title + ' ' + h.url).toLowerCase().includes(q)) : history).slice(0, 500);
    const box = $('#history-list');
    if (!list.length) { box.innerHTML = `<div class="list-empty">${q ? 'Ничего не нашлось' : S.saveHistory ? 'История пока пустая' : 'История выключена в настройках'}</div>`; return; }
    let html = '', day = '';
    for (const h of list) {
      const d = dayLabel(h.ts);
      if (d !== day) { day = d; html += `<h4>${esc(d)}</h4>`; }
      html += `<div class="list-row" data-url="${esc(h.url)}"><span class="time">${hhmm(h.ts)}</span><img src="${fav(h.url)}" alt=""><div class="txt"><b>${esc(h.title || h.url)}</b><small>${esc(displayUrl(h.url))}</small></div><button class="icon sm" data-del="${esc(h.url)}" title="Удалить из истории">${icon('x')}</button></div>`;
    }
    box.innerHTML = html;
  }

  function openHistory() {
    closeFloating();
    $('#history-search').value = '';
    renderHistory();
    $('#history-dlg').showModal();
    setTimeout(() => $('#history-search').focus(), 30);
  }

  function clearHistory(since) {
    history = since ? history.filter((h) => h.ts < since) : [];
    saveHistory();
    renderHistory();
    toast('История очищена');
  }

  // ===================================================================== bookmarks

  let bookmarks = []; // { id, title, url, folder, ts }
  const saveBookmarks = debounce(() => T.store.set('bookmarks', bookmarks), 400);
  const bmFor = (url) => bookmarks.find((b) => b.url === url);
  const folders = () => [...new Set(bookmarks.map((b) => b.folder).filter(Boolean))].sort();

  async function editBookmark(b) {
    const r = await ask('Закладка', [
      { key: 'title', label: 'Название', value: b.title },
      { key: 'url', label: 'Адрес', value: b.url },
      { key: 'folder', label: 'Папка', value: b.folder, placeholder: 'Пусто — прямо на панели закладок', list: folders() },
    ], 'Сохранить');
    if (!r) return;
    b.title = r.title || hostOf(r.url);
    b.url = toUrl(r.url) || b.url;
    b.folder = r.folder.replace(/\s*\/\s*/g, ' / ');
    saveBookmarks();
    renderBmBar();
    if ($('#bm-dlg').open) renderBmList();
    updateToolbar();
  }

  function toggleBookmark() {
    const t = active();
    if (!t || !t.url) return;
    const b = bmFor(t.url);
    if (b) {
      bookmarks = bookmarks.filter((x) => x !== b);
      toast('Закладка удалена', { action: { label: 'Вернуть', fn: () => { bookmarks.push(b); saveBookmarks(); renderBmBar(); updateToolbar(); } } });
    } else {
      const nb = { id: uid('b'), title: (t.title || hostOf(t.url)).slice(0, 80), url: t.url, folder: '', ts: Date.now() };
      bookmarks.push(nb);
      toast('Добавлено в закладки', { action: { label: 'Изменить', fn: () => editBookmark(nb) } });
    }
    saveBookmarks();
    renderBmBar();
    updateToolbar();
  }

  function openBookmark(url, e) {
    if (e && (e.button === 1 || e.ctrlKey || e.metaKey)) { createTab(url, { background: true }); return; }
    const t = active();
    if (t) navigate(url, t); else createTab(url);
  }

  function bookmarkMenu(b, x, y) {
    showMenu(x, y, [
      { label: 'Открыть в новой вкладке', icon: 'plus', fn: () => createTab(b.url, { background: true }) },
      { label: 'Открыть в приватной вкладке', icon: 'mask', fn: () => createTab(b.url, { private: true }) },
      '-',
      { label: 'Изменить…', icon: 'note', fn: () => editBookmark(b) },
      { label: 'Удалить', icon: 'trash', fn: () => { bookmarks = bookmarks.filter((x) => x !== b); saveBookmarks(); renderBmBar(); if ($('#bm-dlg').open) renderBmList(); updateToolbar(); } },
    ]);
  }

  function renderBmBar() {
    const bar = $('#bmbar');
    const t = active();
    const onStart = !t || !t.wv;
    const show = bookmarks.length && (S.bmBar === 'always' || (S.bmBar === 'start' && onStart));
    bar.hidden = !show;
    if (!show) return;
    const top = bookmarks.filter((b) => !b.folder);
    const roots = [...new Set(bookmarks.filter((b) => b.folder).map((b) => b.folder.split(' / ')[0]))];
    bar.innerHTML = roots.map((f) => `<button class="bm folder" data-folder="${esc(f)}">${icon('folder')}<span>${esc(f)}</span></button>`).join('')
      + top.map((b) => `<button class="bm" data-id="${b.id}" title="${esc(b.title)}\n${esc(b.url)}"><img src="${fav(b.url)}" alt=""><span>${esc(b.title)}</span></button>`).join('')
      + `<span class="flex"></span><button class="bm all" id="bm-all">${icon('bookmark')}<span>Все закладки</span></button>`;
  }

  function folderMenu(btn, root) {
    const items = bookmarks.filter((b) => b.folder === root || b.folder.startsWith(root + ' / '));
    anchorMenu(btn, [
      ...items.slice(0, 40).map((b) => ({ label: (b.folder !== root ? b.folder.slice(root.length + 3) + ' › ' : '') + b.title, icon: 'globe', fn: () => openBookmark(b.url) })),
      ...(items.length > 40 ? ['-', { label: `Все ${items.length}…`, icon: 'bookmark', fn: () => openBookmarks(root) }] : []),
      '-',
      { label: 'Открыть все во вкладках', icon: 'tabs', fn: () => items.slice(0, 20).forEach((b) => createTab(b.url, { background: true })) },
    ]);
  }

  function renderBmList() {
    const q = $('#bm-search').value.trim().toLowerCase();
    const list = q ? bookmarks.filter((b) => (b.title + ' ' + b.url + ' ' + b.folder).toLowerCase().includes(q)) : bookmarks;
    const box = $('#bm-list');
    if (!list.length) { box.innerHTML = `<div class="list-empty">${q ? 'Ничего не нашлось' : 'Закладок пока нет. Нажмите ☆ в адресной строке или импортируйте их из другого браузера'}</div>`; return; }
    const byFolder = new Map();
    for (const b of list) { const f = b.folder || ''; if (!byFolder.has(f)) byFolder.set(f, []); byFolder.get(f).push(b); }
    const keys = [...byFolder.keys()].sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)));
    box.innerHTML = keys.map((f) => `<h4>${icon('folder')}${esc(f || 'Панель закладок')} <small>${byFolder.get(f).length}</small></h4>`
      + byFolder.get(f).map((b) => `<div class="list-row" data-id="${b.id}"><img src="${fav(b.url)}" alt=""><div class="txt"><b>${esc(b.title)}</b><small>${esc(displayUrl(b.url))}</small></div><button class="icon sm" data-edit="${b.id}" title="Изменить">${icon('note')}</button><button class="icon sm" data-del="${b.id}" title="Удалить">${icon('trash')}</button></div>`).join('')).join('');
  }

  function openBookmarks(q) {
    closeFloating();
    $('#bm-search').value = q || '';
    renderBmList();
    $('#bm-dlg').showModal();
  }

  async function importBookmarks(from) {
    const r = await T.importBookmarks(from);
    if (!r.ok) { if (!r.canceled) toast(r.error, { err: true }); return; }
    const have = new Set(bookmarks.map((b) => b.url + '|' + b.folder));
    const label = { chrome: 'Chrome', yandex: 'Яндекс', edge: 'Edge', brave: 'Brave', file: 'Импорт' }[from];
    let n = 0;
    for (const b of r.list) {
      const folder = b.folder ? `${label} / ${b.folder}` : label;
      if (have.has(b.url + '|' + folder)) continue;
      bookmarks.push({ id: uid('b'), title: b.title, url: b.url, folder, ts: Date.now() });
      n++;
    }
    saveBookmarks();
    renderBmBar();
    renderBmList();
    toast(n ? `Импортировано закладок: ${n}` : 'Новых закладок не нашлось');
  }

  // ===================================================================== address bar suggestions

  let sugItems = [];
  let sugSel = -1;

  function buildSuggestions(q) {
    const ql = q.toLowerCase();
    const out = [];
    const seen = new Set();
    const add = (it) => { if (it.url && seen.has(it.url)) return; if (it.url) seen.add(it.url); out.push(it); };
    const target = toUrl(q);
    const isSearch = target === searchUrl(q.trim());
    add(isSearch ? { icon: 'search', title: q, sub: `Искать в ${engineName()}`, url: target } : { icon: 'globe', title: displayUrl(target), sub: 'Перейти', url: target });
    const match = (s) => (s || '').toLowerCase().includes(ql);
    for (const t of tabs) if (t.id !== activeId && t.url && (match(t.title) || match(t.url))) add({ icon: 'tabs', title: t.title, sub: 'Переключиться на вкладку', url: t.url, tabId: t.id });
    for (const b of bookmarks) if (match(b.title) || match(b.url)) add({ icon: 'star', title: b.title, sub: displayUrl(b.url), url: b.url });
    for (const d of S.dial) if (match(d.name) || match(d.url)) add({ icon: 'pin', title: d.name, sub: displayUrl(d.url), url: d.url });
    const hits = history.filter((h) => match(h.title) || match(h.url))
      .map((h) => ({ h, score: h.n * 3 + (hostOf(h.url).startsWith(ql) ? 40 : 0) - (Date.now() - h.ts) / 86400000 }))
      .sort((a, b) => b.score - a.score).slice(0, 8);
    for (const { h } of hits) add({ icon: 'history', title: h.title || displayUrl(h.url), sub: displayUrl(h.url), url: h.url });
    return out.slice(0, 8);
  }

  function renderSuggest() {
    const box = $('#suggest');
    if (!sugItems.length) { box.hidden = true; return; }
    box.innerHTML = sugItems.map((it, i) => `<div class="sug ${i === sugSel ? 'on' : ''}" data-i="${i}">${icon(it.icon)}<b>${esc(it.title)}</b><small>${esc(it.sub)}</small></div>`).join('');
    box.hidden = false;
  }

  function chooseSuggestion(it) {
    $('#suggest').hidden = true;
    sugItems = [];
    $('#address').blur();
    if (it.tabId) activate(it.tabId);
    else navigate(it.url);
  }

  // ===================================================================== downloads

  const dls = new Map();
  const saveDownloads = debounce(() => T.store.set('downloads', [...dls.values()].filter((d) => d.state !== 'progress' && d.state !== 'started').slice(-40)), 800);

  function onDownload(d) {
    const prev = dls.get(d.id);
    if (prev && d.state === 'progress') {
      const dt = (Date.now() - prev.t) / 1000;
      if (dt > 0.5) { d.speed = Math.max(0, (d.received - prev.received) / dt); d.t = Date.now(); } else { d.speed = prev.speed; d.t = prev.t; }
    } else d.t = Date.now();
    dls.set(d.id, { ...prev, ...d });
    if (d.state === 'started') toast(`Загрузка: ${d.name}`, { action: { label: 'Загрузки', fn: openDownloads } });
    if (d.state === 'completed') toast(`Загружено: ${d.name}`, { action: { label: 'Открыть', fn: () => T.openPath(d.path) }, ms: 7000 });
    if (d.state === 'interrupted' && !(prev && prev.state === 'interrupted')) toast(`Загрузка прервалась: ${d.name}`, { err: true });
    if (d.state !== 'progress') saveDownloads();
    updateDlButton();
    if ($('#popover').dataset.kind === 'downloads' && !$('#popover').hidden) renderDownloads();
  }

  function updateDlButton() {
    const b = $('#btn-downloads');
    b.hidden = !dls.size;
    const running = [...dls.values()].filter((d) => d.state === 'progress' || d.state === 'started');
    const total = running.reduce((s, d) => s + (d.total || 0), 0);
    const got = running.reduce((s, d) => s + (d.received || 0), 0);
    b.classList.toggle('running', running.length > 0);
    b.style.setProperty('--p', total ? Math.round((got / total) * 100) + '%' : '0%');
  }

  function renderDownloads() {
    const pop = $('#popover');
    const list = [...dls.values()].reverse();
    pop.innerHTML = `<div class="pop-head"><b>Загрузки</b>${list.length ? '<button class="btn small ghost" id="dl-clear">Очистить список</button>' : ''}</div>`
      + (list.length ? `<div class="dl-list">${list.map((d) => {
        const run = d.state === 'progress' || d.state === 'started';
        const pct = d.total ? Math.round((d.received / d.total) * 100) : 0;
        const status = run ? (d.paused ? `Пауза · ${fmtSize(d.received)} из ${fmtSize(d.total)}` : `${pct}% · ${fmtSize(d.received)} из ${fmtSize(d.total)}${d.speed ? ` · ${fmtSize(d.speed)}/с` : ''}`)
          : d.state === 'completed' ? `Готово · ${fmtSize(d.total || d.received)}` : d.state === 'cancelled' ? 'Отменено' : 'Прервано';
        return `<div class="dl ${d.state}" data-id="${d.id}"><div class="dl-txt"><b title="${esc(d.name)}">${esc(d.name)}</b><small>${status}</small>${run ? `<i class="dl-bar"><i style="width:${pct}%"></i></i>` : ''}</div>
          ${run ? `<button class="icon sm" data-act="${d.paused ? 'resume' : 'pause'}" title="${d.paused ? 'Продолжить' : 'Пауза'}">${icon(d.paused ? 'play' : 'pause')}</button><button class="icon sm" data-act="cancel" title="Отменить">${icon('x')}</button>`
            : d.state === 'completed' ? `<button class="icon sm" data-act="open" title="Открыть">${icon('external')}</button><button class="icon sm" data-act="show" title="Показать в папке">${icon('folder')}</button>`
              : `<button class="icon sm" data-act="retry" title="Скачать снова">${icon('reload')}</button>`}</div>`;
      }).join('')}</div>` : '<div class="vpn-empty">Пока ничего не скачивали</div>');
    const cl = $('#dl-clear', pop);
    if (cl) cl.onclick = () => { for (const [id, d] of dls) if (d.state !== 'progress' && d.state !== 'started') dls.delete(id); saveDownloads(); updateDlButton(); renderDownloads(); };
    pop.onclick = (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const d = dls.get(b.closest('.dl').dataset.id);
      if (!d) return;
      const act = b.dataset.act;
      if (act === 'open') T.openPath(d.path);
      else if (act === 'show') T.showItem(d.path);
      else if (act === 'retry') { const t = active(); if (t && t.wv) t.wv.downloadURL(d.url); }
      else T.downloadAction(d.id, act);
    };
  }

  function openDownloads() {
    const pop = popoverAt($('#btn-downloads').hidden ? $('#btn-menu') : $('#btn-downloads'), '', 380);
    pop.dataset.kind = 'downloads';
    renderDownloads();
  }

  // ===================================================================== ad blocking

  const adblockStatus = { full: false, updatedAt: 0, total: 0 };
  const siteAllowed = (host) => S.adblock.allow.some((d) => host === d || host.endsWith('.' + d));
  const pushAdblock = () => T.adblock.set(S.adblock).then((st) => Object.assign(adblockStatus, st));

  function adblockPopover() {
    const t = active();
    const host = t && t.url ? hostOf(t.url) : '';
    const allowed = host && siteAllowed(host);
    const pop = popoverAt($('#omni-block'), `
      <div class="pop-head"><b>Блокировка рекламы</b><label class="switch"><input type="checkbox" id="ab-on" ${S.adblock.enabled ? 'checked' : ''}><span></span></label></div>
      <div class="stats"><div class="stat"><b>${t ? t.blocked : 0}</b><small>на этой странице</small></div><div class="stat"><b>${adblockStatus.total}</b><small>за сеанс</small></div></div>
      ${host ? `<div class="pop-row"><span>${esc(host)}</span><button class="btn small" id="ab-site">${allowed ? 'Блокировать здесь' : 'Не блокировать здесь'}</button></div>` : ''}
      <div class="pop-actions"><button class="btn small ghost" id="ab-settings">${icon('gear')}Настройки</button></div>`, 320);
    pop.dataset.kind = 'adblock';
    $('#ab-on').onchange = (e) => { S.adblock.enabled = e.target.checked; saveSettings(); pushAdblock().then(() => { if (t && t.wv) t.wv.reload(); }); updateToolbar(); };
    const site = $('#ab-site');
    if (site) site.onclick = () => {
      S.adblock.allow = allowed ? S.adblock.allow.filter((d) => !(host === d || host.endsWith('.' + d))) : [...S.adblock.allow, host];
      saveSettings();
      pushAdblock().then(() => { if (t.wv) t.wv.reload(); });
      closeFloating();
      toast(allowed ? `Реклама на ${host} снова блокируется` : `На ${host} реклама больше не блокируется`);
    };
    $('#ab-settings').onclick = () => openSettings('privacy');
  }

  // ===================================================================== dark mode for sites

  const DARK_CSS = `html { filter: invert(1) hue-rotate(180deg) !important; background: #fff !important; }
img, video, picture, canvas, iframe, embed, object, svg image, [style*="background-image"] { filter: invert(1) hue-rotate(180deg) !important; }`;

  function siteDarkWanted(tab) {
    const host = hostOf(tab.url);
    if (host && host in S.siteDarkSites) return S.siteDarkSites[host];
    return S.siteDark;
  }

  async function applySiteDark(tab) {
    if (!tab.wv || !/^https?:/.test(tab.url || '')) return;
    const want = siteDarkWanted(tab);
    if (!want) {
      // injected styles cannot be taken back reliably — a reload drops them
      if (tab.darkKey) { tab.darkKey = null; tab.wv.reload(); }
      return;
    }
    if (tab.darkKey) return;
    // pages that are dark already stay as they are, unless darkening was asked for this site
    const forced = hostOf(tab.url) in S.siteDarkSites;
    let info = { lum: 255, bg: '#ffffff' };
    try {
      info = await tab.wv.executeJavaScript(`(() => { const pick = (el) => el && getComputedStyle(el).backgroundColor; let c = pick(document.body); if (!c || /rgba\\(0, 0, 0, 0\\)|transparent/.test(c)) c = pick(document.documentElement); const m = (c || '').match(/\\d+/g); if (!m || (m[3] !== undefined && +m[3] === 0)) return { lum: 255, bg: '#ffffff' }; return { lum: 0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2], bg: c }; })()`) || info;
    } catch { /* page refused */ }
    if (!forced && info.lum < 110) return; // dark already
    // the page colour also goes under the body, so the bottom of short pages is not black
    try { tab.darkKey = await tab.wv.insertCSS(DARK_CSS.replace('background: #fff', `background: ${info.bg}`)); } catch { /* not ready */ }
  }

  function toggleSiteDark() {
    const t = active();
    if (!t || !t.url) return;
    const host = hostOf(t.url);
    const now = siteDarkWanted(t) && !!t.darkKey;
    S.siteDarkSites[host] = !now;
    saveSettings();
    applySiteDark(t);
    toast(!now ? `Тёмный режим для ${host} включён` : `Тёмный режим для ${host} выключен`);
  }

  // ===================================================================== reader mode

  let readerSrc = null;

  async function openReader() {
    const t = active();
    if (!t || !t.wv) return;
    if (readerSrc == null) readerSrc = await T.readerSource();
    if (!readerSrc) { toast('Режим чтения недоступен', { err: true }); return; }
    let art = null;
    try {
      art = await t.wv.executeJavaScript(`(() => { ${readerSrc}\n; try { const a = new Readability(document.cloneNode(true)).parse(); return a ? { title: a.title, byline: a.byline, content: a.content, site: a.siteName, len: a.length } : null; } catch (e) { return null; } })()`);
    } catch { /* blocked by the page */ }
    if (!art || art.len < 200) { toast('На этой странице не нашлось статьи для чтения'); return; }
    t.reader = art;
    showReader(t);
  }

  function readerColors() {
    if (S.readerTheme === 'sepia') return ['#f4ecd8', '#433422', '#8a6a3c'];
    if (S.readerTheme === 'light') return ['#ffffff', '#1d1f25', '#2f6fdf'];
    const cs = getComputedStyle(document.documentElement);
    return [cs.getPropertyValue('--bg-solid').trim() || '#101115', cs.getPropertyValue('--text').trim() || '#eee', cs.getPropertyValue('--accent').trim()];
  }

  function showReader(t) {
    const art = t.reader;
    const [bg, fg, link] = readerColors();
    $('#reader-site').textContent = art.site || hostOf(t.url);
    for (const b of $$('#reader-theme button')) b.classList.toggle('on', b.dataset.v === S.readerTheme);
    // the article runs in a sandboxed frame with scripts off: page HTML never touches the browser UI
    $('#reader-frame').srcdoc = `<!doctype html><html><head><meta charset="utf-8"><base href="${esc(t.url)}" target="_blank"><style>
      html { background: ${bg}; color: ${fg}; }
      body { max-width: 700px; margin: 0 auto; padding: 40px 28px 80px; font: ${S.readerSize}px/1.7 "Iowan Old Style", "Palatino Linotype", Georgia, serif; }
      h1 { font-size: 1.9em; line-height: 1.2; margin: 0 0 .3em; } .by { opacity: .65; font: 14px system-ui, sans-serif; margin-bottom: 2em; }
      img, video, figure { max-width: 100%; height: auto; } a { color: ${link}; } pre, code { white-space: pre-wrap; font-size: .85em; }
      blockquote { margin: 1em 0; padding-left: 1em; border-left: 3px solid ${link}; opacity: .85; } table { max-width: 100%; display: block; overflow-x: auto; }
    </style></head><body><h1>${esc(art.title)}</h1>${art.byline ? `<div class="by">${esc(art.byline)}</div>` : '<div class="by"></div>'}${art.content}</body></html>`;
    $('#reader').hidden = false;
  }

  function closeReader() { $('#reader').hidden = true; $('#reader-frame').srcdoc = ''; }

  async function checkReadable(tab) {
    if (!tab.wv || !/^https?:/.test(tab.url || '')) { tab.readable = false; return; }
    try { tab.readable = await tab.wv.executeJavaScript('[...document.querySelectorAll("p")].filter((p) => p.innerText.length > 120).length >= 3'); } catch { tab.readable = false; }
    if (tab.id === activeId) $('#omni-reader').hidden = !tab.readable;
  }

  // ===================================================================== page tools

  const PIP_JS = `(async () => {
    if (document.pictureInPictureElement) { await document.exitPictureInPicture(); return 'exit'; }
    const vids = [...document.querySelectorAll('video')].filter((v) => v.readyState > 0 && v.clientWidth > 0);
    vids.sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight));
    const v = vids.find((x) => !x.paused) || vids[0];
    if (!v) return 'none';
    v.disablePictureInPicture = false;
    await v.requestPictureInPicture();
    return 'ok';
  })()`;

  async function pip() {
    const t = active();
    if (!t || !t.wv) return;
    let r = 'none';
    try { r = await t.wv.executeJavaScript(PIP_JS, true); } catch { r = 'err'; }
    if (r === 'none') toast('На странице нет видео');
    if (r === 'err') toast('Сайт не разрешает картинку в картинке', { err: true });
  }

  async function screenshot(full, clip) {
    const t = active();
    if (!t || !t.wv || !t.wcId) { toast('Откройте страницу, чтобы сделать скриншот'); return; }
    const r = await T.screenshot(t.wcId, full, clip);
    if (r.ok && r.clipboard) toast('Скриншот скопирован');
    else if (r.ok) toast('Скриншот сохранён', { action: { label: 'Показать', fn: () => T.showItem(r.path) } });
    else if (!r.canceled) toast('Не получилось: ' + r.error, { err: true });
  }

  function translatePage() {
    const t = active();
    if (!t || !/^https?:/.test(t.url || '')) return;
    navigate(`https://translate.google.com/translate?sl=auto&tl=${S.translateTo}&u=${encodeURIComponent(t.url)}`, t);
  }

  function translateText(text) {
    const url = S.translator === 'yandex'
      ? `https://translate.yandex.ru/?source_lang=auto&target_lang=${S.translateTo}&text=${encodeURIComponent(text)}`
      : `https://translate.google.com/?sl=auto&tl=${S.translateTo}&text=${encodeURIComponent(text)}&op=translate`;
    createTab(url);
  }

  // ===================================================================== split view

  function openSplit(otherId) {
    const a = active();
    const b = byId(otherId);
    if (!a || !b || a === b) return;
    if (!a.url || !b.url) { toast('Для разделения нужны две вкладки с сайтами'); return; }
    for (const t of [a, b]) if (!t.wv) { t.lazy = false; t.suspended = false; navigate(t.url, t); }
    split = { a: a.id, b: b.id };
    activate(a.id);
    layoutSplit();
  }

  function splitWithNext() {
    const a = active();
    const list = visibleTabs().filter((t) => t !== a && t.url);
    if (!list.length) { toast('Откройте ещё одну вкладку с сайтом — и её можно будет поставить рядом'); return; }
    const best = list.sort((x, y) => y.lastActive - x.lastActive)[0];
    openSplit(best.id);
  }

  function closeSplit() {
    if (!split) return;
    split = null;
    activate(activeId);
    layoutSplit();
  }

  function layoutSplit() {
    document.body.classList.toggle('in-split', !!split);
    $('#split-divider').hidden = !split;
    $('#content').style.setProperty('--split', String(S.splitRatio || 0.5));
  }

  // ===================================================================== workspaces

  const wsOf = (t) => t.ws || S.workspaces[0].id;

  function renderWs() {
    const b = $('#ws-btn');
    const w = S.workspaces.find((x) => x.id === S.activeWs) || S.workspaces[0];
    b.hidden = !S.showWs;
    b.style.setProperty('--w', w.color);
    $('#ws-name').textContent = w.name;
    b.title = `Пространство: ${w.name}`;
  }

  function switchWs(id) {
    if (!S.workspaces.some((w) => w.id === id)) return;
    S.activeWs = id;
    saveSettings();
    split = null;
    const list = visibleTabs();
    if (list.length) activate(list.slice().sort((a, b) => b.lastActive - a.lastActive)[0].id);
    else createTab();
    renderWs();
    renderTabs();
    saveSession();
  }

  async function newWorkspace() {
    const r = await ask('Новое пространство', [{ key: 'name', label: 'Название', placeholder: 'Например, «Работа» или «Учёба»' }], 'Создать');
    if (!r || !r.name) return;
    const w = { id: uid('w'), name: r.name.slice(0, 30), color: COLORS[S.workspaces.length % COLORS.length] };
    S.workspaces.push(w);
    switchWs(w.id);
  }

  function wsMenu() {
    const cur = S.workspaces.find((w) => w.id === S.activeWs) || S.workspaces[0];
    anchorMenu($('#ws-btn'), [
      { header: 'Пространства' },
      ...S.workspaces.map((w) => ({ label: (w.id === cur.id ? '● ' : '○ ') + w.name + ` (${tabs.filter((t) => wsOf(t) === w.id).length})`, fn: () => switchWs(w.id) })),
      '-',
      { label: 'Новое пространство…', icon: 'plus', fn: newWorkspace },
      { label: `Переименовать «${cur.name}»…`, icon: 'note', fn: async () => { const r = await ask('Переименовать', [{ key: 'name', label: 'Название', value: cur.name }]); if (r && r.name) { cur.name = r.name.slice(0, 30); saveSettings(); renderWs(); } } },
      { header: 'Цвет' },
      { colors: COLORS, value: cur.color, pick: (c) => { if (c) { cur.color = c; saveSettings(); renderWs(); } } },
      ...(S.workspaces.length > 1 ? ['-', { label: `Удалить «${cur.name}»`, icon: 'trash', fn: () => {
        const rest = S.workspaces.filter((w) => w !== cur);
        for (const t of tabs) if (wsOf(t) === cur.id) t.ws = rest[0].id;
        S.workspaces = rest;
        toast(`Вкладки перенесены в «${rest[0].name}»`);
        switchWs(rest[0].id);
      } }] : []),
    ]);
  }

  // ===================================================================== tab groups

  function addToGroup(t, gid) {
    t.group = gid;
    const members = tabs.filter((x) => x.group === gid && x !== t);
    if (members.length) {
      tabs.splice(tabs.indexOf(t), 1);
      tabs.splice(tabs.indexOf(members[members.length - 1]) + 1, 0, t);
    }
    renderTabs();
    saveSession();
  }

  async function newGroup(t) {
    const r = await ask('Новая группа', [{ key: 'name', label: 'Название', placeholder: 'Например, «Покупки»' }], 'Создать');
    if (!r) return;
    const g = { id: uid('g'), name: r.name.slice(0, 24), color: COLORS[groups.length % COLORS.length], collapsed: false };
    groups.push(g);
    addToGroup(t, g.id);
  }

  function groupMenu(g, x, y) {
    const members = tabs.filter((t) => t.group === g.id);
    showMenu(x, y, [
      { label: g.collapsed ? 'Развернуть' : 'Свернуть', icon: 'tabs', fn: () => { g.collapsed = !g.collapsed; renderTabs(); saveSession(); } },
      { label: 'Переименовать…', icon: 'note', fn: async () => { const r = await ask('Группа', [{ key: 'name', label: 'Название', value: g.name }]); if (r) { g.name = r.name.slice(0, 24); renderTabs(); saveSession(); } } },
      { label: 'Новая вкладка в группе', icon: 'plus', fn: () => { const t = createTab(''); addToGroup(t, g.id); } },
      { header: 'Цвет группы' },
      { colors: COLORS, value: g.color, pick: (c) => { if (c) { g.color = c; renderTabs(); saveSession(); } } },
      '-',
      { label: 'Разгруппировать', fn: () => { for (const t of members) t.group = null; groups = groups.filter((x) => x !== g); renderTabs(); saveSession(); } },
      { label: `Закрыть группу (${members.length})`, icon: 'x', fn: () => members.forEach((t) => closeTab(t.id)) },
    ]);
  }

  // ===================================================================== tab previews

  let previewTimer = null;
  let previewAuto = null;
  function hidePreview() { clearTimeout(previewTimer); clearTimeout(previewAuto); $('#tab-preview').hidden = true; }
  function showPreview(el) {
    const t = byId(Number(el.dataset.id));
    if (!t || t.id === activeId || !S.tabPreview || document.body.classList.contains('tabs-compact') && false) return;
    const box = $('#tab-preview');
    const img = box.querySelector('img');
    img.hidden = !t.thumb;
    if (t.thumb) img.src = t.thumb;
    box.querySelector('b').textContent = t.title;
    box.querySelector('small').textContent = (t.priv ? 'Приватная · ' : '') + (t.suspended ? 'Выгружена из памяти · ' : '') + (t.url ? displayUrl(t.url) : 'Стартовая');
    box.hidden = false;
    const r = el.getBoundingClientRect();
    const vertical = document.body.classList.contains('tabs-left') || document.body.classList.contains('tabs-right');
    const bw = box.offsetWidth, bh = box.offsetHeight;
    let x, y;
    if (vertical) { x = document.body.classList.contains('tabs-right') ? r.left - bw - 10 : r.right + 10; y = r.top; }
    else { x = r.left; y = document.body.classList.contains('tabs-bottom') ? r.top - bh - 8 : r.bottom + 8; }
    box.style.left = clamp(x, 8, innerWidth - bw - 8) + 'px';
    box.style.top = clamp(y, 8, innerHeight - bh - 8) + 'px';
    clearTimeout(previewAuto);
    previewAuto = setTimeout(hidePreview, 4000);
  }

  // ===================================================================== VPN: ping, fastest, subscriptions

  const pings = {};

  async function pingAll() {
    const list = S.vpn.profiles.map((p) => ({ id: p.id, host: p.host, port: p.port }));
    if (!list.length) return {};
    Object.assign(pings, await T.vpnPing(list));
    return pings;
  }

  async function pickFastest(report = true) {
    await pingAll();
    const best = S.vpn.profiles.filter((p) => pings[p.id] != null).sort((a, b) => pings[a.id] - pings[b.id])[0];
    if (!best) { if (report) toast('Ни один сервер не ответил', { err: true }); return null; }
    const changed = S.vpn.active !== best.id;
    S.vpn.active = best.id;
    saveSettings();
    if (report) toast(`Самый быстрый: ${best.name} — ${pings[best.id]} мс`);
    if (changed && S.vpn.enabled) { await vpnApply(false); reloadAffected(); }
    return best;
  }

  async function refreshSubs(manual) {
    const subs = [...new Set(S.vpn.profiles.map((p) => p.sub).filter(Boolean))];
    if (!subs.length) { if (manual) toast('Нет серверов из подписок'); return; }
    let changedActive = false, total = 0;
    for (const sub of subs) {
      const r = await T.vpn.parse(sub);
      if (!r.ok) { if (manual) toast(`Подписка не обновилась: ${r.error}`, { err: true }); continue; }
      const old = S.vpn.profiles.filter((p) => p.sub === sub);
      const byLink = new Map(old.map((p) => [p.link, p]));
      const fresh = r.profiles.map((p) => ({ ...p, id: (byLink.get(p.link) || {}).id || uid('p'), sub }));
      const at = S.vpn.profiles.indexOf(old[0]);
      S.vpn.profiles = S.vpn.profiles.filter((p) => p.sub !== sub);
      S.vpn.profiles.splice(at < 0 ? S.vpn.profiles.length : at, 0, ...fresh);
      if (old.some((p) => p.id === S.vpn.active) && !fresh.some((p) => p.id === S.vpn.active)) { S.vpn.active = fresh[0] && fresh[0].id; changedActive = true; }
      total += fresh.length;
    }
    S.vpn.subsAt = Date.now();
    saveSettings();
    if (manual) toast(`Подписки обновлены, серверов: ${total}`);
    if (changedActive && S.vpn.enabled) await vpnApply(false);
    if ($('#settings-dlg').open && setSection === 'vpn') renderSettings();
  }

  const origSetVpn = window.setVpnEnabled;
  window.setVpnEnabled = async function setVpnEnabledFast(on) {
    if (on && S.vpn.autoFastest && S.vpn.profiles.length > 1) await pickFastest(false);
    return origSetVpn(on);
  };

  // ===================================================================== light mode, saved looks, video background

  const LOOK_KEYS = ['theme', 'mode', 'lightFrom', 'lightTo', 'accent', 'accentCustom', 'accent2Custom', 'panel', 'panelCustom', 'panelL', 'panelCustomL', 'panelAlpha', 'textColor',
    'radius', 'motion', 'bg', 'bgL', 'bgImage', 'bgVideo', 'bgColor1', 'bgColor2', 'bgAngle', 'bgDim', 'bgBlur', 'bgAnim', 'bgGrain', 'font', 'fontCustom',
    'uiScale', 'density', 'gap', 'tabsPos', 'tabsCompact', 'tabsWidth', 'tabMax', 'tabClose', 'tabColorMode', 'customCss'];
  const lookNow = () => Object.fromEntries(LOOK_KEYS.map((k) => [k, structuredClone(S[k])]));

  function applyLook(data) {
    for (const k of LOOK_KEYS) if (k in data) S[k] = structuredClone(data[k]);
    applyLayout();
    onSettingChanged('theme');
    renderSettings();
  }

  let lastLight = null;
  function syncBgVideo() {
    const v = $('#bg-video');
    const on = curBg() === 'video' && !!S.bgVideo && !S.perfMode;
    if (!on) {
      if (!v.hidden) { v.pause(); v.hidden = true; v.removeAttribute('src'); v.load(); }
      return;
    }
    if (v.getAttribute('src') !== S.bgVideo) v.src = S.bgVideo;
    v.hidden = false;
    // it only plays while someone can see it: the start page is open and the window is visible
    const visible = !document.hidden && !$('#start').hidden;
    if (visible) v.play().catch(() => {}); else v.pause();
  }

  HOOKS.appearance.push(() => {
    if (curBg() === 'video') document.body.classList.remove('bg-anim');
    syncBgVideo();
    if (S.mode === 'system') T.themeSource('system').then((dark) => { if (dark !== systemDark) { systemDark = dark; applyAppearance(); } });
    const l = isLight();
    if (lastLight !== null && lastLight !== l && $('#settings-dlg').open) renderSettings();
    lastLight = l;
    renderBmBar();
  });
  document.addEventListener('visibilitychange', syncBgVideo);

  // ===================================================================== shortcuts

  const ACTIONS = [
    ['newTab', 'Новая вкладка', ['Ctrl+T'], () => createTab()],
    ['newPrivate', 'Новая приватная вкладка', ['Ctrl+Shift+N'], () => createTab('', { private: true })],
    ['closeTab', 'Закрыть вкладку', ['Ctrl+W'], () => { const t = active(); if (t) closeTab(t.id); }],
    ['reopen', 'Вернуть закрытую вкладку', ['Ctrl+Shift+T'], () => reopenClosed()],
    ['nextTab', 'Следующая вкладка', ['Ctrl+Tab'], () => cycleTab(1)],
    ['prevTab', 'Предыдущая вкладка', ['Ctrl+Shift+Tab'], () => cycleTab(-1)],
    ['address', 'Адресная строка', ['Ctrl+L'], () => { $('#address').focus(); $('#address').select(); }],
    ['reload', 'Обновить', ['Ctrl+R', 'F5'], () => { const t = active(); if (t && t.wv) t.wv.reload(); }],
    ['hardReload', 'Обновить без кэша', ['Ctrl+Shift+R'], () => { const t = active(); if (t && t.wv) t.wv.reloadIgnoringCache(); }],
    ['back', 'Назад', ['Alt+ArrowLeft'], () => { const t = active(); try { if (t && t.wv && t.wv.canGoBack()) t.wv.goBack(); } catch { /* not ready */ } }],
    ['forward', 'Вперёд', ['Alt+ArrowRight'], () => { const t = active(); try { if (t && t.wv && t.wv.canGoForward()) t.wv.goForward(); } catch { /* not ready */ } }],
    ['find', 'Поиск на странице', ['Ctrl+F'], () => showFind()],
    ['notes', 'Заметки', ['Ctrl+N'], () => openNotes()],
    ['bookmark', 'Добавить в закладки', ['Ctrl+D'], () => toggleBookmark()],
    ['bookmarks', 'Все закладки', ['Ctrl+Shift+O'], () => openBookmarks()],
    ['history', 'История', ['Ctrl+H'], () => openHistory()],
    ['downloads', 'Загрузки', ['Ctrl+J'], () => openDownloads()],
    ['zoomIn', 'Крупнее', ['Ctrl+=', 'Ctrl+Shift+=', 'Ctrl++'], () => zoom(1)],
    ['zoomOut', 'Мельче', ['Ctrl+-'], () => zoom(-1)],
    ['zoomReset', 'Масштаб 100%', ['Ctrl+0'], () => zoom(0)],
    ['reader', 'Режим чтения', ['Alt+R'], () => ($('#reader').hidden ? openReader() : closeReader())],
    ['split', 'Разделить экран', ['Ctrl+Shift+S'], () => (split ? closeSplit() : splitWithNext())],
    ['pip', 'Картинка в картинке', ['Alt+P'], () => pip()],
    ['screenshot', 'Скриншот страницы', ['Alt+S'], () => screenshot(true)],
    ['translate', 'Перевести страницу', ['Alt+T'], () => translatePage()],
    ['siteDark', 'Тёмный режим для сайта', ['Alt+D'], () => toggleSiteDark()],
    ['workspace', 'Следующее пространство', ['Ctrl+Shift+E'], () => { const i = S.workspaces.findIndex((w) => w.id === S.activeWs); switchWs(S.workspaces[(i + 1) % S.workspaces.length].id); }],
    ['vpn', 'Включить / выключить VPN', ['Ctrl+Shift+V'], () => setVpnEnabled(!S.vpn.enabled)],
    ['fullscreen', 'Во весь экран', ['F11'], () => T.win.fullscreen()],
    ['devtools', 'Инструменты разработчика', ['F12'], () => { const t = active(); if (t && t.wv) (t.wv.isDevToolsOpened() ? t.wv.closeDevTools() : t.wv.openDevTools()); }],
    ['settings', 'Настройки', ['Ctrl+,'], () => openSettings()],
    ['menu', 'Меню браузера', ['Alt+F'], () => mainMenu()],
  ];
  const keysOf = (id) => (S.keys && Array.isArray(S.keys[id]) ? S.keys[id] : ACTIONS.find((a) => a[0] === id)[2]);
  let keyMap = new Map();
  function rebuildKeys() {
    keyMap = new Map();
    for (const a of ACTIONS) for (const k of keysOf(a[0])) keyMap.set(k, a);
    T.setKeys([...keyMap.keys(), ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `Ctrl+${n}`)]);
  }

  let capturing = null;
  window.shortcut = function shortcutCustom(k) {
    if (capturing) return false;
    const m = k.match(/^Ctrl\+(\d)$/);
    if (m) {
      const list = visibleTabs();
      const n = Number(m[1]);
      const target = n === 9 ? list[list.length - 1] : list[n - 1];
      if (target) activate(target.id);
      return true;
    }
    if (k === 'Escape') {
      if (!$('#suggest').hidden) { $('#suggest').hidden = true; return true; }
      if (!$('#menu').hidden || !$('#popover').hidden) { closeFloating(); return true; }
      if (!$('#findbar').hidden) { hideFind(); return true; }
      if (!$('#reader').hidden) { closeReader(); return true; }
      return false;
    }
    const a = keyMap.get(k);
    if (!a) return false;
    a[3]();
    return true;
  };

  // ===================================================================== main menu

  function mainMenu() {
    const t = active();
    const page = !!(t && t.wv && /^https?:/.test(t.url || ''));
    const host = t && t.url ? hostOf(t.url) : '';
    const k = (id) => { const ks = keysOf(id); return ks.length ? '   ' + ks[0] : ''; };
    anchorMenu($('#btn-menu'), [
      { label: 'Новая вкладка' + k('newTab'), icon: 'plus', fn: () => createTab() },
      { label: 'Новая приватная вкладка' + k('newPrivate'), icon: 'mask', fn: () => createTab('', { private: true }) },
      { label: 'Новое пространство…', icon: 'layers', fn: newWorkspace },
      '-',
      { label: 'История' + k('history'), icon: 'history', fn: openHistory },
      { label: 'Закладки' + k('bookmarks'), icon: 'bookmark', fn: () => openBookmarks() },
      { label: 'Загрузки' + k('downloads'), icon: 'download', fn: openDownloads },
      '-',
      { label: split ? 'Закрыть разделение' : 'Разделить экран' + k('split'), icon: 'split', fn: () => (split ? closeSplit() : splitWithNext()) },
      { label: 'Режим чтения' + k('reader'), icon: 'book', fn: openReader, disabled: !page },
      { label: 'Перевести страницу' + k('translate'), icon: 'translate', fn: translatePage, disabled: !page },
      { label: 'Картинка в картинке' + k('pip'), icon: 'pip', fn: pip, disabled: !page },
      { label: 'Скриншот видимой части', icon: 'camera', fn: () => screenshot(false), disabled: !page },
      { label: 'Скриншот всей страницы' + k('screenshot'), icon: 'camera', fn: () => screenshot(true), disabled: !page },
      { label: 'Скопировать скриншот', icon: 'camera', fn: () => screenshot(false, true), disabled: !page },
      { label: (t && t.darkKey ? 'Выключить' : 'Включить') + ' тёмный режим сайта' + k('siteDark'), icon: 'moon', fn: toggleSiteDark, disabled: !page },
      { label: host && siteAllowed(host) ? 'Блокировать рекламу здесь' : 'Не блокировать рекламу здесь', icon: 'block', disabled: !page || !S.adblock.enabled, fn: () => { S.adblock.allow = siteAllowed(host) ? S.adblock.allow.filter((d) => d !== host) : [...S.adblock.allow, host]; saveSettings(); pushAdblock().then(() => t.wv.reload()); } },
      '-',
      { label: isLight() ? 'Тёмная тема' : 'Светлая тема', icon: isLight() ? 'moon' : 'sun', fn: () => { S.mode = isLight() ? 'dark' : 'light'; onSettingChanged('mode'); } },
      { label: 'Настройки' + k('settings'), icon: 'gear', fn: () => openSettings() },
    ]);
  }

  // ===================================================================== tab menu with groups, split, workspaces

  window.tabMenu = function tabMenuFull(t, x, y) {
    const host = t.url ? hostOf(t.url) : '';
    const others = S.workspaces.filter((w) => w.id !== wsOf(t));
    showMenu(x, y, [
      { label: 'Новая вкладка рядом', icon: 'plus', fn: () => { const n = createTab(''); moveTab(n.id, tabs.indexOf(t) + 1); } },
      { label: 'Обновить', icon: 'reload', fn: () => t.wv && t.wv.reload(), disabled: !t.wv },
      { label: 'Дублировать', icon: 'tabs', fn: () => createTab(t.url, { index: tabs.indexOf(t) + 1, private: t.priv }), disabled: !t.url },
      { label: t.pinned ? 'Открепить' : 'Закрепить', icon: 'pin', fn: () => togglePin(t) },
      { label: t.id === activeId ? 'Разделить экран' : 'Открыть рядом с текущей', icon: 'split', disabled: !t.url, fn: () => (t.id === activeId ? splitWithNext() : openSplit(t.id)) },
      '-',
      { label: 'В новую группу…', icon: 'folder', fn: () => newGroup(t) },
      ...groups.filter((g) => g.id !== t.group).slice(0, 6).map((g) => ({ label: `В группу «${g.name || 'без названия'}»`, fn: () => addToGroup(t, g.id) })),
      ...(t.group ? [{ label: 'Убрать из группы', fn: () => { t.group = null; if (!tabs.some((x) => x.group && x.group === t.group)) groups = groups.filter((g) => tabs.some((x) => x.group === g.id)); renderTabs(); saveSession(); } }] : []),
      ...others.slice(0, 5).map((w) => ({ label: `В пространство «${w.name}»`, icon: 'layers', fn: () => { t.ws = w.id; if (t.id === activeId) { const rest = visibleTabs().filter((x) => x !== t); if (rest.length) activate(rest[0].id); else createTab(); } renderTabs(); saveSession(); } })),
      { header: 'Цвет вкладки' },
      { colors: [null, ...COLORS], value: t.color, pick: (c) => { t.color = c; updateTab(t); saveSession(); } },
      '-',
      { label: 'Заметка к этой странице', icon: 'note', fn: () => { activate(t.id); openNotes(true); newNote({ url: t.url, title: t.title }); }, disabled: !t.url },
      { label: host && siteViaVpn(host) ? 'Открывать напрямую' : 'Открывать через VPN', icon: 'shield', fn: () => toggleSiteVpn(host), disabled: !host },
      { label: 'Выгрузить из памяти', icon: 'zap', fn: () => suspendTab(t), disabled: !t.wv || t.id === activeId },
      '-',
      { label: 'Закрыть', icon: 'x', fn: () => closeTab(t.id) },
      { label: 'Закрыть другие', fn: () => visibleTabs().filter((x) => x !== t && !x.pinned).forEach((x) => closeTab(x.id)), disabled: visibleTabs().length < 2 },
      { label: 'Закрыть вкладки после этой', fn: () => { const l = visibleTabs(); l.slice(l.indexOf(t) + 1).filter((x) => !x.pinned).forEach((x) => closeTab(x.id)); } },
    ]);
  };

  // tabs shown next to each other are never unloaded
  const origSuspend = window.suspendTab;
  window.suspendTab = function suspendTabSafe(t) {
    if (split && t && (t.id === split.a || t.id === split.b)) return false;
    if (t && t.reader) t.reader = null;
    return origSuspend(t);
  };

  // ===================================================================== settings: extra rows and sections

  SECTIONS.splice(SECTIONS.findIndex((x) => x[0] === 'vpn') + 1, 0, ['privacy', 'lockkey', 'Приватность и реклама']);
  SECTIONS.splice(SECTIONS.findIndex((x) => x[0] === 'about'), 0, ['keys', 'keyboard', 'Горячие клавиши']);

  const origLook = SETTINGS_PANELS.look;
  SETTINGS_PANELS.look = () => {
    const presets = S.presets.length
      ? `<div class="chips">${S.presets.map((p) => `<span class="chip preset" data-preset="${p.id}">${esc(p.name)}<i data-preset-del="${p.id}" title="Удалить">×</i></span>`).join('')}</div>` : '';
    const block = `
      ${row('Режим', isLight() ? 'Сейчас светлый. У светлого режима свои цвета панелей и фон' : 'Сейчас тёмный', seg('mode', [['dark', 'Тёмный'], ['light', 'Светлый'], ['system', 'Как в системе'], ['time', 'По времени']]), 'col')}
      ${S.mode === 'time' ? row('Светлый режим', 'С какого и до какого времени', `<input type="time" class="text-input" data-key="lightFrom" value="${S.lightFrom}"> — <input type="time" class="text-input" data-key="lightTo" value="${S.lightTo}">`) : ''}
      <div class="set-row col"><div class="txt"><div>Мои темы</div><small>Сохраните текущее оформление целиком — цвета, фон, шрифт, вкладки — и возвращайтесь к нему в один клик. Темой можно поделиться файлом</small></div>
        ${presets}<div class="pop-actions"><button class="btn small" id="preset-save">${icon('plus')}Сохранить текущую…</button><button class="btn small ghost" id="preset-export">Экспорт…</button><button class="btn small ghost" id="preset-import">Импорт…</button></div></div>`;
    const html = origLook();
    const at = html.indexOf('</h3>') + 5;
    return html.slice(0, at) + block + html.slice(at);
  };
  const origUi = SETTINGS_PANELS.ui;
  SETTINGS_PANELS.ui = () => origUi().replace('<h4>Свой CSS</h4>', `${row('Панель закладок', bookmarks.length ? `Закладок: ${bookmarks.length}` : 'Появится, когда добавите первую закладку', seg('bmBar', [['always', 'Всегда'], ['start', 'На стартовой'], ['never', 'Скрыть']]))}
      ${row('Пространства', 'Кнопка переключения наборов вкладок слева от вкладок', sw('showWs'))}
      <h4>Свой CSS</h4>`);
  const origTabs = SETTINGS_PANELS.tabs;
  SETTINGS_PANELS.tabs = () => origTabs() + `
      ${row('Превью при наведении', 'Картинка страницы, когда держите курсор над вкладкой', sw('tabPreview'))}
      <h4>Группы и пространства</h4>
      <div class="set-row col"><div class="note-box">Вкладки можно объединять в группы — правая кнопка по вкладке → «В новую группу». Группу можно свернуть щелчком по её названию.<br>Пространства — отдельные наборы вкладок, например «Работа» и «Отдых»: кнопка слева от вкладок или ${keysOf('workspace')[0] ? `<kbd>${esc(keysOf('workspace')[0])}</kbd>` : 'меню'}.</div></div>`;
  const origStart = SETTINGS_PANELS.start;
  SETTINGS_PANELS.start = () => origStart() + `
      <h4>Перевод</h4>
      ${row('Переводить на', '', seg('translateTo', [['ru', 'Русский'], ['en', 'Английский'], ['uk', 'Украинский'], ['de', 'Немецкий']]))}
      ${row('Переводчик для выделенного текста', 'Страница целиком переводится через Google', seg('translator', [['google', 'Google'], ['yandex', 'Яндекс']]))}`;
  const origVpn = SETTINGS_PANELS.vpn;
  SETTINGS_PANELS.vpn = () => {
    const hasSubs = S.vpn.profiles.some((p) => p.sub);
    const extra = `${S.vpn.profiles.length ? row('Скорость серверов', 'Проверяет, сколько миллисекунд отвечает каждый сервер', '<button class="btn small" id="vpn-ping">Проверить</button><button class="btn small" id="vpn-fastest">Выбрать самый быстрый</button>') : ''}
      ${S.vpn.profiles.length > 1 ? row('Подключаться к самому быстрому', 'При включении VPN выбирается сервер с наименьшим пингом', sw('vpn.autoFastest')) : ''}
      ${hasSubs ? row('Обновлять подписки', S.vpn.subsAt ? `Последний раз: ${ago(S.vpn.subsAt)}` : 'Ещё не обновлялись', `${seg('vpn.subEvery', [[0, 'Вручную'], [6, 'Каждые 6 ч'], [24, 'Раз в день']])}<button class="btn small" id="vpn-subs">Обновить</button>`, 'col') : ''}
      <h4>Ядро Xray</h4>`;
    return origVpn().replace('<h4>Ядро Xray</h4>', extra);
  };
  SETTINGS_PANELS.privacy = () => {
    const upd = adblockStatus.updatedAt ? new Date(adblockStatus.updatedAt).toLocaleDateString('ru-RU') : '';
    return `<h3>Приватность и реклама</h3>
      ${row('Блокировать рекламу и трекеры', adblockStatus.full ? `Списки EasyList, EasyPrivacy и русский AdGuard${upd ? ', обновлены ' + upd : ''}. За сеанс заблокировано: ${adblockStatus.total}` : 'Списки загружаются… пока работает встроенный короткий список', sw('adblock.enabled'))}
      ${row('Обновить списки фильтров', 'Обновляются сами раз в неделю', '<button class="btn small" id="ab-update">Обновить</button>')}
      <div class="set-row col"><div class="txt"><div>Не блокировать на сайтах</div><small>По одному в строке. Быстрее — щит в адресной строке</small></div><textarea class="text-input mono" id="ab-allow" rows="3" placeholder="example.com">${esc(S.adblock.allow.join('\n'))}</textarea></div>
      <h4>Тёмный режим для сайтов</h4>
      ${row('Затемнять светлые сайты', 'Страницы, у которых нет своей тёмной темы, перекрашиваются. Для отдельного сайта — меню ⋯ или Alt+D', sw('siteDark'))}
      ${Object.keys(S.siteDarkSites).length ? row('Свои настройки для сайтов', Object.entries(S.siteDarkSites).map(([h, on]) => `${esc(h)} — ${on ? 'тёмный' : 'как есть'}`).join(', '), '<button class="btn small ghost" id="dark-reset">Сбросить</button>') : ''}
      <h4>Защищённый DNS</h4>
      ${row('DNS через HTTPS', 'Провайдер не видит, какие сайты вы открываете. AdGuard ещё и режет рекламу. С включённым VPN адреса и так узнаются через сервер', seg('dns', [['off', 'Выкл'], ['cloudflare', 'Cloudflare'], ['google', 'Google'], ['adguard', 'AdGuard'], ['quad9', 'Quad9'], ['custom', 'Свой']]), 'col')}
      ${S.dns === 'custom' ? `<div class="set-row col"><input class="text-input mono" data-key="dnsCustom" value="${esc(S.dnsCustom)}" placeholder="https://dns.example.com/dns-query"></div>` : ''}
      <h4>История</h4>
      ${row('Сохранять историю', `Записей: ${history.length}. В приватных вкладках история не сохраняется никогда`, sw('saveHistory'))}
      ${row('Открыть историю', '', `<button class="btn small" id="hist-open">История</button><button class="btn small danger" id="hist-clear">Очистить</button>`)}
      <h4>Приватные вкладки</h4>
      <div class="set-row col"><div class="note-box">Приватная вкладка не сохраняет историю, cookies и данные сайтов — всё стирается, когда закрывается последняя приватная вкладка. VPN и блокировка рекламы в ней работают как обычно. Открыть: меню ⋯ или ${keysOf('newPrivate')[0] ? `<kbd>${esc(keysOf('newPrivate')[0])}</kbd>` : 'меню'}.</div></div>`;
  };
  SETTINGS_PANELS.keys = () => `<h3>Горячие клавиши</h3>
      <div class="set-row col"><small style="color:var(--muted)">Нажмите на сочетание, чтобы назначить другое. Esc — отмена, Backspace — убрать. <kbd>Ctrl</kbd> + <kbd>1</kbd>…<kbd>9</kbd> переключают вкладки и не меняются.</small></div>
      ${ACTIONS.map(([id, name]) => row(esc(name), '', `<button class="btn small key-btn" data-key-action="${id}">${keysOf(id).length ? keysOf(id).map((k) => `<kbd>${esc(k)}</kbd>`).join(' ') : '<span class="muted">—</span>'}</button>`)).join('')}
      <div class="actions"><button class="btn small ghost" id="keys-reset">Вернуть все по умолчанию</button></div>`;
  const origAbout = SETTINGS_PANELS.about;
  SETTINGS_PANELS.about = () => origAbout().replace('<table class="keys">', `<div class="about-update"><span id="about-version"></span><button class="btn small" id="upd-check">Проверить обновления</button><span id="upd-status"></span></div><table class="keys">`);

  HOOKS.settings.push((p) => {
    // saved looks
    const ps = $('#preset-save', p);
    if (ps) ps.onclick = async () => {
      const r = await ask('Сохранить тему', [{ key: 'name', label: 'Название', placeholder: 'Например, «Ночная»' }], 'Сохранить');
      if (!r || !r.name) return;
      S.presets.push({ id: uid('t'), name: r.name.slice(0, 30), data: lookNow() });
      saveSettings();
      renderSettings();
    };
    for (const c of $$('[data-preset]', p)) c.onclick = (e) => {
      if (e.target.closest('[data-preset-del]')) { S.presets = S.presets.filter((x) => x.id !== c.dataset.preset); saveSettings(); renderSettings(); return; }
      const pr = S.presets.find((x) => x.id === c.dataset.preset);
      if (pr) { applyLook(pr.data); toast(`Тема «${pr.name}» применена`); }
    };
    const pe = $('#preset-export', p);
    if (pe) pe.onclick = async () => { if (await T.saveJson('Тема Tako.json', { tako: 'theme', name: 'Моя тема', data: lookNow() })) toast('Тема сохранена в файл'); };
    const pi = $('#preset-import', p);
    if (pi) pi.onclick = async () => {
      const d = await T.openJson();
      if (!d) return;
      if (d.tako !== 'theme' || !d.data) { toast('Это не файл темы Tako', { err: true }); return; }
      S.presets.push({ id: uid('t'), name: (d.name || 'Тема').slice(0, 30), data: d.data });
      applyLook(d.data);
      saveSettings();
      toast('Тема загружена и применена');
    };
    const uv = $('#bg-upload-video', p);
    if (uv) uv.onclick = async () => { const url = await T.pickBackground('video'); if (url) { S.bgVideo = url; setBg('video'); onSettingChanged('bg'); renderSettings(); } };

    // VPN extras
    for (const it of $$('[data-profile]', p)) {
      const ms = pings[it.dataset.profile];
      if (ms === undefined) continue;
      const small = it.querySelector('.name small');
      small.insertAdjacentHTML('beforeend', ` · <b class="ping ${ms == null ? 'bad' : ms < 150 ? 'good' : ms < 400 ? 'mid' : 'bad'}">${ms == null ? 'не отвечает' : ms + ' мс'}</b>`);
    }
    const vp = $('#vpn-ping', p);
    if (vp) vp.onclick = async () => { vp.disabled = true; vp.textContent = 'Проверяю…'; await pingAll(); renderSettings(); };
    const vf = $('#vpn-fastest', p);
    if (vf) vf.onclick = async () => { vf.disabled = true; await pickFastest(true); renderSettings(); };
    const vs = $('#vpn-subs', p);
    if (vs) vs.onclick = async () => { vs.disabled = true; vs.textContent = 'Обновляю…'; await refreshSubs(true); };

    // privacy
    const au = $('#ab-update', p);
    if (au) au.onclick = async () => {
      au.disabled = true; au.textContent = 'Загружаю…';
      const r = await T.adblock.update();
      Object.assign(adblockStatus, r);
      toast(r.ok ? 'Списки фильтров обновлены' : 'Не удалось обновить: ' + (r.error || ''), { err: !r.ok });
      renderSettings();
    };
    const aa = $('#ab-allow', p);
    if (aa) aa.oninput = debounce(() => {
      S.adblock.allow = aa.value.split(/[\s,]+/).map((d) => d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')).filter(Boolean);
      saveSettings();
      pushAdblock();
    }, 600);
    const dr = $('#dark-reset', p);
    if (dr) dr.onclick = () => { S.siteDarkSites = {}; saveSettings(); renderSettings(); for (const t of tabs) applySiteDark(t); };
    const ho = $('#hist-open', p);
    if (ho) ho.onclick = () => { $('#settings-dlg').close(); openHistory(); };
    const hc = $('#hist-clear', p);
    if (hc) hc.onclick = () => { if (confirm('Очистить всю историю?')) { clearHistory(0); renderSettings(); } };

    // shortcuts
    for (const b of $$('[data-key-action]', p)) b.onclick = () => {
      if (capturing) return;
      capturing = b.dataset.keyAction;
      b.classList.add('capturing');
      b.textContent = 'Нажмите сочетание…';
      const onKey = (e) => {
        if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        document.removeEventListener('keydown', onKey, true);
        const id = capturing;
        capturing = null;
        if (e.key === 'Escape') { renderSettings(); return; }
        S.keys = S.keys || {};
        if (e.key === 'Backspace' || e.key === 'Delete') S.keys[id] = [];
        else {
          const k = keyString(e);
          if (/^Ctrl\+\d$/.test(k)) { toast('Ctrl + цифра занято переключением вкладок', { err: true }); renderSettings(); return; }
          const taken = ACTIONS.find((a) => a[0] !== id && keysOf(a[0]).includes(k));
          if (taken) { S.keys[taken[0]] = keysOf(taken[0]).filter((x) => x !== k); toast(`${k} снято с «${taken[1]}»`); }
          S.keys[id] = [k];
        }
        rebuildKeys();
        saveSettings();
        renderSettings();
      };
      document.addEventListener('keydown', onKey, true);
    };
    const kr = $('#keys-reset', p);
    if (kr) kr.onclick = () => { S.keys = {}; rebuildKeys(); saveSettings(); renderSettings(); };

    // about: updates
    const av = $('#about-version', p);
    if (av) {
      T.version().then((v) => { av.textContent = 'Версия ' + v; });
      $('#upd-status', p).textContent = updState;
      $('#upd-check', p).onclick = async () => {
        $('#upd-status', p).textContent = 'Проверяю…';
        const r = await T.updates.check();
        if (!r.ok) $('#upd-status', p).textContent = r.error;
      };
    }
  });

  HOOKS.change.push((key) => {
    if (key === 'adblock.enabled') pushAdblock().then(() => { const t = active(); if (t && t.wv) t.wv.reload(); });
    if (key === 'dns' || key === 'dnsCustom') {
      if (S.dns === 'custom' && !/^https:\/\//.test(S.dnsCustom)) return;
      T.setDns(S.dns, S.dnsCustom).then((r) => { if (!r.ok) toast('DNS: ' + r.error, { err: true }); });
    }
    if (key === 'siteDark') for (const t of tabs) applySiteDark(t);
    if (key === 'bmBar' || key === 'showWs') { renderBmBar(); renderWs(); }
    if (key === 'mode') { lastLight = null; }
    if (key === 'readerTheme' || key === 'readerSize') { const t = active(); if (t && t.reader && !$('#reader').hidden) showReader(t); }
  });

  // ===================================================================== updates

  let updState = '';
  T.onUpdate((u) => {
    if (u.state === 'available') updState = `Скачиваю версию ${u.version}…`;
    if (u.state === 'progress') updState = `Загрузка обновления: ${u.percent}%`;
    if (u.state === 'none') updState = 'У вас последняя версия';
    if (u.state === 'error') updState = 'Не удалось проверить: ' + u.error;
    if (u.state === 'ready') {
      updState = `Версия ${u.version} готова`;
      toast(`Обновление ${u.version} скачано`, { action: { label: 'Перезапустить', fn: () => T.updates.install() }, ms: 15000 });
    }
    const st = $('#upd-status');
    if (st) st.textContent = updState;
  });

  // ===================================================================== hooks into the core

  HOOKS.navigate.push((tab, titleOnly) => {
    if (titleOnly) return;
    tab.darkKey = null;
    tab.reader = null;
    tab.readable = false;
    if (tab.id === activeId) { closeReader(); $('#omni-reader').hidden = true; }
  });
  HOOKS.ready.push((tab) => { applySiteDark(tab); checkReadable(tab); });
  HOOKS.shown.push((tab) => {
    layoutSplit();
    syncBgVideo();
    renderBmBar();
    if (!$('#reader').hidden && !(tab.reader && tab.id === activeId)) closeReader();
    $('#omni-reader').hidden = !tab.readable;
  });
  HOOKS.closed.push((tab) => {
    if (tab.priv && !tabs.some((t) => t.priv)) T.clearPrivate();
  });
  HOOKS.tabs.push(() => {
    for (const t of tabs) {
      const el = tabEls.get(t.id);
      if (el) el.classList.toggle('private', !!t.priv);
    }
    renderWs();
  });
  HOOKS.toolbar.push((t) => {
    const url = t && t.url;
    const page = !!(t && t.wv && /^https?:/.test(url || ''));
    const star = $('#omni-star');
    star.hidden = !page;
    const marked = !!(url && bmFor(url));
    star.classList.toggle('on', marked);
    star.innerHTML = icon(marked ? 'star-on' : 'star');
    const blk = $('#omni-block');
    const host = url ? hostOf(url) : '';
    blk.hidden = !page || !S.adblock.enabled;
    blk.classList.toggle('off', !!host && siteAllowed(host));
    $('#omni-block-n').textContent = t && t.blocked ? (t.blocked > 99 ? '99+' : t.blocked) : '';
  });

  HOOKS.init.push(async () => {
    if (!S.workspaces || !S.workspaces.length) S.workspaces = structuredClone(DEFAULTS.workspaces);
    if (!S.workspaces.some((w) => w.id === S.activeWs)) S.activeWs = S.workspaces[0].id;
    rebuildKeys();
    renderWs();
    history = await T.store.get('history', []);
    if (!Array.isArray(history)) history = [];
    bookmarks = await T.store.get('bookmarks', []);
    if (!Array.isArray(bookmarks)) bookmarks = [];
    for (const d of (await T.store.get('downloads', [])) || []) dls.set(d.id, d);
    updateDlButton();
    renderWs();
    renderBmBar();
    T.adblock.status().then((st) => Object.assign(adblockStatus, st));
    // subscriptions refresh themselves; the light/dark schedule is checked every minute
    setInterval(() => {
      if (S.mode === 'time' && isLight() !== lastLight) applyAppearance();
      if (S.vpn.subEvery && Date.now() - (S.vpn.subsAt || 0) > S.vpn.subEvery * 3600000) refreshSubs(false);
    }, 60000);
    if (S.vpn.subEvery && Date.now() - (S.vpn.subsAt || 0) > S.vpn.subEvery * 3600000) setTimeout(() => refreshSubs(false), 15000);
  });

  // ===================================================================== wiring

  HOOKS.wire.push(() => {
    // address bar suggestions
    const addr = $('#address');
    const sug = $('#suggest');
    addr.addEventListener('input', () => {
      const q = addr.value.trim();
      sugItems = q ? buildSuggestions(q) : [];
      sugSel = -1;
      renderSuggest();
    });
    addr.addEventListener('keydown', (e) => {
      if (sug.hidden || !sugItems.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        sugSel = (sugSel + (e.key === 'ArrowDown' ? 1 : -1) + sugItems.length + 1) % (sugItems.length + 1);
        if (sugSel === sugItems.length) sugSel = -1;
        renderSuggest();
      } else if (e.key === 'Enter' && sugSel >= 0) {
        e.preventDefault();
        chooseSuggestion(sugItems[sugSel]);
      } else if (e.key === 'Escape') { sug.hidden = true; }
    }, true);
    addr.addEventListener('blur', () => setTimeout(() => { sug.hidden = true; }, 120));
    $('#omnibox').addEventListener('submit', () => { sug.hidden = true; });
    sug.addEventListener('mousedown', (e) => {
      const r = e.target.closest('.sug');
      if (!r) return;
      e.preventDefault();
      chooseSuggestion(sugItems[Number(r.dataset.i)]);
    });

    // toolbar
    $('#omni-star').onclick = toggleBookmark;
    $('#omni-block').onclick = (e) => { e.stopPropagation(); adblockPopover(); };
    $('#omni-reader').onclick = openReader;
    $('#btn-downloads').onclick = (e) => { e.stopPropagation(); if ($('#popover').dataset.kind === 'downloads' && !$('#popover').hidden) closeFloating(); else openDownloads(); };
    $('#btn-menu').onclick = (e) => { e.stopPropagation(); if (!$('#menu').hidden) closeFloating(); else mainMenu(); };
    document.addEventListener('mousedown', (e) => {
      if (!e.target.closest('#popover, #btn-downloads, #omni-block')) $('#popover').dataset.kind = '';
    }, true);

    // bookmarks bar
    const bar = $('#bmbar');
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('.bm');
      if (!b) return;
      if (b.id === 'bm-all') { openBookmarks(); return; }
      if (b.dataset.folder) { e.stopPropagation(); folderMenu(b, b.dataset.folder); return; }
      const bm = bookmarks.find((x) => x.id === b.dataset.id);
      if (bm) openBookmark(bm.url, e);
    });
    bar.addEventListener('auxclick', (e) => { const b = e.target.closest('.bm[data-id]'); if (b && e.button === 1) { const bm = bookmarks.find((x) => x.id === b.dataset.id); if (bm) createTab(bm.url, { background: true }); } });
    bar.addEventListener('contextmenu', (e) => { const b = e.target.closest('.bm[data-id]'); if (!b) return; e.preventDefault(); const bm = bookmarks.find((x) => x.id === b.dataset.id); if (bm) bookmarkMenu(bm, e.clientX, e.clientY); });

    // bookmarks and history dialogs
    $('#bm-search').oninput = renderBmList;
    $('#bm-list').addEventListener('click', (e) => {
      const ed = e.target.closest('[data-edit]');
      const del = e.target.closest('[data-del]');
      if (ed) { editBookmark(bookmarks.find((b) => b.id === ed.dataset.edit)); return; }
      if (del) { bookmarks = bookmarks.filter((b) => b.id !== del.dataset.del); saveBookmarks(); renderBmList(); renderBmBar(); updateToolbar(); return; }
      const r = e.target.closest('.list-row');
      if (r) { const b = bookmarks.find((x) => x.id === r.dataset.id); $('#bm-dlg').close(); openBookmark(b.url, e); }
    });
    for (const b of $$('[data-import]')) b.onclick = () => importBookmarks(b.dataset.import);
    $('#history-search').oninput = renderHistory;
    $('#history-list').addEventListener('click', (e) => {
      const del = e.target.closest('[data-del]');
      if (del) { history = history.filter((h) => h.url !== del.dataset.del); saveHistory(); renderHistory(); return; }
      const r = e.target.closest('.list-row');
      if (r) { $('#history-dlg').close(); openBookmark(r.dataset.url, e); }
    });
    $('#history-clear-hour').onclick = () => clearHistory(Date.now() - 3600000);
    $('#history-clear-day').onclick = () => { const d = new Date(); d.setHours(0, 0, 0, 0); clearHistory(d.getTime()); };
    $('#history-clear-all').onclick = () => { if (confirm('Очистить всю историю?')) clearHistory(0); };
    for (const b of $$('#ask-dlg .close-dlg, #history-dlg .close-dlg, #bm-dlg .close-dlg')) b.onclick = () => b.closest('dialog').close();

    // tab strip: groups, workspaces, previews
    const box = $('#tabs');
    box.addEventListener('click', (e) => {
      const g = e.target.closest('.tab-group');
      if (!g) return;
      const grp = groups.find((x) => x.id === g.dataset.group);
      if (grp) { grp.collapsed = !grp.collapsed; if (grp.collapsed && tabs.some((t) => t.id === activeId && t.group === grp.id)) { const out = visibleTabs().find((t) => t.group !== grp.id); if (out) activate(out.id); } renderTabs(); saveSession(); }
    });
    box.addEventListener('contextmenu', (e) => {
      const g = e.target.closest('.tab-group');
      if (!g) return;
      e.preventDefault();
      const grp = groups.find((x) => x.id === g.dataset.group);
      if (grp) groupMenu(grp, e.clientX, e.clientY);
    });
    box.addEventListener('mouseover', (e) => {
      const el = e.target.closest('.tab');
      if (!el) return;
      clearTimeout(previewTimer);
      if ($('#tab-preview').hidden) previewTimer = setTimeout(() => showPreview(el), 550);
      else showPreview(el);
    });
    box.addEventListener('mouseleave', hidePreview);
    // the pointer can jump straight onto a page, which the strip never hears about
    document.addEventListener('mouseover', (e) => { if (!e.target.closest('#tabs')) hidePreview(); });
    window.addEventListener('blur', hidePreview);
    box.addEventListener('mousedown', hidePreview, true);
    $('#ws-btn').onclick = (e) => { e.stopPropagation(); wsMenu(); };

    // split view divider
    const div = $('#split-divider');
    div.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      e.preventDefault();
      const rect = $('#content').getBoundingClientRect();
      document.body.classList.add('dragging-split');
      const move = (ev) => { S.splitRatio = clamp((ev.clientX - rect.left) / rect.width, 0.2, 0.8); layoutSplit(); };
      const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); document.body.classList.remove('dragging-split'); saveSettings(); };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
    $('#split-close').onclick = closeSplit;

    // reader
    $('#reader-close').onclick = closeReader;
    $('#reader-smaller').onclick = () => { S.readerSize = Math.max(14, S.readerSize - 1); saveSettings(); showReader(active()); };
    $('#reader-bigger').onclick = () => { S.readerSize = Math.min(28, S.readerSize + 1); saveSettings(); showReader(active()); };
    $('#reader-theme').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; S.readerTheme = b.dataset.v; saveSettings(); showReader(active()); };

    // from the main process
    T.onDownload(onDownload);
    T.onAdblockCount(({ wcId, n }) => {
      const t = tabs.find((x) => x.wcId === wcId);
      if (!t) return;
      t.blocked = n;
      if (t.id === activeId) $('#omni-block-n').textContent = n ? (n > 99 ? '99+' : n) : '';
    });
    T.onAdblockReady((st) => Object.assign(adblockStatus, st));
    T.onSystemTheme((dark) => { systemDark = dark; if (S.mode === 'system') applyAppearance(); });
    T.onCtx((c) => {
      if (c.type === 'pip') pip();
      if (c.type === 'reader') openReader();
      if (c.type === 'translate') translatePage();
      if (c.type === 'translate-text') translateText(c.text);
      if (c.type === 'screenshot') screenshot(!!c.full);
      if (c.type === 'bookmark') toggleBookmark();
      if (c.type === 'split') { const n = createTab(c.url, { background: true }); openSplit(n.id); }
    });
  });
})();
