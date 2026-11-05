'use strict';
// Search results drawn in the browser's own style.
// tako://search/?q=… is served by the main process: results come from DuckDuckGo's
// plain-HTML version (no key, no scripts), fetched through the browser session so the
// VPN applies, and are rendered as a static page with the current theme colours.

const fs = require('fs');
const path = require('path');

const DDG = 'https://html.duckduckgo.com/html/';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#x27': "'", '#x2F': '/', hellip: '…', mdash: '—', ndash: '–', laquo: '«', raquo: '»' };
function decode(s) {
  return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e] ?? ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Page HTML fragment -> plain text with the search-term highlights kept as \u0001…\u0002 */
function text(html) {
  return decode(String(html || '')
    .replace(/<b>/gi, '\u0001').replace(/<\/b>/gi, '\u0002')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')).trim();
}
/** …and back to safe HTML */
const marked = (t) => esc(t).replace(/\u0001/g, '<mark>').replace(/\u0002/g, '</mark>');

function realUrl(href) {
  let h = decode(href || '');
  if (h.startsWith('//')) h = 'https:' + h;
  try {
    const u = new URL(h, 'https://duckduckgo.com');
    if (/duckduckgo\.com$/.test(u.hostname) && u.pathname === '/l/' && u.searchParams.get('uddg')) return u.searchParams.get('uddg');
    return u.href;
  } catch { return ''; }
}

/** Pulls results and the "next page" form out of DuckDuckGo's HTML page */
function parse(html) {
  if (/anomaly-modal|challenge-form|g-recaptcha|Unfortunately, bots use DuckDuckGo/i.test(html)) return { blocked: true, results: [] };
  const results = [];
  // each result starts with <div class="result …">; the split keeps that opening tag
  const blocks = html.split(/(?=<div[^>]+class="[^"]*\bresult\b[^"]*")/i).slice(1);
  for (const b of blocks) {
    const open = b.slice(0, b.indexOf('>') + 1);
    if (/result--ad|result--no-result/i.test(open) || /class="[^"]*badge--ad/i.test(b)) continue;
    const a = b.match(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i)
      || b.match(/<a[^>]*href="([^"]*)"[^>]*class="[^"]*result__a[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
    if (!a) continue;
    const url = realUrl(a[1]);
    if (!/^https?:/.test(url) || /^https:\/\/duckduckgo\.com\/y\.js/.test(url)) continue; // ad redirects
    const snip = b.match(/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div|td)>/i);
    const shown = b.match(/class="[^"]*result__url[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
    results.push({ url, title: text(a[2]), snippet: snip ? text(snip[1]) : '', shown: shown ? text(shown[1]).replace(/[\u0001\u0002]/g, '') : '' });
  }
  // the "Next" form; its fields go back on the next request
  let next = null;
  const forms = html.match(/<form[^>]*action="\/html\/?"[^>]*>[\s\S]*?<\/form>/gi) || [];
  for (const f of forms) {
    if (!/value="(Next|Следующая|Далее)/i.test(f) && !/name="s"/i.test(f)) continue;
    if (!/name="s"/i.test(f)) continue;
    const fields = {};
    for (const m of f.matchAll(/<input[^>]*type="hidden"[^>]*>/gi)) {
      const name = (m[0].match(/name="([^"]*)"/i) || [])[1];
      const value = (m[0].match(/value="([^"]*)"/i) || [])[1];
      if (name) fields[name] = decode(value || '');
    }
    if (fields.s) next = fields;
  }
  const noResults = /class="[^"]*no-results/i.test(html);
  return { results, next, noResults };
}

async function fetchResults(ses, q, extra, region) {
  const body = new URLSearchParams({ q, kl: region || 'ru-ru', ...(extra || {}) });
  const res = await ses.fetch(DDG, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8' },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`поисковик ответил ${res.status}`);
  return parse(await res.text());
}

let logo = null;
function logoData() {
  if (logo == null) {
    try { logo = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, 'assets', 'logo.png')).toString('base64'); } catch { logo = ''; }
  }
  return logo;
}

