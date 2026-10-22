export function createUI() {
  const $ = id => document.getElementById(id);

  function notify(message) {
    $('toast').textContent = message;
    $('toast').classList.remove('hidden');
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => $('toast').classList.add('hidden'), 4300);
  }

  function status(message) { $('status').textContent = message; }
  function setParticipantCount(count) { $('participantCount').textContent = String(count); }

  function setChatConnected(ready) {
    $('chatStatus').textContent = ready ? 'Conectado' : 'Desconectado';
    $('chatStatus').parentElement.classList.toggle('connected', ready);
    $('chatInput').disabled = !ready;
    $('sendBtn').disabled = !ready;
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
    const remoteTrack = remoteStream?.getVideoTracks().find(track => track.readyState === 'live' && !track.muted);
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
    const badge = hasBoth ? 'Duas telas ativas' : hasRemote ? 'Tela do convidado' : hasLocal ? 'Sua tela compartilhada' : 'Aguardando compartilhamento';
    $('screenBadge').innerHTML = '<i></i> ' + badge;
    $('screenBtn').querySelector('span:last-child').textContent = hasLocal ? 'Parar tela' : 'Compartilhar tela';
    $('screenBtn').setAttribute('aria-label', hasLocal ? 'Parar compartilhamento de tela' : 'Compartilhar tela');
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
  }

  function setScreenState(state) {
    if (state === 'denied') $('screenBadge').innerHTML = '<i></i> Permissão de tela negada';
    else if (state === 'error') $('screenBadge').innerHTML = '<i></i> Falha ao compartilhar';
  }

  function setPeerMediaStatus(message) { $('peerMediaStatus').textContent = message; }
  function setRemoteAudio(stream) { $('remoteAudio').srcObject = stream; }
  function clearRoomView() {
    setChatConnected(false);
    setPeerMediaStatus('Aguardando...');
    setRemoteAudio(null);
  }

  return { $, notify, status, setParticipantCount, setChatConnected, addMessage, renderScreen, setMicState, setScreenState, setPeerMediaStatus, setRemoteAudio, clearRoomView };
}
