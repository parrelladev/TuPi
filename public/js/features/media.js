export class Media {
  constructor(ui) {
    this.ui = ui;
    this.micStream = null;
    this.screenStream = null;
    this.audioSender = null;
    this.videoSender = null;
    this.remoteScreenStream = new MediaStream();
    this.micBusy = false;
    this.screenBusy = false;
    ui.$('micBtn').addEventListener('click', () => this.toggleMic());
    ui.$('screenBtn').addEventListener('click', () => this.toggleScreen());
  }

  async attachSenders(audioSender, videoSender) {
    this.audioSender = audioSender;
    this.videoSender = videoSender;
    const audioTrack = this.micStream?.getAudioTracks()[0] || null;
    const videoTrack = this.screenStream?.getVideoTracks()[0] || null;
    await Promise.all([
      audioSender.replaceTrack(audioTrack),
      videoSender.replaceTrack(videoTrack)
    ]);
  }

  detachSenders() {
    this.audioSender = null;
    this.videoSender = null;
  }

  mediaApiError(feature) {
    if (!window.isSecureContext) return `${feature} requer uma conexão segura. Abra o TuPi em https:// ou, neste computador, em http://localhost.`;
    if (!navigator.mediaDevices) return 'Este navegador não disponibiliza acesso a dispositivos de mídia. Atualize ou use uma versão recente de Chrome, Edge ou Firefox.';
    return null;
  }

  async toggleMic() {
    if (this.micBusy) return;
    this.micBusy = true;
    try {
      if (this.micStream) {
        await this.audioSender?.replaceTrack(null);
        this.micStream.getTracks().forEach(track => track.stop());
        this.micStream = null;
        this.ui.setMicState('off');
        return;
      }
      const apiError = this.mediaApiError('O microfone');
      if (apiError) { this.ui.notify(apiError); return; }
      if (typeof navigator.mediaDevices.getUserMedia !== 'function') {
        this.ui.notify('Este navegador não oferece suporte à captura do microfone. Atualize ou use Chrome, Edge ou Firefox recentes.');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      this.micStream = stream;
      const track = stream.getAudioTracks()[0];
      track.onended = () => { if (this.micStream === stream) this.toggleMic(); };
      if (this.audioSender) await this.audioSender.replaceTrack(track);
      this.ui.setMicState('on');
    } catch (error) {
      const denied = error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError';
      this.ui.setMicState(denied ? 'denied' : 'error');
      this.ui.notify(denied
        ? 'Permissão do microfone negada. Libere o microfone nas permissões do navegador e tente novamente.'
        : `Não foi possível acessar o microfone: ${error.message}`);
    } finally { this.micBusy = false; }
  }

  async toggleScreen() {
    if (this.screenBusy) return;
    this.screenBusy = true;
    try {
      if (this.screenStream) {
        await this.videoSender?.replaceTrack(null);
        this.screenStream.getTracks().forEach(track => track.stop());
        this.screenStream = null;
        this.ui.renderScreen(null, this.remoteScreenStream);
        return;
      }
      const apiError = this.mediaApiError('O compartilhamento de tela');
      if (apiError) { this.ui.notify(apiError); return; }
      if (typeof navigator.mediaDevices.getDisplayMedia !== 'function') {
        this.ui.notify('Este navegador ou dispositivo não oferece compartilhamento de tela. Use um navegador de desktop recente.');
        return;
      }
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 20 }, audio: false });
      this.screenStream = stream;
      const track = stream.getVideoTracks()[0];
      track.onended = () => { if (this.screenStream === stream) this.toggleScreen(); };
      if (this.videoSender) await this.videoSender.replaceTrack(track);
      this.ui.renderScreen(this.screenStream, this.remoteScreenStream);
    } catch (error) {
      const denied = error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError';
      this.ui.setScreenState(denied ? 'denied' : 'error');
      this.ui.notify(denied
        ? 'Compartilhamento cancelado ou bloqueado. Permita a captura de tela no navegador e tente novamente.'
        : `Falha ao compartilhar tela: ${error.message}`);
    } finally { this.screenBusy = false; }
  }

  setRemoteScreenStream(stream) {
    this.remoteScreenStream = stream;
    this.ui.renderScreen(this.screenStream, stream);
  }

  async stop() {
    const audioSender = this.audioSender;
    const videoSender = this.videoSender;
    this.audioSender = null;
    this.videoSender = null;
    await Promise.allSettled([audioSender?.replaceTrack(null), videoSender?.replaceTrack(null)]);
    for (const stream of [this.micStream, this.screenStream]) stream?.getTracks().forEach(track => track.stop());
    this.micStream = null;
    this.screenStream = null;
    this.ui.setMicState('off');
    this.ui.renderScreen(null, this.remoteScreenStream);
  }
}