const OTHER = {
  google: { name: 'Google', web: 'https://www.google.com/search?q=', images: 'https://www.google.com/search?tbm=isch&q=', video: 'https://www.google.com/search?tbm=vid&q=', news: 'https://www.google.com/search?tbm=nws&q=', maps: 'https://www.google.com/maps/search/' },
  yandex: { name: 'Яндекс', web: 'https://yandex.ru/search/?text=', images: 'https://yandex.ru/images/search?text=', video: 'https://yandex.ru/video/search?text=', news: 'https://newssearch.yandex.ru/news/search?text=', maps: 'https://yandex.ru/maps/?text=' },
  ddg: { name: 'DuckDuckGo', web: 'https://duckduckgo.com/?q=', images: 'https://duckduckgo.com/?ia=images&iax=images&q=', video: 'https://duckduckgo.com/?ia=videos&iax=videos&q=', news: 'https://duckduckgo.com/?ia=news&iar=news&q=', maps: 'https://duckduckgo.com/?iaxm=maps&q=' },
  bing: { name: 'Bing', web: 'https://www.bing.com/search?q=', images: 'https://www.bing.com/images/search?q=', video: 'https://www.bing.com/videos/search?q=', news: 'https://www.bing.com/news/search?q=', maps: 'https://www.bing.com/maps?q=' },
};

