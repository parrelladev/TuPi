import { createUI } from './js/ui.js';
import { Signaling } from './js/core/signaling.js';
import { PeerSession } from './js/core/peer.js';
import { Chat } from './js/features/chat.js';
import { Media } from './js/features/media.js';

const ui = createUI();
const chat = new Chat(ui);
const media = new Media(ui);
const rtcConfig = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  // Production: add your own TURN service for restrictive NATs:
  // { urls: 'turn:turn.example.com:3478', username: '...', credential: '...' }
};

let roomId = null;
let signaling = null;
let leaving = false;

const peer = new PeerSession({
  rtcConfig,
  media,
  chat,
  ui,
  sendSignal: message => signaling?.send(message),
  onPeerLeft: () => {
    ui.setParticipantCount(1);
    ui.status('A outra pessoa saiu. Aguardando novo participante...');
    ui.notify('A outra pessoa saiu da sala.');
  }
});

async function handleSignal(message) {
  if (message.type === 'peer-joined') ui.setParticipantCount(2);
  switch (message.type) {
    case 'joined':
      ui.setParticipantCount(message.role === 'host' ? 1 : 2);
      ui.status(message.role === 'host' ? 'Aguardando outra pessoa entrar...' : 'Entrando na chamada...');
      return;
    case 'error':
      ui.notify(message.message || 'Erro na sinalização.');
      ui.status(message.message || 'Erro');
      if (!roomId || /não existe|cheia|inválido/i.test(message.message || '')) setTimeout(leaveRoom, 1000);
      return;
    default:
      await peer.handle(message);
  }
}

async function enterRoom(id, roomName = 'TuPi') {
  if (!/^[a-f0-9]{32}$/.test(id)) { ui.notify('Link de sala inválido.'); return; }
  if (!window.isSecureContext) ui.notify('WebRTC requer HTTPS ou localhost para microfone e tela.');
  leaving = false;
  roomId = id;
  document.body.classList.add('in-room');
  ui.$('landing').classList.add('hidden');
  ui.$('featureStrip')?.classList.add('hidden');
  ui.$('room').classList.remove('hidden');
  ui.$('room').classList.remove('chat-open', 'chat-collapsed');
  const chatInitiallyOpen = !window.matchMedia('(max-width: 760px)').matches;
  ui.$('chatToggleBtn').setAttribute('aria-expanded', String(chatInitiallyOpen));
  ui.$('chatToggleBtn').setAttribute('aria-label', chatInitiallyOpen ? 'Ocultar chat' : 'Mostrar chat');
  ui.$('roomTitle').textContent = `Sala ${roomName}`;
  const invite = new URL(location.href);
  invite.searchParams.set('room', id);
  ui.$('inviteUrl').value = invite.href;
  history.replaceState(null, '', `${invite.pathname}${invite.search}`);
  ui.status('Conectando ao servidor de sinalização...');
  signaling = new Signaling(
    message => handleSignal(message),
    () => { if (!leaving) { peer.reset(); ui.status('Servidor desconectado. Recarregue a página.'); } },
    () => { if (!leaving) ui.status('Falha no servidor de sinalização.'); }
  );
  signaling.connect(id);
}

async function createRoom() {
  ui.$('createBtn').disabled = true;
  try {
    const response = await fetch('/api/rooms', { method: 'POST' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Falha ao criar sala.');
    await enterRoom(result.roomId, result.roomName);
  } catch (error) { ui.notify(error.message); }
  finally { ui.$('createBtn').disabled = false; }
}

async function leaveRoom() {
  leaving = true;
  signaling?.close();
  signaling = null;
  peer.reset();
  await media.stop();
  roomId = null;
  ui.$('room').classList.add('hidden');
  ui.$('landing').classList.remove('hidden');
  document.body.classList.remove('in-room');
  ui.$('featureStrip')?.classList.remove('hidden');
  history.replaceState(null, '', location.pathname);
}

ui.$('createBtn').addEventListener('click', createRoom);
async function resolveRoom(value) {
  const response = await fetch(`/api/rooms/${encodeURIComponent(value)}`, { cache: 'no-store' });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Sala não encontrada.');
  return result;
}

ui.$('joinForm').addEventListener('submit', event => {
  event.preventDefault();
  const value = ui.$('roomCode').value.trim();
  if (!value) { ui.notify('Digite o nome da fruta ou cole o link da sala.'); return; }
  let code = value;
  try {
    if (value.includes('://')) code = new URL(value).searchParams.get('room') || '';
  } catch { code = ''; }
  resolveRoom(code.toLowerCase())
    .then(({ roomId: id, roomName }) => enterRoom(id, roomName))
    .catch(error => ui.notify(error.message));
});
ui.$('copyBtn').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(ui.$('inviteUrl').value); ui.notify('Link copiado!'); }
  catch { ui.$('inviteUrl').select(); ui.notify('Selecione e copie o link do convite.'); }
});
ui.$('leaveBtn').addEventListener('click', leaveRoom);
ui.$('chatToggleBtn').addEventListener('click', () => {
  const room = ui.$('room');
  const button = ui.$('chatToggleBtn');
  const mobile = window.matchMedia('(max-width: 760px)').matches;
  let open;
  if (mobile) {
    open = !room.classList.contains('chat-open');
    room.classList.toggle('chat-open', open);
  } else {
    open = room.classList.contains('chat-collapsed');
    room.classList.toggle('chat-collapsed', !open);
  }
  button.setAttribute('aria-expanded', String(open));
  button.setAttribute('aria-label', open ? 'Ocultar chat' : 'Mostrar chat');
});
window.addEventListener('beforeunload', () => { signaling?.close(); void media.stop(); });

const initialRoom = new URLSearchParams(location.search).get('room');
if (initialRoom) resolveRoom(initialRoom.toLowerCase())
  .then(({ roomId: id, roomName }) => enterRoom(id, roomName))
  .catch(error => {
    history.replaceState(null, '', location.pathname);
    ui.notify(error.message);
  });
