import { createUI } from './js/ui.js';
import { Signaling } from './js/core/signaling.js';
import { PeerSession } from './js/core/peer.js';
import { Chat } from './js/features/chat.js';
import { Media } from './js/features/media.js';
import { QualitySettings } from './js/core/quality.js';
import { ConnectionStats } from './js/core/stats.js';
import { FileTransfers } from './js/features/files.js';
import { YouTubeTogether } from './js/features/youtube.js';

const ui = createUI();
const chat = new Chat(ui);
const media = new Media(ui);
const quality = new QualitySettings(ui, media);
media.quality = quality;
const files = new FileTransfers(ui, { shouldPause: () => quality.adaptiveLevel > 0 });
const youtube = new YouTubeTogether(ui);
const rtcConfig = { iceServers: [] };

let roomId = null;
let signaling = null;
let leaving = false;

const peer = new PeerSession({
  rtcConfig,
  media,
  chat,
  files,
  youtube,
  ui,
  sendSignal: message => signaling?.send(message),
  onPeerLeft: () => {
    ui.setParticipantCount(1);
    ui.status('A outra pessoa saiu. Aguardando novo participante...');
    ui.notify('A outra pessoa saiu da sala.');
  }
});
const connectionStats = new ConnectionStats(ui, peer, quality);

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
  invite.searchParams.set('room', roomName.toLowerCase());
  ui.$('inviteUrl').value = invite.href;
  history.replaceState(null, '', `${invite.pathname}${invite.search}`);
  ui.status('Conectando ao servidor de sinalização...');
  try {
    const response = await fetch('/api/config', { cache: 'no-store' });
    if (!response.ok) throw new Error('Configuração de rede indisponível.');
    const config = await response.json();
    rtcConfig.iceServers = Array.isArray(config.iceServers) ? config.iceServers : [];
  } catch { ui.notify('Não foi possível carregar a configuração STUN/TURN; a conexão pode falhar em redes restritivas.'); }
  signaling = new Signaling(
    message => handleSignal(message),
    () => { if (!leaving) { peer.reset(); ui.status('Sinalização interrompida. Tentando reconectar…'); } },
    () => { if (!leaving) ui.status('Não foi possível reconectar à sinalização. Verifique a rede e entre novamente.'); }
  );
  signaling.connect(id);
  connectionStats.start();
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
  ui.closeShareSettings();
  connectionStats.stop();
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
const deviceSettings = ui.$('deviceSettings');
const screenSettings = ui.$('screenSettings');
const moreButton = ui.$('moreBtn');
const devicesMenuToggle = ui.$('devicesMenuToggle');
const deviceOptions = ui.$('deviceOptions');
function closeDeviceOptions() {
  deviceOptions.classList.add('hidden');
  devicesMenuToggle.setAttribute('aria-expanded', 'false');
}
deviceSettings.addEventListener('toggle', () => {
  moreButton.setAttribute('aria-expanded', String(deviceSettings.open));
  if (!deviceSettings.open) closeDeviceOptions();
  else screenSettings.open = false;
});
screenSettings.addEventListener('toggle', () => {
  ui.$('screenBtn').setAttribute('aria-expanded', String(screenSettings.open));
  if (screenSettings.open) deviceSettings.open = false;
});
devicesMenuToggle.addEventListener('click', () => {
  const open = deviceOptions.classList.contains('hidden');
  deviceOptions.classList.toggle('hidden', !open);
  devicesMenuToggle.setAttribute('aria-expanded', String(open));
});
document.addEventListener('click', event => {
  if (deviceSettings.open && !deviceSettings.contains(event.target)) deviceSettings.open = false;
  if (screenSettings.open && !screenSettings.contains(event.target)) screenSettings.open = false;
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && screenSettings.open) {
    screenSettings.open = false;
    ui.$('screenBtn').focus();
    return;
  }
  if (event.key === 'Escape' && deviceSettings.open) {
    if (!deviceOptions.classList.contains('hidden')) {
      closeDeviceOptions();
      devicesMenuToggle.focus();
    } else {
      deviceSettings.open = false;
      moreButton.focus();
    }
  }
});
window.addEventListener('beforeunload', () => { signaling?.close(); void media.stop(); });

const initialRoom = new URLSearchParams(location.search).get('room');
if (initialRoom) resolveRoom(initialRoom.toLowerCase())
  .then(({ roomId: id, roomName }) => enterRoom(id, roomName))
  .catch(error => {
    history.replaceState(null, '', location.pathname);
    ui.notify(error.message);
  });
