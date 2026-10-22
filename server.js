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
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'POST' && url.pathname === '/api/rooms') {
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
    }, 5 * 60 * 1000);
    expiry.unref();
    roomExpiryTimers.set(id, expiry);
    res.writeHead(201, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ roomId: id, roomName }));
    return;
  }
  if (req.method === 'GET' && url.pathname.startsWith('/api/rooms/')) {
    let code;
    try { code = decodeURIComponent(url.pathname.slice('/api/rooms/'.length)).toLowerCase(); }
    catch {
      res.writeHead(400, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: 'Nome ou link de sala inválido.' }));
      return;
    }
    const id = roomNames.get(code) || (roomFruitById.has(code) ? code : null);
    if (!id || !rooms.has(id)) {
      res.writeHead(404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: 'Sala não encontrada. Confira o nome da fruta ou o link.' }));
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
    '/js/ui.js': 'js/ui.js',
    '/js/core/signaling.js': 'js/core/signaling.js',
    '/js/core/peer.js': 'js/core/peer.js',
    '/js/core/quality.js': 'js/core/quality.js',
    '/js/core/stats.js': 'js/core/stats.js',
    '/js/features/chat.js': 'js/features/chat.js',
    '/js/features/files.js': 'js/features/files.js',
    '/js/features/media.js': 'js/features/media.js'
  };
  const file = files[url.pathname];
  if (!file) { res.writeHead(404); res.end('Not found'); return; }
  fs.readFile(path.join(PUBLIC, file), (err, body) => {
    if (err) { res.writeHead(500); res.end('Server error'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(body);
  });
});

const wss = new WebSocketServer({ server, path: '/signal', maxPayload: MAX_PAYLOAD });
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

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { send(ws, { type: 'error', message: 'Mensagem inválida.' }); return; }
    if (!msg || typeof msg.type !== 'string') return;
    if (msg.type === 'join') {
      if (ws.roomId) return;
      if (typeof msg.roomId !== 'string' || !/^[a-f0-9]{32}$/.test(msg.roomId)) { send(ws, { type: 'error', message: 'Link de sala inválido.' }); return; }
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
      const okay = msg.type === 'ice' ? msg.candidate && typeof msg.candidate === 'object' : msg.sdp && typeof msg.sdp === 'object';
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
wss.on('close', () => clearInterval(keepAlive));
server.listen(PORT, HOST, () => {
  console.log('PeerTalk iniciado!');
  console.log(`Local: http://localhost:${PORT}`);
  if (IPV6) console.log(`IPv6: http://[${IPV6}]:${PORT}`);
});
