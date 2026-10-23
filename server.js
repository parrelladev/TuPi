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
const rooms = new Map(); // roomId -> Set<WebSocket>
const fruitNames = ['abacaxi', 'banana', 'caju', 'cereja', 'goiaba', 'kiwi', 'manga', 'melancia', 'pera', 'uva'];
const roomNames = new Map(); // fruit name -> roomId
const roomFruitById = new Map(); // roomId -> fruit name
const roomExpiryTimers = new Map();
const MAX_PAYLOAD = 64 * 1024;
const ROOM_TTL_MS = 5 * 60 * 1000;
const RATE_WINDOW_MS = 60 * 1000;
const requestLimits = new Map();
const activeSocketsByIp = new Map();
const MAX_CONNECTIONS_PER_IP = 12;
const MAX_CONNECTIONS = 200;
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const CSP = "default-src 'self'; script-src 'self' https://www.youtube.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; media-src 'self' blob: https:; connect-src 'self' ws: wss: https://www.youtube.com stun: stuns: turn: turns:; frame-src https://www.youtube.com https://www.youtube-nocookie.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

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
  if (req.method === 'POST' && url.pathname === '/api/rooms') {
    if (Number(req.headers['content-length'] || 0) > 0 || req.headers['transfer-encoding']) {
      res.writeHead(413, { 'Content-Type': 'application/json', 'Connection': 'close', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: 'Esta rota não aceita corpo de requisição.' })); return;
    }
    if (limited(requestLimits, `create:${clientIp(req)}`, 8, 15 * 60 * 1000)) {
      res.writeHead(429, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Retry-After': '900' });
      res.end(JSON.stringify({ error: 'Muitas salas criadas neste endereço. Tente novamente mais tarde.' })); return;
    }
    const available = fruitNames.filter(name => !roomNames.has(name));
    if (!available.length) {
      res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: 'Todas as frutas estão em uso. Tente novamente em alguns minutos.' }));
      return;
    }
    const id = crypto.randomBytes(16).toString('hex');
    const roomName = available[crypto.randomInt(available.length)];
    rooms.set(id, new Set());
    roomNames.set(roomName, id);
    roomFruitById.set(id, roomName);
    const expiry = setTimeout(() => {
      if (rooms.get(id)?.size === 0) {
        rooms.delete(id);
        roomNames.delete(roomName);
        roomFruitById.delete(id);
      }
      roomExpiryTimers.delete(id);
    }, ROOM_TTL_MS);
    expiry.unref();
    roomExpiryTimers.set(id, expiry);
    res.writeHead(201, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ roomId: id, roomName }));
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/config') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ iceServers })); return;
  }
  if (req.method === 'GET' && url.pathname.startsWith('/api/rooms/')) {
    if (limited(requestLimits, `lookup:${clientIp(req)}`, 120)) {
      res.writeHead(429, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Retry-After': '60' });
      res.end(JSON.stringify({ error: 'Muitas consultas de sala. Tente novamente em instantes.' })); return;
    }
    let code;
    try { code = decodeURIComponent(url.pathname.slice('/api/rooms/'.length)).toLowerCase(); }
    catch {
      res.writeHead(400, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: 'Código ou link de convite inválido.' }));
      return;
    }
    const id = /^[a-f0-9]{32}$/.test(code) ? code : null;
    if (!id || !rooms.has(id)) {
      res.writeHead(404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: 'Convite inválido ou expirado. Solicite um novo link completo; a fruta é apenas o nome da sala.' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ roomId: id, roomName: roomFruitById.get(id) }));
    return;
  }
  if (req.method !== 'GET') { res.writeHead(405); res.end('Method not allowed'); return; }
  const files = {
    '/': 'index.html',
    '/index.html': 'index.html',
    '/app.js': 'app.js',
    '/style.css': 'style.css',
    '/assets/tupi-logo.svg': 'assets/tupi-logo.svg',
    '/assets/tupi-logo.png': 'assets/tupi-logo.png',
    '/assets/favicon.ico': 'assets/favicon.ico',
    '/js/ui.js': 'js/ui.js',
    '/js/core/signaling.js': 'js/core/signaling.js',
    '/js/core/peer.js': 'js/core/peer.js',
    '/js/core/quality.js': 'js/core/quality.js',
    '/js/core/stats.js': 'js/core/stats.js',
    '/js/features/chat.js': 'js/features/chat.js',
    '/js/features/files.js': 'js/features/files.js',
    '/js/features/youtube.js': 'js/features/youtube.js',
    '/js/features/media.js': 'js/features/media.js'
  };
  const file = files[url.pathname];
  if (!file) { res.writeHead(404); res.end('Not found'); return; }
  fs.readFile(path.join(PUBLIC, file), (err, body) => {
    if (err) { res.writeHead(500); res.end('Server error'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)], 'Cache-Control': 'no-store' });
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
function leave(ws) {
  if (!ws.roomId) return;
  const roomId = ws.roomId;
  ws.roomId = null;
  const peers = rooms.get(roomId);
  if (!peers) return;
  peers.delete(ws);
  for (const other of peers) send(other, { type: 'peer-left' });
  if (!peers.size) {
    rooms.delete(roomId);
    const roomName = roomFruitById.get(roomId);
    roomNames.delete(roomName);
    roomFruitById.delete(roomId);
    clearTimeout(roomExpiryTimers.get(roomId));
    roomExpiryTimers.delete(roomId);
  }
}

