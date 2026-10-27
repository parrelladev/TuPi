'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { WebSocketServer, WebSocket } = require('ws');

// Load the local .env file without an extra dependency. Existing process
// environment values take precedence (as they do in deployment).
try {
  const envFile = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  for (const line of envFile.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch (err) {
  if (err.code !== 'ENOENT') throw err;
}

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '::';
const IPV6 = process.env.IPV6 || '';
const PUBLIC = path.join(__dirname, 'public');
const { Whiteboard } = require('./server/whiteboard');
const board = new Whiteboard(process.env.BOARD_DATA_DIR || path.join(__dirname, 'data'));
const lobby = new Set(); // sockets presentes no lobby único (máximo 2)
const LOBBY_MAX = 2;
const MAX_PAYLOAD = 64 * 1024;
const RATE_WINDOW_MS = 60 * 1000;
const requestLimits = new Map();
const activeSocketsByIp = new Map();
const MAX_CONNECTIONS_PER_IP = 12;
const MAX_CONNECTIONS = 200;
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const CSP = "default-src 'self'; script-src 'self' https://www.youtube.com; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https:; media-src 'self' blob: https:; connect-src 'self' ws: wss: https://www.youtube.com stun: stuns: turn: turns:; frame-src https://www.youtube.com https://www.youtube-nocookie.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };

// Avatares (SVG): lista fixa montada na inicialização, sem aceitar caminhos arbitrários.
const avatarFiles = new Map();
try {
  for (const name of fs.readdirSync(path.join(PUBLIC, 'assets', 'avatars'))) {
    if (/^[a-z0-9-]+\.svg$/.test(name)) avatarFiles.set(`/assets/avatars/${name}`, `assets/avatars/${name}`);
  }
} catch (err) { if (err.code !== 'ENOENT') throw err; }
// Ícones Phosphor (CSS e fontes woff2 gerados por scripts/build-vendor.js).
try {
  for (const name of fs.readdirSync(path.join(PUBLIC, 'vendor', 'phosphor'))) {
    if (/^[A-Za-z0-9-]+\.(css|woff2)$/.test(name)) avatarFiles.set(`/vendor/phosphor/${name}`, `vendor/phosphor/${name}`);
  }
} catch (err) { if (err.code !== 'ENOENT') throw err; }

let iceServers = [];
function parseIceUrls(value, variable) {
  const urls = value.split(',').map(url => url.trim()).filter(Boolean);
  if (!urls.length || urls.length > 8 || urls.some(url => url.length > 512 || !/^(stun|stuns|turn|turns):/i.test(url))) throw new Error(`${variable} deve conter de 1 a 8 URLs STUN/TURN válidas.`);
  return urls;
}
if (process.env.ICE_SERVERS) {
  try {
    const parsed = JSON.parse(process.env.ICE_SERVERS);
    if (!Array.isArray(parsed) || parsed.length > 8 || parsed.some(server => !server || !(typeof server.urls === 'string' || Array.isArray(server.urls)) || ![].concat(server.urls).length || [].concat(server.urls).length > 8 || ![].concat(server.urls).every(url => typeof url === 'string' && url.length <= 512 && /^(stun|stuns|turn|turns):/i.test(url)) || (server.username != null && (typeof server.username !== 'string' || server.username.length > 512)) || (server.credential != null && (typeof server.credential !== 'string' || server.credential.length > 512)))) throw new Error();
    iceServers = parsed;
  } catch { throw new Error('ICE_SERVERS deve ser um array JSON de servidores STUN/TURN válidos.'); }
} else if (process.env.STUN_URL || process.env.TURN_URL) {
  if (process.env.STUN_URL) iceServers.push({ urls: parseIceUrls(process.env.STUN_URL, 'STUN_URL') });
  if (process.env.TURN_URL) {
    if (!process.env.TURN_USERNAME || !process.env.TURN_CREDENTIAL) throw new Error('TURN_URL exige TURN_USERNAME e TURN_CREDENTIAL.');
    if (process.env.TURN_USERNAME.length > 512 || process.env.TURN_CREDENTIAL.length > 512) throw new Error('As credenciais TURN excedem 512 caracteres.');
    iceServers.push({ urls: parseIceUrls(process.env.TURN_URL, 'TURN_URL'), username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL });
  }
}

function limited(map, key, max, windowMs = RATE_WINDOW_MS) {
  const now = Date.now();
  let bucket = map.get(key);
  if (!bucket || now - bucket.startedAt >= windowMs) bucket = { startedAt: now, count: 0 };
  bucket.count++;
  map.set(key, bucket);
  return bucket.count > max;
}

function setSecurityHeaders(res) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), display-capture=(self), fullscreen=(self), geolocation=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
}

