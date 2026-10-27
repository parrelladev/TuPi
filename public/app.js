import { createUI } from './js/ui.js';
import { Signaling } from './js/core/signaling.js';
import { PeerSession } from './js/core/peer.js';
import { Chat } from './js/features/chat.js';
import { Media } from './js/features/media.js';
import { QualitySettings } from './js/core/quality.js';
import { ConnectionStats } from './js/core/stats.js';
import { FileTransfers } from './js/features/files.js';
import { YouTubeTogether } from './js/features/youtube.js';
import { Voice } from './js/features/voice.js';
import { Presence } from './js/features/presence.js';
import { Speaker } from './js/features/speaker.js';
import { Notifier } from './js/features/notifier.js';
import { ScreenControls } from './js/features/screen.js';
import { initFx, roomIn, enterStagger, transition } from './js/fx.js';
import { initTheme } from './js/theme.js';

initTheme();
initFx();
const ui = createUI();
const chat = new Chat(ui);
const media = new Media(ui);
const voice = new Voice(ui, media);
const presence = new Presence(ui, media, voice);
const quality = new QualitySettings(ui, media);
media.quality = quality;
const files = new FileTransfers(ui, { shouldPause: () => quality.adaptiveLevel > 0 });
const youtube = new YouTubeTogether(ui);
const speaker = new Speaker(ui);
chat.speaker = speaker;
const notifier = new Notifier();
const screenControls = new ScreenControls(ui, media);
const rtcConfig = { iceServers: [] };

// Estado do lobby único: fora (signaling nulo), no lobby sozinho, ou em chamada (inCall).
let signaling = null;
let inCall = false;
let leaving = false;
let lobbyCount = 0;
let fullTimer = null;
let graceTimer = null;
let reconnecting = false;
const PEER_GRACE_MS = 5000;

youtube.onModeChange = open => {
  ui.setScreenLocked(open);
  if (open && media.screenStream) {
    void media.stopSource('screen');
    ui.notify('Compartilhamento de tela encerrado para abrir o YouTube.');
  }
};
ui.$('screenBtn').addEventListener('click', event => {
  if (!ui.isScreenLocked()) return;
  event.preventDefault();
  ui.notify('Feche o YouTube para compartilhar a tela.');
});

const peer = new PeerSession({
  rtcConfig,
  media,
  chat,
  files,
  youtube,
  presence,
  ui,
  sendSignal: message => signaling?.send(message),
  onPeerLeft: () => {
    // Dá um tempo para a pessoa voltar (por exemplo, ao tocar em Reconectar) antes de encerrar a chamada.
    if (!inCall || graceTimer) return;
    ui.status('A outra pessoa desconectou. Aguardando ela voltar…');
    graceTimer = setTimeout(() => { graceTimer = null; ui.notify('A outra pessoa saiu da chamada.'); void endCall(); }, PEER_GRACE_MS);
  }
});
const connectionStats = new ConnectionStats(ui, peer, quality);

// Abre o chat sozinho quando chega mensagem ou pedido de arquivo.
function openChat() {
  const room = ui.$('room');
  const mobile = window.matchMedia('(max-width: 760px)').matches;
  const open = mobile ? room.classList.contains('chat-open') : !room.classList.contains('chat-collapsed');
  if (open) return;
  if (mobile) room.classList.add('chat-open'); else room.classList.remove('chat-collapsed');
  ui.setChatOpen(true);
  chat.markRead();
}
chat.onIncoming = () => {
  if (inCall) openChat();
  notifier.attention('Nova mensagem', `${ui.getRemoteName()} escreveu no chat.`);
};
files.onIncoming = message => {
  void chat.playNotification('file');
  if (inCall) openChat();
  notifier.attention('Arquivo recebido', `${ui.getRemoteName()} quer enviar ${message.name}.`);
};

function clearGrace() { clearTimeout(graceTimer); graceTimer = null; }

function setCount(count) {
  lobbyCount = count;
  ui.setParticipantCount(count);
  if (!inCall) ui.setLobbyState(count >= 2 ? 'call' : 'waiting', count);
}

