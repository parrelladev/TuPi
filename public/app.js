'use strict';
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const initialRoom = params.get('room');
const rtcConfig = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  // Production: add your own TURN service for restrictive NATs:
  // { urls: 'turn:turn.example.com:3478', username: '...', credential: '...' }
};
let roomId = null;
let ws = null;
let pc = null;
let audioSender = null;
let videoSender = null;
let dataChannel = null;
let micStream = null;
let screenStream = null;
let remoteAudioStream = new MediaStream();
let remoteScreenStream = new MediaStream();
let pendingCandidates = [];
let peerPresent = false;
let leaving = false;

function notify(message) {
  $('toast').textContent = message;
  $('toast').classList.remove('hidden');
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => $('toast').classList.add('hidden'), 4300);
}
function status(message) { $('status').textContent = message; }
function signal(data) { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); }
function setChatConnected(ready) {
  $('chatStatus').textContent = ready ? '● Conectado P2P' : 'Desconectado';
  $('chatInput').disabled = !ready;
  $('sendBtn').disabled = !ready;
}
function addMessage(who, text, mine = false) {
  const el = document.createElement('div');
  el.className = `message${mine ? ' mine' : ''}`;
  const label = document.createElement('small');
  label.textContent = who;
  const body = document.createElement('div');
  body.textContent = text;
  el.append(label, body);
  $('messages').append(el);
  $('messages').scrollTop = $('messages').scrollHeight;
}
function renderScreen() {
  const remoteTrack = remoteScreenStream.getVideoTracks().find(t => t.readyState === 'live' && !t.muted);
  const localTrack = screenStream?.getVideoTracks().find(t => t.readyState === 'live');
  const stream = remoteTrack ? remoteScreenStream : localTrack ? screenStream : null;
  if ($('screenVideo').srcObject !== stream) $('screenVideo').srcObject = stream;
  $('screenVideo').classList.toggle('hidden', !stream);
  $('screenPlaceholder').classList.toggle('hidden', !!stream);
  $('screenBadge').textContent = remoteTrack ? 'Tela do convidado' : localTrack ? 'Sua tela' : 'Inativa';
  $('screenBtn').textContent = localTrack ? '■ Parar transmissão' : '▣ Compartilhar tela';
}
function stopLocalTracks() {
  if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
  if (screenStream) { screenStream.getTracks().forEach(t => t.stop()); screenStream = null; }
  $('micBtn').textContent = '🎙 Ativar microfone';
  $('localMediaStatus').textContent = 'Microfone desligado';
  renderScreen();
}
function resetPeer() {
  setChatConnected(false);
  if (dataChannel) { dataChannel.onmessage = null; dataChannel.close(); dataChannel = null; }
  if (pc) { pc.ontrack = null; pc.onicecandidate = null; pc.close(); pc = null; }
  audioSender = null; videoSender = null; pendingCandidates = [];
  remoteAudioStream = new MediaStream();
  remoteScreenStream = new MediaStream();
  $('remoteAudio').srcObject = null;
  $('peerMediaStatus').textContent = 'Aguardando...';
  renderScreen();
}
function initChannel(channel) {
  dataChannel = channel;
  channel.onopen = () => setChatConnected(true);
  channel.onclose = () => setChatConnected(false);
  channel.onerror = () => notify('O canal de mensagens apresentou um erro.');
  channel.onmessage = (event) => {
    if (typeof event.data === 'string' && event.data.length <= 4000) addMessage('Convidado', event.data);
  };
}
function createPeer(initiator) {
  const earlyCandidates = pendingCandidates.slice();
  resetPeer();
  pendingCandidates = earlyCandidates;
  pc = new RTCPeerConnection(rtcConfig);
  audioSender = pc.addTransceiver('audio', { direction: 'sendrecv' }).sender;
  videoSender = pc.addTransceiver('video', { direction: 'sendrecv' }).sender;
  if (micStream) audioSender.replaceTrack(micStream.getAudioTracks()[0]).catch(console.error);
  if (screenStream) videoSender.replaceTrack(screenStream.getVideoTracks()[0]).catch(console.error);
  pc.onicecandidate = (event) => { if (event.candidate) signal({ type: 'ice', candidate: event.candidate }); };
  pc.ontrack = (event) => {
    const track = event.track;
    if (track.kind === 'audio') {
      remoteAudioStream.addTrack(track);
      $('remoteAudio').srcObject = remoteAudioStream;
      $('remoteAudio').play().catch(() => notify('Clique na página para permitir a reprodução do áudio.'));
      $('peerMediaStatus').textContent = 'Áudio conectado';
    } else {
      remoteScreenStream.addTrack(track);
      track.onunmute = renderScreen;
      track.onmute = renderScreen;
      track.onended = renderScreen;
      renderScreen();
    }
  };
  pc.onconnectionstatechange = () => {
    if (!pc) return;
    if (pc.connectionState === 'connected') status('● Conectado diretamente (ou via relay TURN)');
    if (pc.connectionState === 'failed') status('Falha na conexão: pode ser necessário um servidor TURN.');
    if (pc.connectionState === 'disconnected') status('Conexão interrompida.');
  };
  pc.ondatachannel = (event) => initChannel(event.channel);
  if (initiator) initChannel(pc.createDataChannel('messages', { ordered: true }));
  return pc;
}
async function handleSignal(msg) {
  switch (msg.type) {
    case 'joined':
      status(msg.role === 'host' ? 'Aguardando outra pessoa entrar...' : 'Entrando na chamada...');
      break;
    case 'peer-joined': {
      peerPresent = true;
      status('Negociando conexão...');
      const peer = createPeer(true);
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      signal({ type: 'offer', sdp: peer.localDescription });
      break;
    }
    case 'offer': {
      peerPresent = true;
      status('Negociando conexão...');
      const peer = createPeer(false);
      await peer.setRemoteDescription(msg.sdp);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      signal({ type: 'answer', sdp: peer.localDescription });
      await flushIce();
      break;
    }
    case 'answer':
      if (pc) { await pc.setRemoteDescription(msg.sdp); await flushIce(); }
      break;
    case 'ice':
      if (!msg.candidate) break;
      if (pc?.remoteDescription) await pc.addIceCandidate(msg.candidate);
      else pendingCandidates.push(msg.candidate);
      break;
    case 'peer-left':
      peerPresent = false;
      resetPeer();
      status('A outra pessoa saiu. Aguardando novo participante...');
      notify('A outra pessoa saiu da sala.');
      break;
    case 'error':
      notify(msg.message || 'Erro na sinalização.');
      status(msg.message || 'Erro');
      if (!roomId || /não existe|cheia|inválido/.test(msg.message || '')) setTimeout(leaveRoom, 1000);
      break;
  }
}
async function flushIce() {
  while (pc?.remoteDescription && pendingCandidates.length) {
    await pc.addIceCandidate(pendingCandidates.shift());
  }
}
async function enterRoom(id) {
  if (!/^[a-f0-9]{32}$/.test(id)) { notify('Link de sala inválido.'); return; }
  if (!window.isSecureContext) { notify('WebRTC requer HTTPS ou localhost para microfone e tela.'); }
  leaving = false;
  roomId = id;
  $('landing').classList.add('hidden');
  $('room').classList.remove('hidden');
  $('roomTitle').textContent = `Sala ${id.slice(0, 8)}`;
  const invite = new URL(location.href);
  invite.searchParams.set('room', id);
  $('inviteUrl').value = invite.href;
  history.replaceState(null, '', `${invite.pathname}${invite.search}`);
  status('Conectando ao servidor de sinalização...');
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/signal`);
  ws.onopen = () => signal({ type: 'join', roomId: id });
  ws.onmessage = async (event) => {
    try { await handleSignal(JSON.parse(event.data)); }
    catch (err) { console.error(err); notify('Erro ao estabelecer conexão WebRTC.'); }
  };
  ws.onerror = () => { if (!leaving) status('Falha no servidor de sinalização.'); };
  ws.onclose = () => { if (!leaving) { resetPeer(); status('Servidor desconectado. Recarregue a página.'); } };
}
async function createRoom() {
  $('createBtn').disabled = true;
  try {
    const response = await fetch('/api/rooms', { method: 'POST' });
    if (!response.ok) throw new Error('Falha ao criar sala.');
    const { roomId: id } = await response.json();
    await enterRoom(id);
  } catch (err) { notify(err.message); }
  finally { $('createBtn').disabled = false; }
}
function leaveRoom() {
  leaving = true;
  ws?.close(); ws = null;
  resetPeer();
  stopLocalTracks();
  roomId = null; peerPresent = false;
  $('room').classList.add('hidden');
  $('landing').classList.remove('hidden');
  history.replaceState(null, '', location.pathname);
}
async function toggleMic() {
  if (micStream) {
    await audioSender?.replaceTrack(null);
    micStream.getTracks().forEach(t => t.stop());
    micStream = null;
    $('micBtn').textContent = '🎙 Ativar microfone';
    $('localMediaStatus').textContent = 'Microfone desligado';
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
    micStream = stream;
    stream.getAudioTracks()[0].onended = () => { if (micStream === stream) toggleMic(); };
    if (audioSender) await audioSender.replaceTrack(stream.getAudioTracks()[0]);
    $('micBtn').textContent = '🔇 Desligar microfone';
    $('localMediaStatus').textContent = 'Microfone ligado';
  } catch (err) { notify(`Não foi possível acessar o microfone: ${err.message}`); }
}
async function toggleScreen() {
  if (screenStream) {
    await videoSender?.replaceTrack(null);
    screenStream.getTracks().forEach(t => t.stop());
    screenStream = null;
    renderScreen();
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 20 }, audio: false });
    screenStream = stream;
    stream.getVideoTracks()[0].onended = () => { if (screenStream === stream) toggleScreen(); };
    if (videoSender) await videoSender.replaceTrack(stream.getVideoTracks()[0]);
    renderScreen();
  } catch (err) { if (err.name !== 'NotAllowedError') notify(`Falha ao compartilhar tela: ${err.message}`); }
}
$('createBtn').addEventListener('click', createRoom);
$('copyBtn').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('inviteUrl').value); notify('Link copiado!'); }
  catch { $('inviteUrl').select(); notify('Selecione e copie o link do convite.'); }
});
$('leaveBtn').addEventListener('click', leaveRoom);
$('micBtn').addEventListener('click', toggleMic);
$('screenBtn').addEventListener('click', toggleScreen);
$('chatForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const text = $('chatInput').value.trim();
  if (!text || dataChannel?.readyState !== 'open') return;
  try { dataChannel.send(text); addMessage('Você', text, true); $('chatInput').value = ''; }
  catch { notify('Não foi possível enviar a mensagem.'); }
});
window.addEventListener('beforeunload', () => { ws?.close(); stopLocalTracks(); });
if (initialRoom) enterRoom(initialRoom);
