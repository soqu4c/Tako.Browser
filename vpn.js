'use strict';
// VPN / proxy support.
//   * Plain proxies (http://, https://, socks4://, socks5://) are handed straight to Chromium.
//   * vless://, vmess://, trojan://, ss:// links are run through a local Xray core
//     (xray.exe next to the app in bin/, or a path from the settings), which exposes
//     a SOCKS5 port on 127.0.0.1 that the browser session then uses.
//   * Subscription URLs (https://…/sub) are fetched and every link inside becomes a profile.

const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');

const PLAIN = ['http:', 'https:', 'socks:', 'socks4:', 'socks5:'];
const XRAY = ['vless:', 'vmess:', 'trojan:', 'ss:'];

function b64decode(s) {
  s = String(s).trim().replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64').toString('utf8');
}

function safeDecode(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

// "Is this a link to a single proxy, or a subscription page?"
function looksLikeSubscription(raw) {
  let u;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  // http://host:port with no path — a proxy. Anything with a path or query — a subscription.
  return !(u.port && (u.pathname === '/' || u.pathname === '') && !u.search);
}

/** Parses one link into a profile, or throws with a human readable message. */
function parseLink(raw) {
  raw = String(raw || '').trim();
  if (!raw) throw new Error('Пустая ссылка');
  const scheme = (raw.match(/^([a-z0-9]+):\/\//i) || [])[1];
  if (!scheme) throw new Error('Не похоже на ссылку прокси');
  const proto = scheme.toLowerCase() + ':';

  if (PLAIN.includes(proto)) {
    const u = new URL(raw);
    const type = proto === 'socks:' ? 'socks5' : proto.slice(0, -1);
    const port = u.port || (type === 'http' ? '80' : type === 'https' ? '443' : '1080');
    return {
      kind: 'plain',
      type,
      host: u.hostname.replace(/^\[|\]$/g, ''),
      port: Number(port),
      username: safeDecode(u.username),
      password: safeDecode(u.password),
      name: safeDecode(u.hash.slice(1)) || `${type.toUpperCase()} ${u.hostname}:${port}`,
      link: raw,
    };
  }

  if (proto === 'vmess:') {
    const body = raw.slice('vmess://'.length).split('#')[0];
    let j;
    try { j = JSON.parse(b64decode(body)); } catch { throw new Error('Не удалось разобрать vmess-ссылку'); }
    return {
      kind: 'xray',
      type: 'vmess',
      host: j.add,
      port: Number(j.port),
      id: j.id,
      alterId: Number(j.aid || 0),
      security: j.scy || 'auto',
      net: j.net || 'tcp',
      headerType: j.type || 'none',
      hostHeader: j.host || '',
      path: j.path || '',
      tls: j.tls || '',
      sni: j.sni || '',
      alpn: j.alpn || '',
      fp: j.fp || '',
      name: j.ps || `VMess ${j.add}`,
      link: raw,
    };
  }

  if (proto === 'ss:') {
    let rest = raw.slice('ss://'.length);
    const hashAt = rest.indexOf('#');
    const name = hashAt >= 0 ? safeDecode(rest.slice(hashAt + 1)) : '';
    if (hashAt >= 0) rest = rest.slice(0, hashAt);
    rest = rest.split('?')[0].replace(/\/$/, '');
    let userinfo, hostport;
    if (rest.includes('@')) {
      [userinfo, hostport] = [rest.slice(0, rest.lastIndexOf('@')), rest.slice(rest.lastIndexOf('@') + 1)];
      userinfo = safeDecode(userinfo);
      if (!userinfo.includes(':')) userinfo = b64decode(userinfo);
    } else {
      const dec = b64decode(rest);
      [userinfo, hostport] = [dec.slice(0, dec.lastIndexOf('@')), dec.slice(dec.lastIndexOf('@') + 1)];
    }
    const method = userinfo.slice(0, userinfo.indexOf(':'));
    const password = userinfo.slice(userinfo.indexOf(':') + 1);
    const pi = hostport.lastIndexOf(':');
    const host = hostport.slice(0, pi).replace(/^\[|\]$/g, '');
    const port = Number(hostport.slice(pi + 1));
    if (!method || !host || !port) throw new Error('Не удалось разобрать ss-ссылку');
    return { kind: 'xray', type: 'ss', host, port, method, password, name: name || `Shadowsocks ${host}`, link: raw };
  }

  if (proto === 'vless:' || proto === 'trojan:') {
    // new URL() lower-cases nothing important here, but treats these as opaque — parse by hand
    const m = raw.match(/^[a-z]+:\/\/([^@]+)@(\[[^\]]+\]|[^:/?#]+):(\d+)\/?(\?[^#]*)?(#.*)?$/i);
    if (!m) throw new Error(`Не удалось разобрать ${proto.slice(0, -1)}-ссылку`);
    const q = new URLSearchParams(m[4] || '');
    const type = proto.slice(0, -1);
    return {
      kind: 'xray',
      type,
      host: m[2].replace(/^\[|\]$/g, ''),
      port: Number(m[3]),
      id: safeDecode(m[1]),
      flow: q.get('flow') || '',
      encryption: q.get('encryption') || 'none',
      net: q.get('type') || 'tcp',
      headerType: q.get('headerType') || 'none',
      hostHeader: q.get('host') || '',
      path: q.get('path') || '',
      serviceName: q.get('serviceName') || '',
      mode: q.get('mode') || '',
      tls: q.get('security') || (type === 'trojan' ? 'tls' : 'none'),
      sni: q.get('sni') || q.get('peer') || '',
      alpn: q.get('alpn') || '',
      fp: q.get('fp') || '',
      pbk: q.get('pbk') || '',
      sid: q.get('sid') || '',
      spx: q.get('spx') || '',
      allowInsecure: q.get('allowInsecure') === '1' || q.get('insecure') === '1',
      name: safeDecode((m[5] || '').slice(1)) || `${type.toUpperCase()} ${m[2]}`,
      link: raw,
    };
  }

  throw new Error(`Протокол ${proto} не поддерживается`);
}

/** Pulls every link it can understand out of a subscription body (plain or base64). */
function parseSubscription(text) {
  let body = String(text || '').trim();
  if (!/:\/\//.test(body)) {
    try { body = b64decode(body.replace(/\s+/g, '')); } catch { /* keep as is */ }
  }
  const out = [];
  for (const line of body.split(/\r?\n/)) {
    const l = line.trim();
    if (!l || !/^[a-z0-9]+:\/\//i.test(l)) continue;
    try { out.push(parseLink(l)); } catch { /* skip unknown lines */ }
  }
  return out;
}

// ---------- Xray config

function streamSettings(p) {
  const s = { network: p.net === 'h2' ? 'http' : p.net };
  const alpn = p.alpn ? p.alpn.split(',').map((x) => x.trim()).filter(Boolean) : undefined;
  if (p.tls === 'tls') {
    s.security = 'tls';
    s.tlsSettings = { serverName: p.sni || p.hostHeader || p.host, allowInsecure: !!p.allowInsecure };
    if (alpn) s.tlsSettings.alpn = alpn;
    if (p.fp) s.tlsSettings.fingerprint = p.fp;
  } else if (p.tls === 'reality') {
    s.security = 'reality';
    s.realitySettings = {
      serverName: p.sni || p.host,
      fingerprint: p.fp || 'chrome',
      publicKey: p.pbk,
      shortId: p.sid || '',
      spiderX: p.spx || '',
    };
  } else {
    s.security = 'none';
  }
  const hostHdr = p.hostHeader || undefined;
  switch (s.network) {
    case 'ws':
      s.wsSettings = { path: p.path || '/', headers: hostHdr ? { Host: hostHdr } : {} };
      break;
    case 'grpc':
      s.grpcSettings = { serviceName: p.serviceName || p.path || '', multiMode: p.mode === 'multi' };
      break;
    case 'http':
      s.httpSettings = { path: p.path || '/', host: hostHdr ? hostHdr.split(',') : [] };
      break;
    case 'httpupgrade':
      s.httpupgradeSettings = { path: p.path || '/', host: hostHdr || '' };
      break;
    case 'xhttp':
    case 'splithttp':
      s.network = 'xhttp';
      s.xhttpSettings = { path: p.path || '/', host: hostHdr || '', mode: p.mode || 'auto' };
      break;
    case 'tcp':
    default:
      s.network = 'tcp';
      if (p.headerType === 'http') {
        s.tcpSettings = {
          header: {
            type: 'http',
            request: { path: [p.path || '/'], headers: hostHdr ? { Host: hostHdr.split(',') } : {} },
          },
        };
      }
  }
  return s;
}

function outbound(p) {
  if (p.type === 'vless') {
    return {
      protocol: 'vless',
      settings: { vnext: [{ address: p.host, port: p.port, users: [{ id: p.id, encryption: p.encryption || 'none', flow: p.flow || '' }] }] },
      streamSettings: streamSettings(p),
    };
  }
  if (p.type === 'vmess') {
    return {
      protocol: 'vmess',
      settings: { vnext: [{ address: p.host, port: p.port, users: [{ id: p.id, alterId: p.alterId || 0, security: p.security || 'auto' }] }] },
      streamSettings: streamSettings(p),
    };
  }
  if (p.type === 'trojan') {
    return {
      protocol: 'trojan',
      settings: { servers: [{ address: p.host, port: p.port, password: p.id }] },
      streamSettings: streamSettings(p),
    };
  }
  if (p.type === 'ss') {
    return {
      protocol: 'shadowsocks',
      settings: { servers: [{ address: p.host, port: p.port, method: p.method, password: p.password }] },
    };
  }
  throw new Error('Неизвестный тип профиля');
}

function xrayConfig(p, socksPort) {
  return {
    log: { loglevel: 'warning' },
    inbounds: [{
      tag: 'socks-in',
      listen: '127.0.0.1',
      port: socksPort,
      protocol: 'socks',
      settings: { udp: true, auth: 'noauth' },
      sniffing: { enabled: true, destOverride: ['http', 'tls'] },
    }],
    outbounds: [{ tag: 'proxy', ...outbound(p) }, { tag: 'direct', protocol: 'freedom' }],
  };
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function waitPort(port, ms) {
  const until = Date.now() + ms;
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const s = net.connect(port, '127.0.0.1');
      s.once('connect', () => { s.destroy(); resolve(); });
      s.once('error', () => {
        s.destroy();
        if (Date.now() > until) reject(new Error('Xray не открыл порт'));
        else setTimeout(tryOnce, 150);
      });
    };
    tryOnce();
  });
}

function findXray(custom, extraDirs) {
  const exe = process.platform === 'win32' ? 'xray.exe' : 'xray';
  const candidates = [];
  if (custom) candidates.push(custom);
  for (const d of extraDirs) candidates.push(path.join(d, exe), path.join(d, 'bin', exe));
  for (const d of String(process.env.PATH || '').split(path.delimiter)) if (d) candidates.push(path.join(d, exe));
  return candidates.find((c) => { try { return fs.statSync(c).isFile(); } catch { return false; } }) || null;
}

class Xray {
  constructor() { this.proc = null; this.port = 0; this.log = ''; }

  async start(bin, profile, workDir) {
    this.stop();
    this.port = await freePort();
    fs.mkdirSync(workDir, { recursive: true });
    const cfgPath = path.join(workDir, 'xray-config.json');
    fs.writeFileSync(cfgPath, JSON.stringify(xrayConfig(profile, this.port), null, 2));
    this.log = '';
    const proc = spawn(bin, ['run', '-c', cfgPath], { cwd: path.dirname(bin), windowsHide: true });
    this.proc = proc;
    const keep = (d) => { this.log = (this.log + d.toString()).slice(-4000); };
    proc.stdout.on('data', keep);
    proc.stderr.on('data', keep);
    let exited = null;
    proc.once('exit', (code) => { exited = code; if (this.proc === proc) this.proc = null; });
    try {
      await waitPort(this.port, 6000);
    } catch (e) {
      this.stop();
      const tail = this.log.trim().split('\n').slice(-3).join('\n');
      throw new Error(exited != null ? `Xray завершился (код ${exited})${tail ? ':\n' + tail : ''}` : e.message);
    }
    return this.port;
  }

  stop() {
    if (this.proc) { try { this.proc.kill(); } catch { /* already gone */ } }
    this.proc = null;
  }
}

// ---------- Chromium proxy rules

function proxyToken(p, xrayPort) {
  if (p.kind === 'xray') return `SOCKS5 127.0.0.1:${xrayPort}; SOCKS 127.0.0.1:${xrayPort}`;
  const hp = `${p.host.includes(':') ? `[${p.host}]` : p.host}:${p.port}`;
  if (p.type === 'http') return `PROXY ${hp}`;
  if (p.type === 'https') return `HTTPS ${hp}`;
  if (p.type === 'socks4') return `SOCKS ${hp}`;
  return `SOCKS5 ${hp}; SOCKS ${hp}`;
}

function normDomain(d) {
  d = String(d || '').trim().toLowerCase();
  if (!d) return '';
  try { if (/^[a-z]+:\/\//.test(d)) d = new URL(d).hostname; } catch { /* keep */ }
  return d.replace(/^\*\./, '').replace(/^\./, '').replace(/\/.*$/, '').replace(/:\d+$/, '');
}

/** mode: 'all' | 'only' (only listed sites go through VPN) | 'except' (everything but listed) */
function buildProxyConfig(p, xrayPort, mode, domains) {
  const token = proxyToken(p, xrayPort);
  const list = [...new Set((domains || []).map(normDomain).filter(Boolean))];
  if (mode === 'all' || !list.length && mode === 'except') {
    if (p.kind === 'xray') return { proxyRules: `socks5://127.0.0.1:${xrayPort}`, proxyBypassRules: '<local>' };
    const scheme = p.type === 'socks4' ? 'socks4' : p.type === 'socks5' ? 'socks5' : p.type;
    return { proxyRules: `${scheme}://${p.host.includes(':') ? `[${p.host}]` : p.host}:${p.port}`, proxyBypassRules: '<local>' };
  }
  const inList = mode === 'only' ? JSON.stringify(token) : '"DIRECT"';
  const outList = mode === 'only' ? '"DIRECT"' : JSON.stringify(token);
  const pac = `function FindProxyForURL(url, host) {
  host = host.toLowerCase();
  if (isPlainHostName(host) || host === "127.0.0.1" || host === "localhost") return "DIRECT";
  var list = ${JSON.stringify(list)};
  for (var i = 0; i < list.length; i++) {
    if (host === list[i] || dnsDomainIs(host, "." + list[i])) return ${inList};
  }
  return ${outList};
}`;
  return { pacScript: 'data:application/x-ns-proxy-autoconfig;base64,' + Buffer.from(pac).toString('base64') };
}

module.exports = {
  parseLink, parseSubscription, looksLikeSubscription, xrayConfig, buildProxyConfig, findXray, Xray, normDomain,
  tmpDir: () => path.join(os.tmpdir(), 'tako-browser'),
};
