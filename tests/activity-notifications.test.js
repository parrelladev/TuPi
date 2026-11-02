'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const os = require('node:os');
const path = require('node:path');

function load(file, name, globals = {}) {
  const source = fs.readFileSync(file, 'utf8').replace(/^import .*;$/gm, '').replace(/export class /g, 'class ').replace(/export \{[\s\S]*?\};/g, '');
  return vm.runInNewContext(source + `\n${name}`, globals);
}
const ActivityNotifications = load('public/js/features/activity-notifications.js', 'ActivityNotifications');
function channel() {
  return { readyState: 'open', sent: [], send(data) { this.sent.push(data); }, close() { this.readyState = 'closed'; } };
}

test('avisos: envia só o tipo e toca uma vez em cada participante, sem eco', () => {
  const local = [], remote = [];
  const a = new ActivityNotifications({ playNotification: kind => local.push(kind) });
  const b = new ActivityNotifications({ playNotification: kind => remote.push(kind) });
  const outgoing = channel(), incoming = channel();
  a.attach(outgoing); b.attach(incoming);
  for (const type of ['screen-started', 'board-opened', 'youtube-opened', 'screen-started']) a.publish(type);
  for (const data of outgoing.sent) incoming.onmessage({ data });
  assert.deepEqual(outgoing.sent, ['screen-started', 'board-opened', 'youtube-opened', 'screen-started']);
  assert.equal(local.length, 4);
  assert.equal(remote.length, 4);
  assert.equal(incoming.sent.length, 0);
  for (const data of ['unknown', '{"type":"screen-started","name":"Ana"}', null, {}]) incoming.onmessage({ data });
  a.publish('unknown');
  assert.equal(local.length, 4); assert.equal(remote.length, 4);
});

test('avisos: reconectar não reenvia e callbacks de canais antigos são ignorados', () => {
  const played = [];
  const notifications = new ActivityNotifications({ playNotification: kind => played.push(kind) });
  const old = channel(); notifications.attach(old);
  const late = old.onmessage;
  notifications.publish('screen-started');
  const next = channel(); notifications.attach(next);
  assert.equal(old.onmessage, null);
  late({ data: 'screen-started' });
  assert.equal(played.length, 1); assert.equal(next.sent.length, 0);
  notifications.detach();
  notifications.publish('board-opened');
  notifications.attach(channel());
  assert.equal(notifications.channel.sent.length, 0);
});

test('PeerSession: negocia canal confiável e ordenado, roteia no receptor e fecha no reset', async () => {
  const created = [];
  const Peer = load('public/js/core/peer.js', 'PeerSession', {
    diagnostics: { enabled: false, detach() {} }, clearTimeout,
    MediaStream: class {}, RTCPeerConnection: class {
      addTransceiver() { return { sender: {} }; }
      createDataChannel(label, options) { const c = Object.assign(channel(), { label, options }); created.push(c); return c; }
      close() {}
    }
  });
  const feature = () => ({ attach() {}, detach() {} });
  const notifications = new ActivityNotifications({ playNotification() {} });
  const session = new Peer({
    rtcConfig: {}, activityNotifications: notifications, chat: feature(), files: feature(), youtube: feature(), presence: feature(),
    media: { attachSenders: async () => {}, detachSenders() {}, setRemoteCameraStream() {}, setRemoteScreenStream() {} },
    ui: { $: () => ({ addEventListener() {} }), setScreenAudio() {}, clearRoomView() {} }
  });
  const pc = await session.create(true);
  const outgoing = created.find(c => c.label === 'notifications');
  assert.deepEqual(Object.keys(outgoing.options), ['ordered']); assert.equal(outgoing.options.ordered, true);
  assert.equal(notifications.channel, outgoing);
  session.reset(); assert.equal(outgoing.readyState, 'closed'); assert.equal(notifications.channel, null);
  const receiver = await session.create(false), incoming = Object.assign(channel(), { label: 'notifications' });
  receiver.ondatachannel({ channel: incoming }); assert.equal(notifications.channel, incoming);
  assert.equal(pc.ondatachannel, null);
  session.reset(); assert.equal(incoming.onmessage, null);
});