function clientIp(req) {
  if (TRUST_PROXY && typeof req.headers['x-forwarded-for'] === 'string') {
    const forwarded = req.headers['x-forwarded-for'].split(',')[0].trim();
    if (forwarded) return forwarded;
  }
  return req.socket.remoteAddress || 'unknown';
}

const server = http.createServer((req, res) => {
  setSecurityHeaders(res);
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/api/diagnostics/ping') {
    res.writeHead(204, { 'Cache-Control': 'no-store' }); res.end(); return;
  }
  if (req.method === 'GET' && url.pathname === '/api/config') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ iceServers })); return;
  }
  if (req.method !== 'GET') { res.writeHead(405); res.end('Method not allowed'); return; }
  const files = {
    '/': 'index.html',
    '/index.html': 'index.html',
    '/app.js': 'app.js',
    '/sw.js': 'sw.js',
    '/manifest.webmanifest': 'manifest.webmanifest',
    '/assets/icon-192.png': 'assets/icon-192.png',
    '/assets/icon-512.png': 'assets/icon-512.png',
    '/style.css': 'style.css',
    '/assets/tupi-claro.svg': 'assets/tupi-claro.svg',
    '/assets/tupi-escuro.svg': 'assets/tupi-escuro.svg',
    '/assets/tupi-simbolo.svg': 'assets/tupi-simbolo.svg',
    '/assets/tupi-claro.png': 'assets/tupi-claro.png',
    '/assets/tupi-escuro.png': 'assets/tupi-escuro.png',
    '/assets/favicon.ico': 'assets/favicon.ico',
    '/js/ui.js': 'js/ui.js',
    '/js/core/signaling.js': 'js/core/signaling.js',
    '/js/core/peer.js': 'js/core/peer.js',
    '/js/core/quality.js': 'js/core/quality.js',
    '/js/core/stats.js': 'js/core/stats.js',
    '/js/core/diagnostics.js': 'js/core/diagnostics.js',
    '/js/core/diagnostics-runner.js': 'js/core/diagnostics-runner.js',
    '/js/features/whiteboard/index.js': 'js/features/whiteboard/index.js',
    '/js/features/whiteboard/view.js': 'js/features/whiteboard/view.js',
    '/js/features/whiteboard/renderer.js': 'js/features/whiteboard/renderer.js',
    '/js/features/whiteboard/export.js': 'js/features/whiteboard/export.js',
    '/css/stage-layout.css': 'css/stage-layout.css',
    '/js/features/stage-layout.js': 'js/features/stage-layout.js',
    '/css/whiteboard.css': 'css/whiteboard.css',
    '/js/features/chat.js': 'js/features/chat.js',
    '/js/features/files.js': 'js/features/files.js',
    '/js/features/stream-save.js': 'js/features/stream-save.js',
    '/js/features/youtube.js': 'js/features/youtube.js',
    '/js/features/media.js': 'js/features/media.js',
    '/js/fx.js': 'js/fx.js',
    '/js/theme.js': 'js/theme.js',
    '/js/theme-boot.js': 'js/theme-boot.js',
    '/js/features/avatars.js': 'js/features/avatars.js',
    '/js/features/presence.js': 'js/features/presence.js',
    '/js/features/voice.js': 'js/features/voice.js',
    '/js/features/speaker.js': 'js/features/speaker.js',
    '/js/features/notifier.js': 'js/features/notifier.js',
    '/js/features/screen.js': 'js/features/screen.js',
    '/vendor/open-props.css': 'vendor/open-props.css',
    '/vendor/motion.js': 'vendor/motion.js',
    '/vendor/auto-animate.js': 'vendor/auto-animate.js'
  };
  const file = files[url.pathname] || avatarFiles.get(url.pathname);
  if (!file) { res.writeHead(404); res.end('Not found'); return; }
  fs.readFile(path.join(PUBLIC, file), (err, body) => {
    if (err) { res.writeHead(500); res.end('Server error'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)], 'Cache-Control': path.extname(file) === '.woff2' ? 'public, max-age=86400' : 'no-store' });
    res.end(body);
  });
});

