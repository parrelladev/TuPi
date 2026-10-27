'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const { once } = require('node:events');
const WebSocket = require('ws');

let serverProcess;
let baseUrl;

async function unusedPort() {
  const listener = net.createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const { port } = listener.address();
  await new Promise((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  return port;
}

async function waitForServer(url) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.status === 200) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Servidor não iniciou em até 5 segundos.');
}

function connect() {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${baseUrl.replace('http', 'ws')}/signal`);
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

function nextMessage(socket, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error('Timeout aguardando mensagem WebSocket.')); }, 2000);
    const onMessage = raw => {
      let message;
      try { message = JSON.parse(raw.toString()); } catch { return; }
      if (!predicate(message)) return;
      cleanup(); resolve(message);
    };
    const onClose = () => { cleanup(); reject(new Error('WebSocket fechou antes da mensagem.')); };
    function cleanup() { clearTimeout(timer); socket.off('message', onMessage); socket.off('close', onClose); }
    socket.on('message', onMessage);
    socket.on('close', onClose);
  });
}

function send(socket, message) { socket.send(JSON.stringify(message)); }

function close(socket) {
  if (!socket || socket.readyState === WebSocket.CLOSED) return Promise.resolve();
  return new Promise(resolve => { socket.once('close', resolve); socket.close(); });
}

async function join(socket, expectedRole) {
  const joined = nextMessage(socket, message => message.type === 'joined');
  send(socket, { type: 'join' });
  assert.equal((await joined).role, expectedRole);
}

// Cada teste usa o mesmo lobby único; os sockets são fechados e aguardados antes do próximo teste.
async function drain(...sockets) {
  await Promise.all(sockets.map(close));
  await new Promise(resolve => setTimeout(resolve, 50));
}

before(async () => {
  const port = await unusedPort();
  baseUrl = `http://127.0.0.1:${port}`;
  serverProcess = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    cwd: path.join(__dirname, '..'),
    // Keep the fixture independent of deployment credentials and local .env.
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), IPV6: '',
      ICE_SERVERS: '[]', STUN_URL: '', TURN_URL: '', TURN_USERNAME: '', TURN_CREDENTIAL: '', TRUST_PROXY: '0' },
    stdio: 'ignore'
  });
  await waitForServer(baseUrl);
});

after(async () => {
  if (!serverProcess || serverProcess.exitCode !== null) return;
  serverProcess.kill();
  await once(serverProcess, 'exit');
});

test('publica cabeçalhos básicos e configuração ICE sem cache', async () => {
  const page = await fetch(baseUrl);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /frame-src.*youtube/);
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(page.headers.get('referrer-policy'), 'no-referrer');
  const config = await fetch(`${baseUrl}/api/config`);
  assert.equal(config.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await config.json(), { iceServers: [] });
});

test('não existe mais criação nem consulta de salas', async () => {
  assert.equal((await fetch(`${baseUrl}/api/rooms`, { method: 'POST' })).status, 405);
  assert.equal((await fetch(`${baseUrl}/api/rooms/${'0'.repeat(32)}`)).status, 404);
});

test('o lobby único aceita dois e recusa o terceiro enquanto estiver cheio', async () => {
  const first = await connect();
  const second = await connect();
  const third = await connect();
  try {
    await join(first, 'host');
    const peerJoined = nextMessage(first, message => message.type === 'peer-joined');
    await join(second, 'guest');
    await peerJoined;

    const full = nextMessage(third, message => message.type === 'error');
    send(third, { type: 'join' });
    const error = await full;
    assert.equal(error.code, 'full');
    assert.match(error.message, /cheio|máximo 2/i);

    const left = nextMessage(first, message => message.type === 'peer-left');
    await close(second);
    await left;

    await join(third, 'guest');
  } finally { await drain(first, second, third); }
});

test('informa a quantidade de pessoas online a quem está no lobby', async () => {
  const first = await connect();
  const second = await connect();
  try {
    const alone = nextMessage(first, message => message.type === 'lobby' && message.count === 1);
    await join(first, 'host');
    assert.equal((await alone).max, 2);
    const together = nextMessage(first, message => message.type === 'lobby' && message.count === 2);
    await join(second, 'guest');
    await together;
    const back = nextMessage(first, message => message.type === 'lobby' && message.count === 1);
    await close(second);
    await back;
  } finally { await drain(first, second); }
});

test('recusa entrar duas vezes com o mesmo socket', async () => {
  const socket = await connect();
  try {
    await join(socket, 'host');
    const again = nextMessage(socket, message => message.type === 'error');
    send(socket, { type: 'join' });
    assert.equal((await again).code, 'already');
  } finally { await drain(socket); }
});

test('não encaminha oferta SDP malformada', async () => {
  const host = await connect();
  const guest = await connect();
  try {
    await join(host, 'host');
    const peerJoined = nextMessage(host, message => message.type === 'peer-joined');
    await join(guest, 'guest');
    await peerJoined;

    let forwarded = false;
    const onMessage = raw => { if (JSON.parse(raw.toString()).type === 'offer') forwarded = true; };
    guest.on('message', onMessage);
    send(host, { type: 'offer', sdp: { type: 'offer', sdp: 'malformado' } });
    await new Promise(resolve => setTimeout(resolve, 100));
    guest.off('message', onMessage);
    assert.equal(forwarded, false);
  } finally { await drain(host, guest); }
});

test('encaminha offer, answer e ICE entre dois peers nos dois sentidos', async () => {
  const host = await connect();
  const guest = await connect();
  try {
    await join(host, 'host');
    const peerJoined = nextMessage(host, message => message.type === 'peer-joined');
    await join(guest, 'guest');
    await peerJoined;
    // Synthetic signaling payloads: this verifies relay, not WebRTC media.
    const messages = [
      { type: 'offer', sdp: { type: 'offer', sdp: 'v=0\r\n' } },
      { type: 'answer', sdp: { type: 'answer', sdp: 'v=0\r\n' } },
      { type: 'ice', candidate: { candidate: 'candidate:1 1 UDP 1 127.0.0.1 5000 typ host', sdpMid: '0', sdpMLineIndex: 0 } },
      { type: 'ice', candidate: null }
    ];
    for (const [source, target] of [[host, guest], [guest, host]]) {
      for (const message of messages) {
        const received = nextMessage(target, value => value.type === message.type);
        send(source, message);
        assert.deepEqual(await received, message);
      }
    }
  } finally { await drain(host, guest); }
});

test('quem fica sozinho continua no lobby e o próximo a entrar vira par dele', async () => {
  const host = await connect();
  const guest = await connect();
  let replacement;
  try {
    await join(host, 'host');
    await join(guest, 'guest');
    const left = nextMessage(host, message => message.type === 'peer-left');
    await close(guest);
    await left;
    replacement = await connect();
    const returned = nextMessage(host, message => message.type === 'peer-joined');
    await join(replacement, 'guest');
    await returned;
    const lastLeft = nextMessage(replacement, message => message.type === 'peer-left');
    await close(host);
    await lastLeft;
  } finally { await drain(host, guest, replacement); }
  // Com o lobby vazio, o próximo a entrar volta a ser o anfitrião.
  const fresh = await connect();
  try { await join(fresh, 'host'); } finally { await drain(fresh); }
});