async function startCall() {
  clearGrace();
  if (inCall) return;
  inCall = true;
  ui.setLobbyState('call', 2);
  await transition(() => {
    document.body.classList.add('in-room');
    ui.$('landing').classList.add('hidden');
    ui.$('room').classList.remove('hidden');
    ui.$('room').classList.remove('chat-open', 'chat-collapsed');
    if (!window.matchMedia('(max-width: 760px)').matches) ui.$('room').classList.add('chat-collapsed');
    chat.markRead();
    ui.setChatOpen(false);
  });
  roomIn(ui.$('room'));
  ui.status('Entrando na chamada...');
  connectionStats.start();
}

// Volta ao lobby (ainda online, esperando alguém). Microfone e câmera continuam como estavam.
async function endCall() {
  clearGrace();
  peer.reset();
  youtube.leave();
  if (media.screenStream) await media.stopSource('screen');
  if (!inCall) return;
  inCall = false;
  connectionStats.stop();
  ui.clearMessages();
  await transition(() => {
    ui.$('room').classList.add('hidden');
    ui.$('landing').classList.remove('hidden');
    document.body.classList.remove('in-room');
  });
  enterStagger(ui.$('landing'));
  if (signaling) ui.setLobbyState('waiting', lobbyCount);
}

async function handleSignal(message) {
  switch (message.type) {
    case 'joined':
      clearTimeout(fullTimer);
      if (message.role === 'guest') { setCount(2); await startCall(); }
      else {
        setCount(1);
        if (inCall) { clearGrace(); peer.reset(); await endCall(); }
        ui.status('Aguardando outra pessoa entrar...');
      }
      return;
    case 'peer-joined':
      setCount(2);
      if (!inCall) {
        void chat.playNotification('arrival');
        notifier.attention('A chamada começou', 'A outra pessoa chegou ao lobby.');
      }
      await startCall();
      await peer.handle(message);
      return;
    case 'lobby':
      lobbyCount = message.count;
      ui.setParticipantCount(message.count);
      if (!inCall) ui.setLobbyState(message.count >= 2 ? 'call' : 'waiting', message.count);
      return;
    case 'error':
      if (message.code === 'full') {
        ui.setLobbyState('full', 2);
        clearTimeout(fullTimer);
        fullTimer = setTimeout(() => signaling?.rejoin(), 4000);
        return;
      }
      if (message.code === 'already') return;
      ui.notify(message.message || 'Erro na sinalização.');
      return;
    default:
      await peer.handle(message);
  }
}

async function joinLobby() {
  if (signaling) return;
  void notifier.requestPermission();
  leaving = false;
  ui.setLobbyState('connecting', 0);
  if (!window.isSecureContext) ui.notify('WebRTC requer HTTPS ou localhost para microfone, câmera e tela.');
  try {
    const response = await fetch('/api/config', { cache: 'no-store' });
    if (!response.ok) throw new Error('Configuração de rede indisponível.');
    const config = await response.json();
    rtcConfig.iceServers = Array.isArray(config.iceServers) ? config.iceServers : [];
  } catch { ui.notify('Não foi possível carregar a configuração STUN/TURN; a conexão pode falhar em redes restritivas.'); }
  if (leaving) return;
  signaling = new Signaling(
    message => handleSignal(message),
    () => {
      if (leaving) return;
      peer.reset();
      ui.status('Sinalização interrompida. Tentando reconectar…');
      if (!inCall) ui.setLobbyState('connecting', 0);
    },
    () => {
      if (leaving) return;
      ui.status('Não foi possível reconectar à sinalização. Verifique a rede e tente de novo.');
      ui.notify('Não foi possível conectar ao lobby. Verifique a rede e tente novamente.');
      void leaveLobby();
    }
  );
  signaling.connect();
}

async function leaveLobby() {
  leaving = true;
  clearTimeout(fullTimer);
  clearGrace();
  ui.closeShareSettings();
  connectionStats.stop();
  signaling?.close();
  signaling = null;
  peer.reset();
  youtube.leave();
  await media.stop();
  ui.clearMessages();
  lobbyCount = 0;
  if (inCall) {
    inCall = false;
    await transition(() => {
      ui.$('room').classList.add('hidden');
      ui.$('landing').classList.remove('hidden');
      document.body.classList.remove('in-room');
    });
    enterStagger(ui.$('landing'));
  }
  ui.setLobbyState('idle', 0);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForReconnect(timeout) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (!inCall || leaving) return 'left';
    if (ui.$('chatStatus').textContent === 'Conectado') return 'connected';
    await sleep(300);
  }
  return 'timeout';
}