const wss = new WebSocketServer({ server, path: '/signal', maxPayload: MAX_PAYLOAD, perMessageDeflate: false, verifyClient: ({ origin, req }, done) => {
  if (origin) {
    try { if (new URL(origin).host !== req.headers.host) return done(false, 403, 'Origin inválido'); }
    catch { return done(false, 403, 'Origin inválido'); }
  }
  const ip = clientIp(req);
  const activeForIp = activeSocketsByIp.get(ip) || 0;
  if (wss.clients.size >= MAX_CONNECTIONS || activeForIp >= MAX_CONNECTIONS_PER_IP || limited(requestLimits, `connect:${ip}`, 30, 5 * 60 * 1000)) return done(false, 429, 'Limite de conexões atingido');
  activeSocketsByIp.set(ip, activeForIp + 1);
  done(true);
} });
function send(ws, message) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message)); }
function broadcastCount() { for (const member of lobby) send(member, { type: 'lobby', count: lobby.size, max: LOBBY_MAX }); }
function leave(ws) {
  if (!ws.inLobby) return;
  ws.inLobby = false;
  lobby.delete(ws);
  if (!lobby.size) board.panelOpen = false;
  if (ws.boardHost) { const next = [...lobby][0]; if (next) next.boardHost = true; }
  for (const member of lobby) send(member, { type: 'board-members', members: [...lobby].map(p => ({ ...p.boardUser, host: p.boardHost })) });
  for (const other of lobby) send(other, { type: 'peer-left' });
  broadcastCount();
}

wss.on('connection', (ws, req) => {
  const ip = clientIp(req);
  ws.rateKey = `signal:${ip}:${crypto.randomBytes(8).toString('hex')}`;
  ws.on('close', () => { const count = (activeSocketsByIp.get(ip) || 1) - 1; if (count) activeSocketsByIp.set(ip, count); else activeSocketsByIp.delete(ip); });
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (raw) => {

    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { send(ws, { type: 'error', message: 'Mensagem inválida.' }); return; }
    if (!msg || typeof msg.type !== 'string') return;
    if (limited(requestLimits, ws.rateKey + (msg.type.startsWith('board-') ? ':board' : ''), msg.type.startsWith('board-') ? 3600 : 120)) { ws.close(1008, 'Limite de mensagens atingido'); return; }
    if (msg.type.startsWith('board-')) { board.handle(ws, msg, lobby, send); return; }
    if (msg.type === 'join') {
      if (ws.inLobby) { send(ws, { type: 'error', code: 'already', message: 'Você já está no lobby.' }); return; }
      if (lobby.size >= LOBBY_MAX) { send(ws, { type: 'error', code: 'full', message: 'O lobby está cheio (máximo 2 pessoas).' }); return; }
      const first = lobby.size === 0;
      ws.inLobby = true;
      lobby.add(ws);
      send(ws, board.join(ws, msg.boardToken, msg.name, first));
      send(ws, board.snapshot());
      for (const member of lobby) send(member, { type: 'board-members', members: [...lobby].map(p => ({ ...p.boardUser, host: p.boardHost })) });
      send(ws, { type: 'joined', role: first ? 'host' : 'guest' });
      if (!first) for (const other of lobby) if (other !== ws) send(other, { type: 'peer-joined' });
      broadcastCount();
      return;
    }
    if (!ws.inLobby) return;
    if (['offer', 'answer', 'ice'].includes(msg.type)) {
      const candidate = msg.candidate;
      const validCandidate = msg.type !== 'ice' || candidate === null || (candidate && typeof candidate === 'object' && typeof candidate.candidate === 'string' && candidate.candidate.length <= 4096 && (!candidate.candidate || candidate.candidate.startsWith('candidate:')) && (candidate.sdpMid == null || typeof candidate.sdpMid === 'string' && candidate.sdpMid.length <= 128) && (candidate.sdpMLineIndex == null || Number.isInteger(candidate.sdpMLineIndex) && candidate.sdpMLineIndex >= 0 && candidate.sdpMLineIndex <= 255) && (candidate.usernameFragment == null || typeof candidate.usernameFragment === 'string' && candidate.usernameFragment.length <= 256));
      const sdp = msg.sdp;
      const validSdp = msg.type === 'ice' || (sdp && typeof sdp === 'object' && ['offer', 'answer'].includes(sdp.type) && typeof sdp.sdp === 'string' && sdp.sdp.startsWith('v=0') && sdp.sdp.length <= 48 * 1024);
      const okay = validCandidate && validSdp;
      if (!okay) return;
      for (const other of lobby) if (other !== ws) send(other, msg);
    }
  });
  ws.on('close', () => leave(ws));
  ws.on('error', () => leave(ws));
});
const keepAlive = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false; ws.ping();
  }
}, 30000);
const rateCleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of requestLimits) if (now - bucket.startedAt > 15 * 60 * 1000) requestLimits.delete(key);
}, 5 * 60 * 1000);
wss.on('close', () => clearInterval(keepAlive));
server.on('close', () => clearInterval(rateCleanup));
server.listen(PORT, HOST, () => {
  console.log('TuPi iniciado!');
  console.log(`Local: http://localhost:${PORT}`);
  if (IPV6) console.log(`IPv6: http://[${IPV6}]:${PORT}`);
});
