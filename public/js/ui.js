import { pop, swap, toastProgress } from './fx.js';

const TOAST_MS = 4300;

export function createUI() {
  const $ = id => document.getElementById(id);
  let effectiveScreenQuality = '';
  let unreadChatCount = 0;
  let remoteFlags = { camera: true, screen: true };
  let lastCamera = [null, null];
  let lastScreen = [null, null];
  const localMediaListeners = [];
  const emitLocalMedia = () => localMediaListeners.forEach(listener => listener());
  const onLocalMedia = listener => { localMediaListeners.push(listener); };

  function setRemoteFlags(flags) {
    if (flags.camera === remoteFlags.camera && flags.screen === remoteFlags.screen) return;
    remoteFlags = { ...flags };
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
  let screenLocked = false;
  function setScreenLocked(locked) {
    screenLocked = locked;
    const button = $('screenBtn');
    button.classList.toggle('is-off', locked);
    button.setAttribute('aria-disabled', String(locked));
    button.title = locked ? 'Feche o YouTube para compartilhar a tela' : '';
    if (locked) closeShareSettings();
  }
  const isScreenLocked = () => screenLocked;

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

  function addMessage(who, text, mine = false) {
    const element = document.createElement('div');
    element.className = 'message' + (mine ? ' mine' : '');
    const label = document.createElement('small');
    label.textContent = who;
    const body = document.createElement('div');
    body.textContent = text;
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
    let badge = hasBoth ? 'Duas telas ativas' : hasRemote ? 'Tela do convidado' : hasLocal ? 'Sua tela compartilhada' : 'Aguardando compartilhamento';
    if (hasLocal && effectiveScreenQuality) badge += ` · ${effectiveScreenQuality}`;
    const badgeChanged = $('screenBadge').textContent.trim() !== badge;
    $('screenBadge').innerHTML = '<i></i> ' + badge;
    if (badgeChanged) swap($('screenBadge'));
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

  function setDevices(devices) {
    for (const [kind, id, label] of [['audioinput', 'microphoneSelect', 'Microfone'], ['videoinput', 'cameraSelect', 'Câmera']]) {
      const select = $(id); const current = select.value;
      const available = devices.filter(device => device.kind === kind);
      select.replaceChildren(new Option(`Padrão (${label.toLowerCase()})`, ''));
      available.forEach((device, index) => select.add(new Option(device.label || `${label} ${index + 1}`, device.deviceId)));
      if ([...select.options].some(option => option.value === current)) select.value = current;
      select.disabled = available.length === 0;
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

  function setScreenState(state) {
    if (state === 'denied') $('screenBadge').innerHTML = '<i></i> Permissão de tela negada';
    else if (state === 'error') $('screenBadge').innerHTML = '<i></i> Falha ao compartilhar';
  }

  function setSourceState(source, state) {
    if (source === 'microfone') setMicState(state);
    if (source === 'câmera') notify(state === 'denied' ? 'Permita o acesso à câmera nas configurações do navegador.' : 'Não foi possível ativar a câmera.');
    if (source === 'tela') setScreenState(state);
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
    effectiveScreenQuality = message.replace(/^Tela:\s*/, '');
    if (!$('localMediaTile').classList.contains('hidden')) {
      const badge = $('screenBadge');
      const indicator = document.createElement('i');
      badge.replaceChildren(indicator, document.createTextNode(` Sua tela compartilhada · ${effectiveScreenQuality}`));
    }
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
    remoteFlags = { camera: true, screen: true };
    setChatConnected(false);
    setPeerMediaStatus('Aguardando...');
    setRemoteAudio(null);
    renderCamera(null, new MediaStream());
    setAudioPlaybackBlocked(false);
  }

  return { $, onLocalMedia, setRemoteFlags, setReconnectBusy, setScreenLocked, isScreenLocked, notify, status, setParticipantCount, setChatConnected, setChatUnread, setChatOpen, setChatSoundEnabled, addMessage, renderScreen, renderCamera, setDevices, setSourceState, setMicState, setScreenState, setPeerMediaStatus, setRemoteAudio, setAudioPlaybackBlocked, setEffectiveQuality, setConnectionDiagnostics, setCodecCapabilities, closeShareSettings, clearRoomView };
}
