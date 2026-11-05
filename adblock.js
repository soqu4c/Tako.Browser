'use strict';
// Ad and tracker blocking for the browser sessions.
// Uses the Ghostery engine with EasyList/EasyPrivacy + the AdGuard Russian list.
// The compiled engine is cached on disk and refreshed once a week; until it is
// ready a short built-in list keeps the worst offenders out.

const fs = require('fs');
const path = require('path');
const { ElectronBlocker, Request, adsAndTrackingLists } = require('@ghostery/adblocker-electron');

const EXTRA_LISTS = ['https://filters.adtidy.org/extension/ublock/filters/1.txt']; // AdGuard Russian
const WEEK = 7 * 24 * 3600 * 1000;

const BUILTIN = [
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'google-analytics.com', 'googletagmanager.com',
  'adservice.google.com', 'adnxs.com', 'criteo.com', 'criteo.net', 'taboola.com', 'outbrain.com', 'scorecardresearch.com',
  'quantserve.com', 'adsrvr.org', 'rubiconproject.com', 'pubmatic.com', 'openx.net', 'casalemedia.com', 'moatads.com',
  'amazon-adsystem.com', 'facebook.net/tr', 'hotjar.com', 'mc.yandex.ru', 'an.yandex.ru', 'yandexadexchange.net',
  'adfox.ru', 'adriver.ru', 'top-fwz1.mail.ru', 'ad.mail.ru', 'mediametrics.ru', 'smi2.ru', 'adhigh.net', 'popads.net',
  'propellerads.com', 'exoclick.com', 'zedo.com', 'adform.net', 'smartadserver.com', 'yieldmo.com', 'teads.tv',
].map((d) => (d.includes('/') ? `||${d}` : `||${d}^`)).join('\n');

const TYPES = {
  mainFrame: 'main_frame', subFrame: 'sub_frame', stylesheet: 'stylesheet', script: 'script', image: 'image',
  font: 'font', object: 'object', xhr: 'xmlhttprequest', ping: 'ping', cspReport: 'csp_report', media: 'media',
  webSocket: 'websocket', other: 'other',
};

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

class AdBlock {
  constructor(dir, fetchFn, notify) {
    this.dir = dir;
    this.fetch = fetchFn;
    this.notify = notify;
    this.enabled = true;
    this.allow = new Set();
    this.engine = ElectronBlocker.parse(BUILTIN);
    this.full = false;
    this.updatedAt = 0;
    this.total = 0;
    this.counts = new Map(); // webContentsId -> blocked on the current page
    this.pending = new Map();
    this.sessions = new WeakSet();
  }

  get cacheFile() { return path.join(this.dir, 'adblock-engine.bin'); }

  async load(force) {
    try {
      if (!force) {
        const st = fs.statSync(this.cacheFile);
        this.engine = ElectronBlocker.deserialize(new Uint8Array(fs.readFileSync(this.cacheFile)));
        this.full = true;
        this.updatedAt = st.mtimeMs;
        if (Date.now() - st.mtimeMs < WEEK) return { ok: true, cached: true };
      }
    } catch { /* no cache yet */ }
    try {
      const engine = await ElectronBlocker.fromLists(this.fetch, [...adsAndTrackingLists, ...EXTRA_LISTS], { enableCompression: true });
      this.engine = engine;
      this.full = true;
      this.updatedAt = Date.now();
      fs.mkdirSync(this.dir, { recursive: true });
      fs.writeFileSync(this.cacheFile, Buffer.from(engine.serialize()));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  attach(ses) {
    if (this.sessions.has(ses)) return;
    this.sessions.add(ses);
    ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (details, callback) => {
      const wc = details.webContents;
      const id = wc ? wc.id : 0;
      if (details.resourceType === 'mainFrame') {
        if (id) this.counts.set(id, 0);
        callback({});
        return;
      }
      if (!this.enabled) { callback({}); return; }
      let page = '';
      try { page = (details.frame && details.frame.top && details.frame.top.url) || (wc && wc.getURL()) || details.referrer || ''; } catch { page = details.referrer || ''; }
      const site = hostOf(page);
      if (site && [...this.allow].some((d) => site === d || site.endsWith('.' + d))) { callback({}); return; }
      let blocked = false;
      try {
        const req = Request.fromRawDetails({ url: details.url, type: TYPES[details.resourceType] || 'other', sourceUrl: page });
        const r = this.engine.match(req);
        blocked = !!(r && r.match);
      } catch { /* malformed url */ }
      if (blocked) {
        this.total++;
        if (id) {
          this.counts.set(id, (this.counts.get(id) || 0) + 1);
          this.report(id);
        }
      }
      callback(blocked ? { cancel: true } : {});
    });
  }

  report(id) {
    if (this.pending.has(id)) return;
    this.pending.set(id, setTimeout(() => {
      this.pending.delete(id);
      this.notify(id, this.counts.get(id) || 0);
    }, 400));
  }

  status() {
    return { enabled: this.enabled, full: this.full, updatedAt: this.updatedAt, total: this.total };
  }
}

module.exports = { AdBlock };
