export class PeerSession {
  constructor({ rtcConfig, media, chat, files, youtube, presence, ui, sendSignal, onPeerLeft }) {
    Object.assign(this, { rtcConfig, media, chat, files, youtube, presence, ui, sendSignal, onPeerLeft });
    this.pc = null;
    this.audioTransceiver = this.cameraTransceiver = this.screenTransceiver = null;
    this.pendingCandidates = [];
    this.restartTimer = null;
    this.restartingIce = false;
    this.isInitiator = false;
    this.remoteAudioStream = new MediaStream();
    this.remoteCameraStream = new MediaStream();
    this.remoteScreenStream = new MediaStream();
    this.ui.$('enableAudioBtn').addEventListener('click', () => { void this.playRemoteAudio(); });
  }

  async playRemoteAudio() {
    const audio = this.ui.$('remoteAudio');
    if (!audio.srcObject) return;
    try { await audio.play(); this.ui.setAudioPlaybackBlocked(false); }
    catch (error) { const blocked = error.name === 'NotAllowedError'; this.ui.setAudioPlaybackBlocked(blocked); if (!blocked) this.ui.notify('Não foi possível reproduzir o áudio recebido.'); }
  }

  async create(initiator) {
    const earlyCandidates = this.pendingCandidates.slice();
    this.reset(); this.pendingCandidates = earlyCandidates;
    const pc = new RTCPeerConnection(this.rtcConfig); this.pc = pc; this.isInitiator = initiator;
    if (initiator) {
      this.audioTransceiver = pc.addTransceiver('audio', { direction: 'sendrecv' });
      this.cameraTransceiver = pc.addTransceiver('video', { direction: 'sendrecv' });
      this.screenTransceiver = pc.addTransceiver('video', { direction: 'sendrecv' });
      await this.media.attachSenders(this.audioTransceiver.sender, this.cameraTransceiver.sender, this.screenTransceiver.sender);
    }
    pc.onicecandidate = event => { if (event.candidate && this.pc === pc) this.sendSignal({ type: 'ice', candidate: event.candidate }); };
    pc.ontrack = event => this.handleTrack(event, pc);
    pc.onconnectionstatechange = () => {
      if (this.pc !== pc) return;
      clearTimeout(this.restartTimer);
      if (pc.connectionState === 'connected') this.ui.status('Conectado diretamente (ou via relay TURN)');
      if (pc.connectionState === 'failed') { this.ui.status('Conexão interrompida; tentando recuperar…'); this.restartTimer = setTimeout(() => { void this.restartIce(pc); }, 0); }
      if (pc.connectionState === 'disconnected') { this.ui.status('Conexão instável; tentando recuperar…'); this.restartTimer = setTimeout(() => { void this.restartIce(pc); }, 5000); }
    };
    pc.ondatachannel = event => this.attachDataChannel(event.channel);
    if (initiator) {
      this.chat.attach(pc.createDataChannel('messages', { ordered: true }));
      this.files.attach(pc.createDataChannel('files', { ordered: true }));
      this.youtube.attach(pc.createDataChannel('control', { ordered: true }), true);
      this.presence.attach(pc.createDataChannel('presence', { ordered: true }));
    }
    return pc;
  }

  attachDataChannel(channel) {
    if (channel.label === 'messages') this.chat.attach(channel);
    else if (channel.label === 'files') this.files.attach(channel);
    else if (channel.label === 'control') this.youtube.attach(channel, false);
    else if (channel.label === 'presence') this.presence.attach(channel);
    else channel.close();
  }

  handleTrack(event, pc) {
    if (this.pc !== pc) return;
    const { track, transceiver } = event;
    if (track.kind === 'audio') {
      if (!this.remoteAudioStream.getTracks().includes(track)) this.remoteAudioStream.addTrack(track);
      this.ui.setRemoteAudio(this.remoteAudioStream); this.ui.setPeerMediaStatus('Áudio conectado');
      track.onunmute = () => { void this.playRemoteAudio(); };
      void this.playRemoteAudio(); return;
    }
    const stream = transceiver.mid === this.cameraTransceiver?.mid ? this.remoteCameraStream :
      transceiver.mid === this.screenTransceiver?.mid ? this.remoteScreenStream :
      this.remoteCameraStream.getTracks().length === 0 ? this.remoteCameraStream : this.remoteScreenStream;
    if (!stream.getTracks().includes(track)) stream.addTrack(track);
    const render = () => stream === this.remoteCameraStream ? this.media.setRemoteCameraStream(stream) : this.media.setRemoteScreenStream(stream);
    track.onunmute = render; track.onmute = render; track.onended = render; render();
  }