wss.on('connection', (ws, req) => {
  const ip = clientIp(req);
  ws.rateKey = `signal:${ip}:${crypto.randomBytes(8).toString('hex')}`;
  ws.on('close', () => { const count = (activeSocketsByIp.get(ip) || 1) - 1; if (count) activeSocketsByIp.set(ip, count); else activeSocketsByIp.delete(ip); });
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (raw) => {
    if (limited(requestLimits, ws.rateKey, 120)) { ws.close(1008, 'Limite de mensagens atingido'); return; }
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { send(ws, { type: 'error', message: 'Mensagem inválida.' }); return; }
    if (!msg || typeof msg.type !== 'string') return;
    if (msg.type === 'join') {
      if (ws.roomId) { send(ws, { type: 'error', message: 'Este socket já está em uma sala.' }); return; }
      if (typeof msg.roomId !== 'string' || !/^[a-f0-9]{32}$/.test(msg.roomId)) { send(ws, { type: 'error', message: 'Link de sala inválido. Solicite um novo convite completo; a fruta é apenas o nome da sala.' }); return; }
      const peers = rooms.get(msg.roomId);
      if (!peers) { send(ws, { type: 'error', message: 'Sala não existe ou expirou. Crie uma nova.' }); return; }
      if (peers.size >= 2) { send(ws, { type: 'error', message: 'A sala já está cheia (máximo 2).' }); return; }
      clearTimeout(roomExpiryTimers.get(msg.roomId));
      roomExpiryTimers.delete(msg.roomId);
      ws.roomId = msg.roomId;
      const first = peers.size === 0;
      peers.add(ws);
      send(ws, { type: 'joined', role: first ? 'host' : 'guest' });
      if (!first) for (const other of peers) if (other !== ws) send(other, { type: 'peer-joined' });
      return;
    }
    if (!ws.roomId) return;
    if (['offer', 'answer', 'ice'].includes(msg.type)) {
      const candidate = msg.candidate;
      const validCandidate = msg.type !== 'ice' || candidate === null || (candidate && typeof candidate === 'object' && typeof candidate.candidate === 'string' && candidate.candidate.length <= 4096 && (!candidate.candidate || candidate.candidate.startsWith('candidate:')) && (candidate.sdpMid == null || typeof candidate.sdpMid === 'string' && candidate.sdpMid.length <= 128) && (candidate.sdpMLineIndex == null || Number.isInteger(candidate.sdpMLineIndex) && candidate.sdpMLineIndex >= 0 && candidate.sdpMLineIndex <= 255) && (candidate.usernameFragment == null || typeof candidate.usernameFragment === 'string' && candidate.usernameFragment.length <= 256));
      const sdp = msg.sdp;
      const validSdp = msg.type === 'ice' || (sdp && typeof sdp === 'object' && ['offer', 'answer'].includes(sdp.type) && typeof sdp.sdp === 'string' && sdp.sdp.startsWith('v=0') && sdp.sdp.length <= 48 * 1024);
      const okay = validCandidate && validSdp;
      if (!okay) return;
      const peers = rooms.get(ws.roomId);
      if (!peers) return;
      for (const other of peers) if (other !== ws) send(other, msg);
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