async function reconnectCall() {
  if (!inCall || !signaling || reconnecting) return;
  reconnecting = true;
  ui.setReconnectBusy(true);
  try {
    ui.status('Reconectando…');
    ui.notify('Tentando reconectar…');
    peer.reset();
    await signaling.reconnect();
    const result = await waitForReconnect(20000);
    if (result === 'connected') ui.notify('Reconectado!');
    else if (result === 'left') ui.notify('A outra pessoa não está mais no lobby.');
    else { ui.status('Não foi possível reconectar.'); ui.notify('Não foi possível reconectar. Tente de novo ou saia e entre no lobby outra vez.'); }
  } finally {
    reconnecting = false;
    ui.setReconnectBusy(false);
  }
}

ui.$('lobbyJoinBtn').addEventListener('click', () => { void joinLobby(); });
ui.$('lobbyLeaveBtn').addEventListener('click', () => { void leaveLobby(); });
ui.$('leaveBtn').addEventListener('click', () => { void leaveLobby(); });
ui.$('reconnectBtn').addEventListener('click', () => { void reconnectCall(); });

// Os seletores de dispositivo do lobby espelham os do menu "Mais" da chamada.
for (const [lobbyId, mainId] of [['lobbyMicSelect', 'microphoneSelect'], ['lobbyCameraSelect', 'cameraSelect']]) {
  const lobbySelect = ui.$(lobbyId);
  const mainSelect = ui.$(mainId);
  lobbySelect.addEventListener('change', () => {
    mainSelect.value = lobbySelect.value;
    mainSelect.dispatchEvent(new Event('change'));
  });
  mainSelect.addEventListener('change', () => { lobbySelect.value = mainSelect.value; });
}
ui.$('lobbyName').addEventListener('keydown', event => {
  if (event.key === 'Enter') { event.preventDefault(); event.target.blur(); if (!signaling) void joinLobby(); }
});

ui.$('chatToggleBtn').addEventListener('click', () => {
  const room = ui.$('room');
  const mobile = window.matchMedia('(max-width: 760px)').matches;
  let open;
  if (mobile) {
    open = !room.classList.contains('chat-open');
    room.classList.toggle('chat-open', open);
  } else {
    open = room.classList.contains('chat-collapsed');
    room.classList.toggle('chat-collapsed', !open);
  }
  ui.setChatOpen(open);
  if (open) chat.markRead();
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
const linkDialog = ui.$('linkDialog');
let pendingLink = '';
ui.$('messages').addEventListener('click', event => {
  const link = event.target instanceof Element ? event.target.closest('a.chat-link') : null;
  if (!link) return;
  event.preventDefault();
  const url = new URL(link.href);
  pendingLink = url.href;
  ui.$('linkHost').textContent = url.hostname;
  ui.$('linkUrl').textContent = url.href;
  linkDialog.showModal();
  ui.$('linkCancel').focus();
});
ui.$('linkCancel').addEventListener('click', () => linkDialog.close());
ui.$('linkOpen').addEventListener('click', () => {
  linkDialog.close();
  if (pendingLink) window.open(pendingLink, '_blank', 'noopener,noreferrer');
  pendingLink = '';
});
linkDialog.addEventListener('click', event => { if (event.target === linkDialog) linkDialog.close(); });
const shortcutsDialog = ui.$('shortcutsDialog');
ui.$('shortcutsMenuBtn').addEventListener('click', () => {
  deviceSettings.open = false;
  if (!shortcutsDialog.open) shortcutsDialog.showModal();
});
ui.$('shortcutsClose').addEventListener('click', () => shortcutsDialog.close());
shortcutsDialog.addEventListener('click', event => { if (event.target === shortcutsDialog) shortcutsDialog.close(); });
// Atalhos: M microfone, V câmera, C chat, F tela cheia (ignorados ao digitar).
document.addEventListener('keydown', event => {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.repeat) return;
  const target = event.target;
  if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
  const key = event.key.toLowerCase();
  if (key === 'm') ui.$('micBtn').click();
  else if (key === 'v') ui.$('cameraBtn').click();
  else if (key === 'c' && inCall) ui.$('chatToggleBtn').click();
  else if (key === 'f' && inCall) void screenControls.toggleFullscreen();
  else return;
  event.preventDefault();
});
window.addEventListener('beforeunload', () => { signaling?.close(); void media.stop(); });
