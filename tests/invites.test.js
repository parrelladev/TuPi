'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const WebSocket = require('ws');

async function fixture(context, expireUnused = false) {
  const source = `
    const http = require('node:http');
    const originalListen = http.Server.prototype.listen;
    http.Server.prototype.listen = function (...args) {
      this.once('listening', () => console.log('TEST_PORT=' + this.address().port));
      return originalListen.apply(this, args);
    };
    ${expireUnused ? `const originalTimeout = global.setTimeout;
    global.setTimeout = (callback, delay, ...args) => originalTimeout(callback, delay === 300000 ? 1000 : delay, ...args);
    require('node:crypto').randomInt = () => 0;` : ''}
    require('./server.js');
  `;
  const child = spawn(process.execPath, ['-e', source], {
    cwd: require('node:path').join(__dirname, '..'),
    env: { ...process.env, HOST: '127.0.0.1', PORT: '0', IPV6: '', ICE_SERVERS: '[]',
      STUN_URL: '', TURN_URL: '', TURN_USERNAME: '', TURN_CREDENTIAL: '', TRUST_PROXY: '0' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  context.after(async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, 'exit');
    child.kill();
    await exited;
  });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Servidor isolado não iniciou.')), 5000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', () => { clearTimeout(timer); reject(new Error('Servidor isolado encerrou.')); });
    let output = '';
    child.stdout.on('data', data => {
      output += data;
      const match = output.match(/TEST_PORT=(\d+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
  });
  const base = `http://127.0.0.1:${port}`;
  return {
    async create() {
      const response = await fetch(`${base}/api/rooms`, { method: 'POST' });
      assert.equal(response.status, 201);
      return response.json();
    },
    lookup: code => fetch(`${base}/api/rooms/${encodeURIComponent(code)}`),
    async socket() {
      const socket = new WebSocket(`${base.replace('http:', 'ws:')}/signal`);
      context.after(() => socket.terminate());
      await once(socket, 'open');
      return socket;
    }
  };
}

async function join(socket, roomId) {
  const response = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off('message', receive); reject(new Error('Sem resposta ao ingresso.')); }, 2000);
    function receive(raw) {
      const message = JSON.parse(raw.toString());
      if (!['error', 'joined'].includes(message.type)) return;
      clearTimeout(timer);
      socket.off('message', receive);
      resolve(message);
    }
    socket.on('message', receive);
  });
  socket.send(JSON.stringify({ type: 'join', roomId }));
  return response;
}

test('V2-01: fruta não revela convite nem permite ingresso; código autoriza somente dois', async context => {
  const server = await fixture(context);
  const room = await server.create();
  const host = await server.socket();
  assert.deepEqual(await join(host, room.roomId), { type: 'joined', role: 'host' });
  const outsider = await server.socket();
  for (const fruit of ['abacaxi', 'banana', 'caju', 'cereja', 'goiaba', 'kiwi', 'manga', 'melancia', 'pera', 'uva']) {
    const lookup = await server.lookup(fruit);
    assert.equal(lookup.status, 404);
    assert.equal(lookup.headers.get('cache-control'), 'no-store');
    const denied = await lookup.json();
    assert.deepEqual(Object.keys(denied), ['error']);
    assert.match(denied.error, /novo link completo/);
    const response = await join(outsider, fruit);
    assert.equal(response.type, 'error');
    assert.match(response.message, /inválido/);
  }
  for (const credential of [undefined, null, '', {}, '0'.repeat(32)]) {
    const denied = await join(outsider, credential);
    assert.equal(denied.type, 'error');
  }
  const wrong = await server.lookup('0'.repeat(32));
  assert.equal(wrong.status, 404);
  assert.deepEqual(Object.keys(await wrong.json()), ['error']);
  const valid = await server.lookup(room.roomId.toUpperCase());
  assert.equal(valid.status, 200);
  assert.deepEqual(await valid.json(), room);
  const guest = await server.socket();
  assert.deepEqual(await join(guest, room.roomId), { type: 'joined', role: 'guest' });
  assert.match((await join(outsider, room.roomId)).message, /cheia/);
  const left = once(host, 'message');
  guest.close();
  assert.equal(JSON.parse((await left)[0]).type, 'peer-left');
  assert.deepEqual(await join(outsider, room.roomId), { type: 'joined', role: 'guest' });
});

test('V2-01: convite expirado não revive mesmo quando a fruta é reutilizada', async context => {
  const server = await fixture(context, true);
  const old = await server.create();
  const deadline = Date.now() + 2000;
  while ((await server.lookup(old.roomId)).status === 200) {
    assert.ok(Date.now() < deadline, 'A sala sem ingresso deve expirar.');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  const expired = await server.lookup(old.roomId);
  assert.equal(expired.status, 404);
  const socket = await server.socket();
  assert.match((await join(socket, old.roomId)).message, /expirou/);
  const replacement = await server.create();
  assert.equal(replacement.roomName, old.roomName);
  assert.notEqual(replacement.roomId, old.roomId);
  assert.equal((await server.lookup(old.roomName)).status, 404);
  assert.equal((await server.lookup(old.roomId)).status, 404);
  assert.match((await join(socket, old.roomId)).message, /expirou/);
  assert.deepEqual(await join(socket, replacement.roomId), { type: 'joined', role: 'host' });
});
