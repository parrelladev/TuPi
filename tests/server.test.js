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

async function createRoom() {
  const response = await fetch(`${baseUrl}/api/rooms`, { method: 'POST' });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.match(body.roomId, /^[a-f0-9]{32}$/);
  return body.roomId;
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

test('cria sala com ID aleatório de 128 bits', async () => {
  const first = await createRoom();
  const second = await createRoom();
  assert.notEqual(first, second);
  const lookup = await fetch(`${baseUrl}/api/rooms/${first}`);
  assert.equal(lookup.status, 200);
  const room = await lookup.json();
  assert.equal(room.roomId, first);
  const byName = await fetch(`${baseUrl}/api/rooms/${room.roomName.toUpperCase()}`);
  assert.equal(byName.status, 404);
  const denied = await byName.json();
  assert.match(denied.error, /novo link completo/);
  assert.equal(denied.roomId, undefined);
  assert.equal((await fetch(`${baseUrl}/api/rooms/%E0%A4%A`)).status, 400);
  assert.equal((await fetch(`${baseUrl}/api/rooms/inexistente`)).status, 404);
});

test('recusa ID inválido e sala inexistente', async () => {
  const socket = await connect();
  try {
    let result = nextMessage(socket);
    send(socket, { type: 'join', roomId: 'invalid' });
    assert.match((await result).message, /inválido/i);

    result = nextMessage(socket);
    send(socket, { type: 'join', roomId: '0'.repeat(32) });
    assert.match((await result).message, /não existe|expirou/i);
  } finally { await close(socket); }
});

test('limita a dois peers e remove a sala após a saída do último', async () => {
  const roomId = await createRoom();
  const first = await connect();
  const second = await connect();
  const third = await connect();
  try {
    let firstResult = nextMessage(first, message => message.type === 'joined');
    send(first, { type: 'join', roomId });
    assert.equal((await firstResult).role, 'host');

    const peerJoined = nextMessage(first, message => message.type === 'peer-joined');
    const secondResult = nextMessage(second, message => message.type === 'joined');
    send(second, { type: 'join', roomId });
    assert.equal((await secondResult).role, 'guest');
    await peerJoined;

    const thirdResult = nextMessage(third, message => message.type === 'error');
    send(third, { type: 'join', roomId });
    assert.match((await thirdResult).message, /cheia|máximo 2/i);

    const left = nextMessage(first, message => message.type === 'peer-left');
    await close(second);
    await left;

    await close(first);
    const retryResult = nextMessage(third, message => message.type === 'error');
    send(third, { type: 'join', roomId });
    assert.match((await retryResult).message, /não existe|expirou/i);
  } finally {
    await Promise.all([close(first), close(second), close(third)]);
  }
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

test('não encaminha oferta SDP malformada', async () => {
  const roomId = await createRoom();
  const host = await connect();
  const guest = await connect();
  try {
    const hostJoined = nextMessage(host, message => message.type === 'joined');
    send(host, { type: 'join', roomId });
    await hostJoined;
    const peerJoined = nextMessage(host, message => message.type === 'peer-joined');
    const guestJoined = nextMessage(guest, message => message.type === 'joined');
    send(guest, { type: 'join', roomId });
    await Promise.all([peerJoined, guestJoined]);

    let forwarded = false;
    const onMessage = () => { forwarded = true; };
    guest.on('message', onMessage);
    send(host, { type: 'offer', sdp: { type: 'offer', sdp: 'malformado' } });
    await new Promise(resolve => setTimeout(resolve, 100));
    guest.off('message', onMessage);
    assert.equal(forwarded, false);
  } finally { await Promise.all([close(host), close(guest)]); }
});

async function join(socket, roomId, expectedRole) {
  const joined = nextMessage(socket, message => message.type === 'joined');
  send(socket, { type: 'join', roomId });
  assert.equal((await joined).role, expectedRole);
}

test('encaminha offer, answer e ICE entre dois peers nos dois sentidos', async () => {
  const roomId = await createRoom();
  const host = await connect();
  const guest = await connect();
  try {
    await join(host, roomId, 'host');
    const peerJoined = nextMessage(host, message => message.type === 'peer-joined');
    await join(guest, roomId, 'guest');
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
  } finally { await Promise.all([close(host), close(guest)]); }
});

test('permite reentrada enquanto há um peer e remove também o nome após a última saída', async () => {
  const roomId = await createRoom();
  const room = await (await fetch(`${baseUrl}/api/rooms/${roomId}`)).json();
  const host = await connect();
  const guest = await connect();
  let replacement;
  try {
    await join(host, roomId, 'host');
    await join(guest, roomId, 'guest');
    const left = nextMessage(host, message => message.type === 'peer-left');
    await close(guest);
    await left;
    assert.equal((await fetch(`${baseUrl}/api/rooms/${roomId}`)).status, 200);
    assert.equal((await fetch(`${baseUrl}/api/rooms/${room.roomName}`)).status, 404);
    replacement = await connect();
    const returned = nextMessage(host, message => message.type === 'peer-joined');
    await join(replacement, roomId, 'guest');
    await returned;
    const lastLeft = nextMessage(replacement, message => message.type === 'peer-left');
    await close(host);
    await lastLeft;
    await close(replacement);
    // A server reply on this new socket acts as a barrier after close cleanup.
    const observer = await connect();
    try {
      const rejected = nextMessage(observer, message => message.type === 'error');
      send(observer, { type: 'join', roomId });
      assert.match((await rejected).message, /não existe|expirou/i);
      for (const code of [roomId, room.roomName]) {
        assert.equal((await fetch(`${baseUrl}/api/rooms/${code}`)).status, 404);
      }
    } finally { await close(observer); }
  } finally { await Promise.all([close(host), close(guest), close(replacement)]); }
});

test('mantém a sinalização isolada entre salas', async () => {
  const firstRoom = await createRoom();
  const secondRoom = await createRoom();
  const first = await connect();
  const second = await connect();
  const received = [];
  const record = raw => received.push(JSON.parse(raw.toString()));
  try {
    await join(first, firstRoom, 'host');
    await join(second, secondRoom, 'host');
    second.on('message', record);
    send(first, { type: 'offer', sdp: { type: 'offer', sdp: 'v=0\r\n' } });
    // Ordered response proves the offer has been handled on the source socket.
    const barrier = nextMessage(first, message => message.type === 'error');
    send(first, { type: 'join', roomId: secondRoom });
    assert.match((await barrier).message, /já está/i);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.deepEqual(received, []);
  } finally {
    second.off('message', record);
    await Promise.all([close(first), close(second)]);
  }
});

test('limita criação de salas por endereço', async () => {
  let sawRateLimit = false;
  for (let index = 0; index < 10; index++) {
    const response = await fetch(`${baseUrl}/api/rooms`, { method: 'POST' });
    if (response.status === 429) { sawRateLimit = true; break; }
    assert.equal(response.status, 201);
  }
  assert.equal(sawRateLimit, true);
});