test('tela: avisa após captura bem sucedida, nunca por clique repetido, cancelamento ou reanexar faixas', async () => {
  let capture;
  const Media = load('public/js/features/media.js', 'Media', { navigator: { mediaDevices: { getDisplayMedia: () => capture } } });
  let notify = 0, errors = 0;
  const track = { readyState: 'live', stop() {} };
  const stream = { getVideoTracks: () => [track], getAudioTracks: () => [], getTracks: () => [track] };
  const media = Object.assign(Object.create(Media.prototype), {
    ui: { $: () => ({ checked: false }), renderScreen() {} },
    mediaApiError: () => null, noAudioReason: () => '', reportCaptureError: () => errors++,
    onScreenStarted: () => notify++, screenStream: null
  });
  let resolve;
  capture = new Promise(r => { resolve = r; });
  const first = media.toggleScreen();
  await media.toggleScreen(); assert.equal(notify, 0);
  resolve(stream); assert.equal(await first, true); assert.equal(notify, 1);
  const sender = { replaceTrack: async () => {} };
  await media.attachSenders(sender, sender, sender, sender); assert.equal(notify, 1);
  await media.toggleScreen(); assert.equal(notify, 1);
  capture = Promise.reject(new Error('cancelled'));
  assert.equal(await media.toggleScreen(), false);
  assert.equal(errors, 1); assert.equal(notify, 1);
  capture = Promise.resolve(stream);
  await media.toggleScreen(); assert.equal(notify, 2);
});

