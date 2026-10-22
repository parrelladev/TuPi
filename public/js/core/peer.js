export class PeerSession {
  constructor({ rtcConfig, media, chat, ui, sendSignal, onPeerLeft }) {
    this.rtcConfig = rtcConfig;
    this.media = media;
    this.chat = chat;
    this.ui = ui;
    this.sendSignal = sendSignal;
    this.onPeerLeft = onPeerLeft;
    this.pc = null;
    this.pendingCandidates = [];
    this.remoteAudioStream = new MediaStream();
    this.remoteScreenStream = new MediaStream();
  }

  async create(initiator) {
    const earlyCandidates = this.pendingCandidates.slice();
    this.reset();
    this.pendingCandidates = earlyCandidates;
    const pc = new RTCPeerConnection(this.rtcConfig);
    this.pc = pc;
    const audioSender = pc.addTransceiver('audio', { direction: 'sendrecv' }).sender;
    const videoSender = pc.addTransceiver('video', { direction: 'sendrecv' }).sender;
    await this.media.attachSenders(audioSender, videoSender);
    pc.onicecandidate = event => { if (event.candidate && this.pc === pc) this.sendSignal({ type: 'ice', candidate: event.candidate }); };
    pc.ontrack = event => this.handleTrack(event, pc);
    pc.onconnectionstatechange = () => {
      if (this.pc !== pc) return;
      if (pc.connectionState === 'connected') this.ui.status('● Conectado diretamente (ou via relay TURN)');
      if (pc.connectionState === 'failed') this.ui.status('Falha na conexão: pode ser necessário um servidor TURN.');
      if (pc.connectionState === 'disconnected') this.ui.status('Conexão interrompida.');
    };
    pc.ondatachannel = event => this.chat.attach(event.channel);
    if (initiator) this.chat.attach(pc.createDataChannel('messages', { ordered: true }));
    return pc;
  }

  handleTrack(event, pc) {
    if (this.pc !== pc) return;
    const track = event.track;
    if (track.kind === 'audio') {
      this.remoteAudioStream.addTrack(track);
      this.ui.setRemoteAudio(this.remoteAudioStream);
      this.ui.setPeerMediaStatus('Áudio conectado');
      this.ui.$('remoteAudio').play().catch(() => this.ui.notify('Clique na página para permitir a reprodução do áudio.'));
      return;
    }
    this.remoteScreenStream.addTrack(track);
    track.onunmute = () => this.media.setRemoteScreenStream(this.remoteScreenStream);
    track.onmute = () => this.media.setRemoteScreenStream(this.remoteScreenStream);
    track.onended = () => this.media.setRemoteScreenStream(this.remoteScreenStream);
    this.media.setRemoteScreenStream(this.remoteScreenStream);
  }

  async handle(message) {
    switch (message.type) {
      case 'peer-joined': {
        this.ui.status('Negociando conexão...');
        const pc = await this.create(true);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        this.sendSignal({ type: 'offer', sdp: pc.localDescription });
        break;
      }
      case 'offer': {
        this.ui.status('Negociando conexão...');
        const pc = await this.create(false);
        await pc.setRemoteDescription(message.sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.sendSignal({ type: 'answer', sdp: pc.localDescription });
        await this.flushIce();
        break;
      }
      case 'answer':
        if (this.pc) { await this.pc.setRemoteDescription(message.sdp); await this.flushIce(); }
        break;
      case 'ice':
        if (!message.candidate) break;
        if (this.pc?.remoteDescription) await this.pc.addIceCandidate(message.candidate);
        else this.pendingCandidates.push(message.candidate);
        break;
      case 'peer-left':
        this.reset();
        this.onPeerLeft?.();
        break;
    }
  }

  async flushIce() {
    while (this.pc?.remoteDescription && this.pendingCandidates.length) {
      await this.pc.addIceCandidate(this.pendingCandidates.shift());
    }
  }

  reset() {
    this.chat.detach();
    this.media.detachSenders();
    if (this.pc) {
      this.pc.ontrack = null;
      this.pc.onicecandidate = null;
      this.pc.ondatachannel = null;
      this.pc.onconnectionstatechange = null;
      this.pc.close();
      this.pc = null;
    }
    this.pendingCandidates = [];
    this.remoteAudioStream = new MediaStream();
    this.remoteScreenStream = new MediaStream();
    this.ui.clearRoomView();
    this.media.setRemoteScreenStream(this.remoteScreenStream);
  }
}