  async handle(message) {
    switch (message.type) {
      case 'peer-joined': {
        if (this.pc) break;
        this.ui.status('Negociando conexão...'); const pc = await this.create(true);
        const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
        this.sendSignal({ type: 'offer', sdp: pc.localDescription }); break;
      }
      case 'offer': {
        if (this.pc && this.pc.signalingState !== 'closed') {
          const pc = this.pc;
          await pc.setRemoteDescription(message.sdp);
          const answer = await pc.createAnswer(); await pc.setLocalDescription(answer);
          this.sendSignal({ type: 'answer', sdp: pc.localDescription }); await this.flushIce(); break;
        }
        this.ui.status('Negociando conexão...'); const pc = await this.create(false);
        await pc.setRemoteDescription(message.sdp);
        const transceivers = pc.getTransceivers();
        this.audioTransceiver = transceivers.find(t => t.receiver.track.kind === 'audio');
        const videos = transceivers.filter(t => t.receiver.track.kind === 'video');
        this.cameraTransceiver = videos[0] || null; this.screenTransceiver = videos[1] || null;
        if (!this.audioTransceiver || !this.cameraTransceiver || !this.screenTransceiver) throw new Error('A oferta não contém os transceivers de áudio, câmera e tela esperados. Atualize ambos os navegadores.');
        for (const transceiver of [this.audioTransceiver, this.cameraTransceiver, this.screenTransceiver]) transceiver.direction = 'sendrecv';
        await this.media.attachSenders(this.audioTransceiver.sender, this.cameraTransceiver.sender, this.screenTransceiver.sender);
        const answer = await pc.createAnswer(); await pc.setLocalDescription(answer);
        this.checkAudioSendDirection(); this.sendSignal({ type: 'answer', sdp: pc.localDescription }); await this.flushIce(); break;
      }
      case 'answer':
        if (this.pc) { await this.pc.setRemoteDescription(message.sdp); this.checkAudioSendDirection(); await this.flushIce(); } break;
      case 'ice':
        if (!message.candidate) break;
        if (this.pc?.remoteDescription) await this.pc.addIceCandidate(message.candidate); else if (this.pendingCandidates.length < 256) this.pendingCandidates.push(message.candidate); break;
      case 'peer-left': this.reset(); this.onPeerLeft?.(); break;
    }
  }

  async flushIce() { while (this.pc?.remoteDescription && this.pendingCandidates.length) await this.pc.addIceCandidate(this.pendingCandidates.shift()); }
  async restartIce(pc) {
    if (this.pc !== pc || !this.isInitiator || this.restartingIce || !['failed', 'disconnected'].includes(pc.connectionState)) return;
    this.restartingIce = true;
    try {
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      this.sendSignal({ type: 'offer', sdp: pc.localDescription });
    } catch { this.ui.status('Não foi possível reiniciar ICE. Verifique STUN/TURN e a rede.'); }
    finally { this.restartingIce = false; }
  }
  checkAudioSendDirection() {
    const direction = this.audioTransceiver?.currentDirection;
    if (direction && !['sendrecv', 'sendonly'].includes(direction)) this.ui.notify('A conexão não negociou o envio do seu microfone. Saia da sala e entre novamente.');
  }

  reset() {
    clearTimeout(this.restartTimer); this.restartTimer = null; this.restartingIce = false; this.isInitiator = false;
    this.chat.detach(); this.files.detach(); this.youtube.detach(); this.presence.detach(); this.media.detachSenders();
    if (this.pc) { this.pc.ontrack = this.pc.onicecandidate = this.pc.ondatachannel = this.pc.onconnectionstatechange = null; this.pc.close(); this.pc = null; }
    this.pendingCandidates = [];
    this.audioTransceiver = this.cameraTransceiver = this.screenTransceiver = null;
    this.remoteAudioStream = new MediaStream(); this.remoteCameraStream = new MediaStream(); this.remoteScreenStream = new MediaStream();
    this.ui.clearRoomView(); this.media.setRemoteCameraStream(this.remoteCameraStream); this.media.setRemoteScreenStream(this.remoteScreenStream);
  }
}