test('quadro: uma confirmação ao autor por abertura, inclusive com pedidos concorrentes e snapshots', () => {
  const { Whiteboard: ServerBoard } = require('../server/whiteboard');
  const Whiteboard = load('public/js/features/whiteboard/index.js', 'Whiteboard');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tupi-notifications-'));
  try {
    const board = new ServerBoard(directory);
    const a = { inLobby: true }, b = { inLobby: true };
    const identity = board.join(a, null, 'Ana', true); board.join(b, null, 'Beto', false);
    const members = new Set([a, b]), confirmations = [];
    const client = Object.assign(Object.create(Whiteboard.prototype), { onOpened: () => confirmations.push('board-opened') });
    const send = (ws, message) => {
      if (message.type === 'board-opened') {
        assert.equal(ws, a); assert.deepEqual(message, { type: 'board-opened' });
        client.handle(message);
      }
    };
    board.handle(a, { type: 'board-panel', open: true }, members, send);
    board.handle(b, { type: 'board-panel', open: true }, members, send);
    board.handle(a, { type: 'board-get' }, members, send);
    board.join(a, identity.token, 'Ana', true);
    board.handle(a, { type: 'board-panel', open: true }, members, send);
    assert.equal(confirmations.length, 1);
    board.handle(a, { type: 'board-panel', open: false }, members, send);
    board.handle(a, { type: 'board-panel', open: true }, members, send);
    assert.equal(confirmations.length, 2);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('YouTube: só abertura local avisa; receber painel, reconectar e carregar vídeo não avisam', () => {
  const YouTube = load('public/js/features/youtube.js', 'YouTubeTogether', { diagnostics: { record() {} }, performance, setInterval: () => 1, clearInterval() {}, clearTimeout() {} });
  const nodes = new Map();
  const ui = { notify() {}, $: id => {
    if (!nodes.has(id)) nodes.set(id, { addEventListener(type, fn) { this[type] = fn; }, value: 'dQw4w9WgXcQ' });
    return nodes.get(id);
  } };
  let opened = false, count = 0;
  const youtube = Object.assign(Object.create(YouTube.prototype), {
    ui, isOpen: () => opened, setPanelOpen: value => { opened = value; }, closeSession() {},
    onOpened: () => count++, send() {}, loadVideo() {}, detach() {}, setStatus() {}, pingClock() {}
  });
  youtube.bindUI();
  ui.$('youtubeToggleBtn').click(); assert.equal(count, 1);
  youtube.receive('{"type":"panel","open":true}'); assert.equal(count, 1);
  const control = channel(); youtube.attach(control, true); control.onopen(); assert.equal(count, 1);
  ui.$('youtubeForm').submit({ preventDefault() {} }); assert.equal(count, 1);
  ui.$('youtubeToggleBtn').click(); assert.equal(count, 1);
  youtube.receive('{"type":"panel","open":true}'); assert.equal(count, 1);
  ui.$('youtubeToggleBtn').click(); ui.$('youtubeToggleBtn').click(); assert.equal(count, 2);
});

function chatHarness({ enabled = true, state = 'running', resume } = {}) {
  const starts = [], stops = [], blocked = [], listeners = new Map(), saved = [];
  const context = {
    state, currentTime: 1, destination: {},
    resume: resume || (async () => { context.state = 'running'; }),
    createOscillator: () => ({ frequency: { setValueAtTime() {} }, connect() { return this; }, start: at => starts.push(at), stop: at => stops.push(at), disconnect() {} }),
    createGain: () => ({ gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() { return this; } })
  };
  const nodes = new Map();
  const ui = {
    $: id => {
      if (!nodes.has(id)) nodes.set(id, { addEventListener: (event, fn) => listeners.set(`${id}:${event}`, fn) });
      return nodes.get(id);
    },
    setChatSoundEnabled() {}, setNotificationAudioBlocked: (...args) => blocked.push(args)
  };
  const Chat = load('public/js/features/chat.js', 'Chat', {
    window: { AudioContext: function () { return context; } },
    document: { addEventListener() {} }, localStorage: { getItem: () => enabled ? 'on' : 'off', setItem: (...args) => saved.push(args) }
  });
  return { chat: new Chat(ui), context, starts, stops, blocked, listeners, saved };
}

test('áudio desativado: ignora avisos locais/remotos e não cria contexto', async () => {
  const { chat, starts } = chatHarness({ enabled: false });
  const notifications = new ActivityNotifications(chat), incoming = channel();
  notifications.attach(incoming);
  notifications.publish('board-opened'); incoming.onmessage({ data: 'screen-started' });
  await chat.playNotification('activity');
  assert.equal(chat.audioContext, null); assert.equal(starts.length, 0);
});

test('áudio: eventos próximos são agendados uma vez e sem sobreposição', async () => {
  const { chat, starts } = chatHarness();
  await Promise.all([chat.playNotification('activity'), chat.playNotification('activity')]);
  assert.equal(starts.length, 6); assert.ok(starts[3] > starts[2] + 0.3);
});

test('áudio: silenciar cancela também as notas já agendadas e limpa a fila', async () => {
  const { chat, stops } = chatHarness();
  await Promise.all([chat.playNotification('activity'), chat.playNotification('activity')]);
  assert.equal(chat.notificationOscillators.size, 6);
  await chat.toggleSound();
  assert.equal(stops.filter(at => at === undefined).length, 6);
  assert.equal(chat.notificationOscillators.size, 0); assert.equal(chat.nextNotificationTime, 0);
});

test('áudio bloqueado: mostra botão antes de resume pendente e clique ativa sem mudar preferência', async () => {
  let resolve;
  const pending = new Promise(r => { resolve = r; });
  const h = chatHarness({ state: 'suspended', resume: () => pending });
  const playing = h.chat.playNotification('activity');
  assert.equal(h.blocked.at(-1)[0], true); assert.equal(h.starts.length, 0);
  h.context.resume = async () => { h.context.state = 'running'; resolve(); };
  h.listeners.get('enableNotificationAudioBtn:click')();
  await playing;
  assert.equal(h.blocked.at(-1)[0], false); assert.equal(h.starts.length, 3);
  assert.equal(h.chat.soundEnabled, true); assert.equal(h.saved.length, 0);
});

test('áudio: silenciar durante resume pendente impede som tardio; rejeição preserva preferência', async () => {
  let resolve;
  const pending = new Promise(r => { resolve = r; });
  const h = chatHarness({ state: 'suspended', resume: () => pending });
  const playing = h.chat.playNotification('activity');
  await h.chat.toggleSound();
  h.context.state = 'running'; resolve(); await playing;
  assert.equal(h.starts.length, 0); assert.equal(h.blocked.at(-1)[0], false);
  const rejected = chatHarness({ state: 'suspended', resume: async () => { throw new Error('NotAllowedError'); } });
  await rejected.chat.playNotification('activity');
  assert.equal(rejected.blocked.at(-1)[0], true); assert.equal(rejected.chat.soundEnabled, true);
});
