import { pop, toastProgress } from './fx.js';

const TOAST_MS = 4300;

export function createUI() {
  const $ = id => document.getElementById(id);
  let unreadChatCount = 0;
  let remoteFlags = { camera: true, screen: true, screenAudio: false };
  let lastCamera = [null, null];
  let lastScreen = [null, null];
  const localMediaListeners = [];
  const emitLocalMedia = () => localMediaListeners.forEach(listener => listener());
  const onLocalMedia = listener => { localMediaListeners.push(listener); };

  function setRemoteFlags(flags) {
    const next = { screenAudio: false, ...flags };
    if (next.camera === remoteFlags.camera && next.screen === remoteFlags.screen && next.screenAudio === remoteFlags.screenAudio) return;
    remoteFlags = next;
    renderCamera(...lastCamera);
    renderScreen(...lastScreen);
  }

  function closeShareSettings() { $('screenSettings').open = false; }

  function notify(message) {
    $('toastText').textContent = message;
    $('toast').classList.remove('hidden');
    toastProgress($('toastBar'), TOAST_MS);
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => $('toast').classList.add('hidden'), TOAST_MS);
  }

  function status(message) {
    $('status').textContent = message;
    const tone = /erro|interrompida|instável|não foi|falha|inválid/i.test(message) ? 'bad' : /conectando|aguardando|entrando|saiu|reconectar/i.test(message) ? 'wait' : 'ok';
    $('status').closest('.status-chip').dataset.tone = tone;
  }
  const getRemoteFlags = () => remoteFlags;
  async function playScreenAudio() {
    const element = $('screenAudio');
    if (!element.srcObject) return;
    try { await element.play(); $('screenAudioPlayBtn').classList.add('hidden'); }
    catch { $('screenAudioPlayBtn').classList.remove('hidden'); }
  }
  function setScreenAudio(stream) {
    const element = $('screenAudio');
    if (element.srcObject !== stream) element.srcObject = stream;
    $('screenAudioPlayBtn').classList.add('hidden');
    if (stream) void playScreenAudio();
  }

  const transcript = [];
  const getTranscript = () => transcript.slice();
  function clearMessages() { transcript.length = 0; $('messages').querySelectorAll('.message').forEach(message => message.remove()); }

  let remoteName = 'Convidado';
  const setRemoteName = name => { remoteName = name; };
  const getRemoteName = () => remoteName;

  // Estado do lobby: idle (fora), connecting, waiting (sozinho), full (cheio), call (em chamada).
  function setLobbyState(state, count = 0) {
    const messages = {
      idle: 'Você ainda não entrou no lobby.',
      connecting: 'Entrando no lobby…',
      waiting: 'Você está no lobby. A chamada começa quando a outra pessoa chegar.',
      full: 'O lobby está cheio agora. Tentando de novo…',
      call: 'Chamada em andamento.'
    };
    $('lobbyStatus').dataset.state = state;
    $('lobbyStatusText').textContent = messages[state] || '';
    $('lobbyCount').textContent = `${count}/2`;
    const joined = state !== 'idle';
    $('lobbyJoinBtn').classList.toggle('hidden', joined);
    $('lobbyLeaveBtn').classList.toggle('hidden', !joined);
  }

  function setReconnectBusy(busy) {
    const button = $('reconnectBtn');
    button.dataset.busy = String(busy);
    button.disabled = busy;
    button.setAttribute('aria-label', busy ? 'Reconectando…' : 'Tentar reconectar');
  }
  function setParticipantCount(count) {
    const element = $('participantCount');
    const text = String(count);
    if (element.textContent === text) return;
    element.textContent = text;
    pop(element);
  }

  function setChatConnected(ready) {
    $('chatStatus').textContent = ready ? 'Conectado' : 'Desconectado';
    $('chatStatus').parentElement.classList.toggle('connected', ready);
    $('chatInput').disabled = !ready;
    $('sendBtn').disabled = !ready;
  }

  function setChatUnread(count) {
    const button = $('chatToggleBtn');
    const badge = $('chatUnreadBadge');
    const unread = Boolean(count);
    unreadChatCount = unread;
    badge.textContent = '';
    badge.classList.toggle('hidden', !unread);
    const open = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-label', `${open ? 'Ocultar' : 'Mostrar'} chat${unread ? ', há mensagem nova' : ''}`);
  }

  function setChatOpen(open) {
    $('chatToggleBtn').setAttribute('aria-expanded', String(open));
    setChatUnread(unreadChatCount);
  }

  function setChatSoundEnabled(enabled) {
    const button = $('chatSoundToggle');
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('aria-label', `${enabled ? 'Silenciar' : 'Ativar'} som de novas mensagens`);
    button.title = `${enabled ? 'Silenciar' : 'Ativar'} som de novas mensagens`;
    button.classList.toggle('enabled', enabled);
  }

  // Transforma http(s) em links (href só definido após validar com URL); o clique é confirmado em app.js.
  function linkify(text) {
    const nodes = [];
    let last = 0;
    for (const match of text.matchAll(/https?:\/\/[^\s<>"]+/gi)) {
      const raw = match[0].replace(/[.,;:!?)\]}'"]+$/, '');
      let url;
      try { url = new URL(raw); } catch { continue; }
      if (!['http:', 'https:'].includes(url.protocol)) continue;
      if (match.index > last) nodes.push(text.slice(last, match.index));
      const link = document.createElement('a');
      link.className = 'chat-link';
      link.href = url.href;
      link.rel = 'noopener noreferrer';
      link.append(raw, Object.assign(document.createElement('i'), { className: 'ph ph-arrow-up-right' }));
      nodes.push(link);
      last = match.index + raw.length;
    }
    if (last < text.length) nodes.push(text.slice(last));
    return nodes;
  }

  function addMessage(who, text, mine = false) {
    transcript.push({ who, text, mine, time: Date.now() });
    const element = document.createElement('div');
    element.className = 'message' + (mine ? ' mine' : '');
    const label = document.createElement('small');
    label.textContent = who;
    const body = document.createElement('div');
    body.append(...linkify(text));
    element.append(label, body);
    $('messages').append(element);
    $('messages').scrollTop = $('messages').scrollHeight;
  }

  function renderScreen(localStream, remoteStream) {
    lastScreen = [localStream, remoteStream];
    const remoteTrack = remoteFlags.screen ? remoteStream?.getVideoTracks().find(track => track.readyState === 'live' && !track.muted) : null;
    const localTrack = localStream?.getVideoTracks().find(track => track.readyState === 'live');
    const hasLocal = !!localTrack;
    const hasRemote = !!remoteTrack;
    const hasBoth = hasLocal && hasRemote;
    const localVideoStream = hasLocal ? localStream : null;
    const remoteVideoStream = hasRemote ? remoteStream : null;
    if ($('localScreenVideo').srcObject !== localVideoStream) $('localScreenVideo').srcObject = localVideoStream;
    if ($('screenVideo').srcObject !== remoteVideoStream) $('screenVideo').srcObject = remoteVideoStream;
    $('localMediaTile').classList.toggle('hidden', !hasLocal);
    $('remoteMediaTile').classList.toggle('hidden', !hasRemote);
    $('screenViews').classList.toggle('dual', hasBoth);
    $('screenViews').classList.toggle('has-media', hasLocal || hasRemote);
    $('screenViews').parentElement.classList.toggle('active', hasLocal || hasRemote);
    $('screenPlaceholder').classList.toggle('hidden', hasLocal || hasRemote);
    $('screenBtn').querySelector('span:last-child').textContent = hasLocal ? 'Parar tela' : 'Compartilhar tela';
    $('screenBtn').setAttribute('aria-label', hasLocal ? 'Parar compartilhamento de tela' : 'Compartilhar tela');
    emitLocalMedia();
  }

  function renderCamera(localStream, remoteStream) {
    lastCamera = [localStream, remoteStream];
    const localTrack = localStream?.getVideoTracks().find(track => track.readyState === 'live');
    const remoteTrack = remoteFlags.camera ? remoteStream?.getVideoTracks().find(track => track.readyState === 'live' && !track.muted) : null;
    const local = localTrack ? localStream : null;
    const remote = remoteTrack ? remoteStream : null;
    $('localCameraVideo').srcObject = local;
    $('remoteCameraVideo').srcObject = remote;
    $('cardLocalVideo').srcObject = local;
    $('cardRemoteVideo').srcObject = remote;
    $('cardLocalVideo').classList.toggle('hidden', !local);
    $('cardRemoteVideo').classList.toggle('hidden', !remote);
    $('personLocal').classList.toggle('has-video', Boolean(local));
    $('lobbyPreviewVideo').srcObject = local;
    $('lobbyPreviewVideo').classList.toggle('hidden', !local);
    $('lobbyPreview').dataset.cam = local ? 'on' : 'off';
    $('lobbyCamBtn').setAttribute('aria-pressed', String(Boolean(local)));
    $('lobbyCamBtn').setAttribute('aria-label', local ? 'Desligar câmera' : 'Ativar câmera');
    $('personRemote').classList.toggle('has-video', Boolean(remote));
    $('localCameraTile').classList.toggle('hidden', !local);
    $('remoteCameraTile').classList.toggle('hidden', !remote);
    $('cameraViews').classList.toggle('hidden', !local && !remote);
    emitLocalMedia();
    const enabled = !!local;
    $('cameraBtn').classList.toggle('mic-enabled', enabled);
    $('cameraBtn').setAttribute('aria-pressed', String(enabled));
    $('cameraBtn').setAttribute('aria-label', enabled ? 'Desligar câmera' : 'Ativar câmera');
    $('cameraBtn').querySelector('span:last-child').textContent = enabled ? 'Parar câmera' : 'Câmera';
  }

  let preferredSpeaker = null;
  const setPreferredSpeaker = id => { preferredSpeaker = id; };

  function setDevices(devices) {
    for (const [kind, id, label] of [['audioinput', 'microphoneSelect', 'Microfone'], ['videoinput', 'cameraSelect', 'Câmera'], ['audiooutput', 'speakerSelect', 'Alto-falante']]) {
      const select = $(id); const current = id === 'speakerSelect' && preferredSpeaker !== null ? preferredSpeaker : select.value;
      const available = devices.filter(device => device.kind === kind);
      const mirror = { audioinput: $('lobbyMicSelect'), videoinput: $('lobbyCameraSelect') }[kind];
      for (const target of [select, mirror].filter(Boolean)) {
        target.replaceChildren(new Option(`Padrão (${label.toLowerCase()})`, ''));
        available.forEach((device, index) => target.add(new Option(device.label || `${label} ${index + 1}`, device.deviceId)));
        if ([...target.options].some(option => option.value === current)) target.value = current;
        target.disabled = available.length === 0;
      }
    }
  }

  function setMicState(state) {
    const button = $('micBtn');
    const enabled = state === 'on';
    button.classList.toggle('mic-enabled', enabled);
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('aria-label', enabled ? 'Desligar microfone' : 'Ativar microfone');
    const message = state === 'on' ? 'Microfone ligado' : state === 'denied' ? 'Microfone sem permissão' : state === 'error' ? 'Falha ao ativar microfone' : 'Microfone desligado';
    if (state === 'denied') notify('Permita o acesso ao microfone nas configurações do navegador.');
    else if (state === 'error') notify('Não foi possível ativar o microfone.');
    emitLocalMedia();
  }

  function setSourceState(source, state) {
    if (source === 'microfone') setMicState(state);
    if (source === 'câmera') notify(state === 'denied' ? 'Permita o acesso à câmera nas configurações do navegador.' : 'Não foi possível ativar a câmera.');
  }

  function setPeerMediaStatus(message) { $('peerMediaStatus').textContent = message; }
  function setRemoteAudio(stream) { $('remoteAudio').srcObject = stream; }
  function setAudioPlaybackBlocked(blocked) { $('enableAudioBtn').classList.toggle('hidden', !blocked); }
  function setEffectiveQuality(message) {
    let element = $('effectiveScreenQuality');
    if (!element) {
      element = document.createElement('span');
      element.id = 'effectiveScreenQuality';
      $('qualityDiagnostics').prepend(element);
    }
    element.textContent = message;
  }
  function setConnectionDiagnostics(message) {
    let element = $('connectionDiagnostics');
    if (!element) {
      element = document.createElement('span');
      element.id = 'connectionDiagnostics';
      $('qualityDiagnostics').append(element);
    }
    element.textContent = message;
  }
  // Indicador de qualidade no cabeçalho: nível 0 (sem dados) a 4 (ótima) e detalhes no popover.
  const QUALITY_LABELS = ['Sem dados', 'Ruim', 'Razoável', 'Boa', 'Ótima'];
  function setConnectionQuality(info) {
    const level = info ? info.level : 0;
    const button = $('signalBtn');
    button.dataset.level = String(level);
    const summary = `Conexão: ${QUALITY_LABELS[level].toLowerCase()}${info && Number.isFinite(info.rtt) ? ` (${Math.round(info.rtt)} ms)` : ''}`;
    button.setAttribute('aria-label', summary);
    button.title = summary;
    $('signalTitle').textContent = `Conexão: ${QUALITY_LABELS[level]}`;
    const list = $('signalList');
    list.replaceChildren();
    for (const [key, value] of info?.rows || []) {
      const row = document.createElement('div');
      const term = document.createElement('dt');
      const detail = document.createElement('dd');
      term.textContent = key;
      detail.textContent = value;
      row.append(term, detail);
      list.append(row);
    }
    $('signalTip').textContent = info?.tip || '';
  }
  function setCodecCapabilities(message) {
    let element = $('codecCapabilities');
    if (!element) {
      element = document.createElement('span');
      element.id = 'codecCapabilities';
      $('qualityDiagnostics').append(element);
    }
    element.textContent = `Codecs disponíveis: ${message}`;
  }
  function clearRoomView() {
    remoteFlags = { camera: true, screen: true, screenAudio: false };
    setChatConnected(false);
    setPeerMediaStatus('Aguardando...');
    setRemoteAudio(null);
    renderCamera(null, new MediaStream());
    setAudioPlaybackBlocked(false);
  }

  return { $, onLocalMedia, setPreferredSpeaker, setRemoteFlags, getRemoteFlags, setScreenAudio, playScreenAudio, setRemoteName, getRemoteName, setLobbyState, clearMessages, setReconnectBusy, notify, status, setParticipantCount, setChatConnected, setChatUnread, setChatOpen, setChatSoundEnabled, addMessage, renderScreen, renderCamera, setDevices, setSourceState, setMicState, setPeerMediaStatus, setRemoteAudio, setAudioPlaybackBlocked, setEffectiveQuality, setConnectionDiagnostics, setConnectionQuality, getTranscript, setCodecCapabilities, closeShareSettings, clearRoomView };
}