/** theme: colours and shapes of the browser right now (sent by the renderer) */
function page(q, data, theme, page = 1) {
  const t = { bg: '#0c0d12', panel: '#15171f', surface: '#1b1e28', text: '#eef0f6', soft: '#b9bdcb', muted: '#7e8497', line: 'rgba(255,255,255,.08)', accent: '#ff5a47', accent2: '#ff9a4a', onAccent: '#fff', radius: 14, font: '"Segoe UI", system-ui, sans-serif', serif: 'Georgia, serif', hand: false, light: false, engine: 'google', ...theme };
  const other = OTHER[t.engine] || OTHER.google;
  const qe = encodeURIComponent(q);
  const r = Math.max(0, Number(t.radius) || 0);
  const hand = !!t.hand;
  const glow = hand ? 'none' : `radial-gradient(900px 380px at 50% -140px, color-mix(in srgb, ${t.accent} 26%, transparent), transparent 70%)`;
  const card = hand
    ? `background:${t.panel};border:1px solid ${t.line};border-radius:${Math.round(r * 0.6)}px;`
    : `background:color-mix(in srgb, ${t.panel} 82%, transparent);border:1px solid ${t.line};border-radius:${r}px;`;
  const results = (data.results || []).map((x, i) => {
    let host = '';
    try { host = new URL(x.url).hostname.replace(/^www\./, ''); } catch { /* skip */ }
    const crumbs = (x.shown || host).replace(/^https?:\/\//, '').replace(/\/$/, '').split('/').filter(Boolean).slice(0, 4).map(esc).join(' › ');
    return `<article class="r" style="animation-delay:${Math.min(i, 12) * 25}ms">
      <a class="t" href="${esc(x.url)}"><span class="src"><i class="fi" style="background-image:url('https://icons.duckduckgo.com/ip3/${esc(host)}.ico')"></i><span><b>${esc(host)}</b><small>${crumbs}</small></span></span>
      <h3>${marked(x.title)}</h3></a>
      ${x.snippet ? `<p>${marked(x.snippet)}</p>` : ''}
    </article>`;
  }).join('');
  const nextHref = data.next ? 'tako://search/?' + new URLSearchParams({ q, p: String(page + 1), ...Object.fromEntries(Object.entries(data.next).filter(([k]) => ['s', 'dc', 'v', 'o', 'api', 'vqd', 'nextParams'].includes(k))) }).toString() : '';
  let body;
  if (data.error || data.blocked) {
    body = `<div class="empty"><h2>${data.blocked ? 'Поисковик попросил проверку' : 'Не удалось получить результаты'}</h2>
      <p>${data.blocked ? 'DuckDuckGo решил, что запросов слишком много. Подождите минуту или откройте поиск на сайте.' : esc(data.error) + '. Проверьте интернет или VPN.'}</p>
      <div class="btns"><a class="btn acc" href="tako://search/?q=${qe}">Попробовать снова</a><a class="btn" href="${other.web}${qe}">Искать в ${other.name}</a></div></div>`;
  } else if (!data.results.length) {
    body = `<div class="empty"><h2>Ничего не нашлось</h2><p>Попробуйте другие слова или поищите на сайте поисковика.</p><div class="btns"><a class="btn" href="${other.web}${qe}">Искать в ${other.name}</a></div></div>`;
  } else {
    body = results + `<nav class="more">${nextHref ? `<a class="btn acc" href="${esc(nextHref)}">Ещё результаты</a>` : ''}<a class="btn" href="${other.web}${qe}">Искать в ${other.name}</a></nav>`;
  }
  const L = logoData();
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; form-action tako:">
<title>${esc(q)} — поиск</title>${L ? `<link rel="icon" href="${L}">` : ''}
<meta name="color-scheme" content="${t.light ? 'light' : 'dark'}">
<style>
* { box-sizing: border-box; }
html { background: ${t.bg}; color: ${t.text}; font: 14px/1.55 ${t.font}; -webkit-font-smoothing: antialiased; }
body { margin: 0; min-height: 100vh; background: ${glow}; background-repeat: no-repeat; }
a { color: inherit; text-decoration: none; }
header { position: sticky; top: 0; z-index: 2; padding: 14px 24px 0; background: color-mix(in srgb, ${t.bg} 86%, transparent); backdrop-filter: blur(16px); border-bottom: 1px solid ${t.line}; }
.bar { max-width: 760px; margin: 0 auto; display: flex; align-items: center; gap: 14px; }
.logo { width: 34px; height: 34px; flex: none; ${hand ? 'transform: rotate(-8deg);' : `filter: drop-shadow(0 6px 14px color-mix(in srgb, ${t.accent} 45%, transparent));`} }
form { flex: 1; display: flex; align-items: center; gap: 8px; height: 46px; padding: 0 6px 0 16px; border-radius: ${hand ? Math.round(r * 0.6) : 999}px; background: ${t.panel}; border: ${hand ? `1.5px solid ${t.soft}` : `1px solid ${t.line}`}; ${hand ? 'box-shadow: 3px 3px 0 rgba(0,0,0,.55);' : 'box-shadow: 0 10px 30px -14px rgba(0,0,0,.6);'} }
form:focus-within { border-color: ${t.accent}; ${hand ? `box-shadow: 3px 3px 0 ${t.accent};` : `box-shadow: 0 0 0 3px color-mix(in srgb, ${t.accent} 22%, transparent);`} }
input { flex: 1; min-width: 0; border: none; outline: none; background: none; color: ${t.text}; font: 15.5px ${t.font}; }
button { border: none; cursor: pointer; height: 34px; padding: 0 18px; border-radius: ${hand ? Math.round(r * 0.45) : 999}px; background: ${hand ? t.accent : `linear-gradient(135deg, ${t.accent}, ${t.accent2})`}; color: ${t.onAccent}; font: 600 13px ${t.font}; ${hand ? 'box-shadow: 2px 2px 0 rgba(0,0,0,.6);' : ''} }
.tabs { max-width: 760px; margin: 0 auto; display: flex; gap: 4px; padding: 10px 0 0 48px; overflow-x: auto; }
.tabs a { padding: 7px 12px 9px; color: ${t.muted}; font-weight: 600; font-size: 13px; border-bottom: 2px solid transparent; white-space: nowrap; }
.tabs a:hover { color: ${t.text}; }
.tabs a.on { color: ${t.text}; border-bottom-color: ${t.accent}; }
main { max-width: 760px; margin: 0 auto; padding: 18px 24px 60px 72px; }
.info { color: ${t.muted}; font-size: 12.5px; margin: 0 0 12px 2px; }
.r { ${card} padding: 14px 18px 15px; margin-bottom: 10px; animation: rise .35s cubic-bezier(.2,.8,.2,1) both; transition: border-color .15s, transform .15s, box-shadow .15s; }
.r:hover { border-color: color-mix(in srgb, ${t.accent} 45%, ${t.line}); ${hand ? 'transform: translate(-1px,-1px); box-shadow: 3px 3px 0 rgba(0,0,0,.55);' : ''} }
@keyframes rise { from { opacity: 0; transform: translateY(8px); } }
.src { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; min-width: 0; }
/* a background image, so a site without an icon leaves a clean square instead of a broken picture */
.fi { width: 26px; height: 26px; border-radius: ${hand ? 3 : 8}px; flex: none; background: ${t.surface} center / 16px 16px no-repeat; }
.src span { display: flex; flex-direction: column; min-width: 0; line-height: 1.25; }
.src b { font-weight: 600; font-size: 13px; color: ${t.soft}; }
.src small { color: ${t.muted}; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
h3 { margin: 0; font: ${hand ? `600 19px/1.3 ${t.serif}` : `600 18px/1.3 ${t.font}`}; color: ${t.text}; }
.t:hover h3 { color: ${t.accent}; ${hand ? 'text-decoration: underline wavy; text-underline-offset: 4px;' : ''} }
.t:visited h3 { color: color-mix(in srgb, ${t.accent} 55%, ${t.text}); }
p { margin: 6px 0 0; color: ${t.soft}; }
mark { background: none; color: ${t.text}; font-weight: 700; }
.more, .btns { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-top: 22px; }
.btn { display: inline-flex; align-items: center; height: 38px; padding: 0 18px; border-radius: ${hand ? Math.round(r * 0.45) : 999}px; border: 1px solid ${t.line}; background: ${t.panel}; color: ${t.text}; font-weight: 600; }
.btn:hover { border-color: ${t.accent}; }
.btn.acc { background: ${hand ? t.accent : `linear-gradient(135deg, ${t.accent}, ${t.accent2})`}; color: ${t.onAccent}; border-color: transparent; }
.empty { text-align: center; padding: 70px 10px; }
.empty h2 { margin: 0 0 8px; font: ${hand ? `600 28px ${t.serif}` : `700 22px ${t.font}`}; }
.empty p { color: ${t.muted}; }
@media (max-width: 720px) { main { padding-left: 24px; } .tabs { padding-left: 0; } }
</style></head><body>
<header><div class="bar">${L ? `<img class="logo" src="${L}" alt="">` : ''}<form action="tako://search/" method="get"><input name="q" value="${esc(q)}" autocomplete="off" spellcheck="false" aria-label="Поиск"><button>Найти</button></form></div>
<nav class="tabs"><a class="on" href="tako://search/?q=${qe}">Всё</a><a href="${other.images}${qe}">Картинки</a><a href="${other.video}${qe}">Видео</a><a href="${other.news}${qe}">Новости</a><a href="${other.maps}${qe}">Карты</a><a href="${other.web}${qe}">В ${other.name}</a></nav></header>
<main>${data.results && data.results.length ? `<div class="info">${page > 1 ? `Страница ${page} · ` : ''}результаты DuckDuckGo</div>` : ''}${body}</main>
</body></html>`;
}

async function handle(req, ses, theme, region) {
  const u = new URL(req.url);
  const q = (u.searchParams.get('q') || '').trim();
  const html = (s) => new Response(s, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  if (u.hostname !== 'search') return html('<!doctype html><title>Tako</title><p>Нет такой страницы');
  if (!q) return html(page('', { results: [] }, theme));
  const n = Math.max(1, Number(u.searchParams.get('p')) || 1);
  const extra = {};
  for (const k of ['s', 'dc', 'v', 'o', 'api', 'vqd', 'nextParams']) if (u.searchParams.has(k)) extra[k] = u.searchParams.get(k);
  let data;
  try { data = await fetchResults(ses, q, extra, region); } catch (e) { data = { error: e.message || 'нет связи', results: [] }; }
  return html(page(q, data, theme, n));
}

module.exports = { parse, page, handle, realUrl };
