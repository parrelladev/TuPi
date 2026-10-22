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
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), IPV6: '' },
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
