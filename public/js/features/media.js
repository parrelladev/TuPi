export class Media {
  constructor(ui) {
    this.ui = ui;
    this.micStream = null;
    this.cameraStream = null;
    this.screenStream = null;
    this.audioSender = null;
    this.cameraSender = null;
    this.screenSender = null;
    this.remoteCameraStream = new MediaStream();
    this.remoteScreenStream = new MediaStream();
    this.micBusy = false;
    this.cameraBusy = false;
    this.screenBusy = false;
    this.audioProfile = 'standard';
    ui.$('micBtn').addEventListener('click', () => this.toggleMic());
    ui.$('cameraBtn').addEventListener('click', () => this.toggleCamera());
    ui.$('screenBtn').addEventListener('click', () => this.toggleScreen());
    ui.$('microphoneSelect').addEventListener('change', event => { void this.changeDevice('audioinput', event.target.value); });
    ui.$('cameraSelect').addEventListener('change', event => { void this.changeDevice('videoinput', event.target.value); });
    ui.$('audioProfile').addEventListener('change', event => {
      this.audioProfile = event.target.value;
      if (this.micStream) void this.changeDevice('audioinput', ui.$('microphoneSelect').value);
    });
    navigator.mediaDevices?.addEventListener?.('devicechange', () => { void this.refreshDevices(); });
    void this.refreshDevices();
  }

  audioConstraints(deviceId) {
    const natural = this.audioProfile === 'natural';
    return { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: !natural, noiseSuppression: !natural, autoGainControl: !natural };
  }

  async attachSenders(audioSender, cameraSender, screenSender) {
    this.audioSender = audioSender;
    this.cameraSender = cameraSender;
    this.screenSender = screenSender;
    await Promise.all([
      audioSender.replaceTrack(this.micStream?.getAudioTracks()[0] || null),
      cameraSender.replaceTrack(this.cameraStream?.getVideoTracks()[0] || null),
      screenSender.replaceTrack(this.screenStream?.getVideoTracks()[0] || null)
    ]);
  }

  detachSenders() { this.audioSender = this.cameraSender = this.screenSender = null; }

  mediaApiError(feature) {
    if (!window.isSecureContext) return `${feature} requer uma conexão segura. Abra o TuPi em https:// ou, neste computador, em http://localhost.`;
    if (!navigator.mediaDevices) return 'Este navegador não disponibiliza acesso a dispositivos de mídia. Atualize ou use uma versão recente de Chrome, Edge ou Firefox.';
    return null;
  }

  async toggleMic() {
    if (this.micBusy) return;
    this.micBusy = true;
    try {
      if (this.micStream) { await this.stopSource('mic'); return; }
      const apiError = this.mediaApiError('O microfone'); if (apiError) throw new Error(apiError);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: this.audioConstraints(this.ui.$('microphoneSelect').value), video: false });
      this.micStream = stream;
      const track = stream.getAudioTracks()[0];
      track.onended = () => { if (this.micStream === stream) void this.stopSource('mic'); };
      await this.audioSender?.replaceTrack(track);
      this.ui.setMicState('on');
      await this.refreshDevices();
    } catch (error) { this.reportCaptureError(error, 'microfone'); }
    finally { this.micBusy = false; }
  }

  async toggleCamera() {
    if (this.cameraBusy) return;
    this.cameraBusy = true;
    try {
      if (this.cameraStream) { await this.stopSource('camera'); return; }
      const apiError = this.mediaApiError('A câmera'); if (apiError) throw new Error(apiError);
      const deviceId = this.ui.$('cameraSelect').value;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { deviceId: deviceId ? { exact: deviceId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } } });
      this.cameraStream = stream;
      const track = stream.getVideoTracks()[0];
      track.onended = () => { if (this.cameraStream === stream) void this.stopSource('camera'); };
      await this.cameraSender?.replaceTrack(track);
      this.ui.renderCamera(stream, this.remoteCameraStream);
      await this.refreshDevices();
    } catch (error) { this.reportCaptureError(error, 'câmera'); }
    finally { this.cameraBusy = false; }
  }

  async toggleScreen() {
    if (this.screenBusy) return;
    this.screenBusy = true;
    try {
      if (this.screenStream) { await this.stopSource('screen'); return; }
      const apiError = this.mediaApiError('O compartilhamento de tela'); if (apiError) throw new Error(apiError);
      if (typeof navigator.mediaDevices.getDisplayMedia !== 'function') throw new Error('Este navegador ou dispositivo não oferece compartilhamento de tela. Use um navegador de desktop recente.');
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 20 }, audio: false });
      this.screenStream = stream;
      const track = stream.getVideoTracks()[0];
      track.onended = () => { if (this.screenStream === stream) void this.stopSource('screen'); };
      await this.screenSender?.replaceTrack(track);
      this.ui.renderScreen(stream, this.remoteScreenStream);
    } catch (error) { this.reportCaptureError(error, 'tela'); }
    finally { this.screenBusy = false; }
  }

  reportCaptureError(error, feature) {
    const denied = ['NotAllowedError', 'PermissionDeniedError'].includes(error.name);
    this.ui.setSourceState(feature, denied ? 'denied' : 'error');
    this.ui.notify(denied ? `Permissão de ${feature} negada ou captura cancelada. Verifique as permissões do navegador e tente novamente.` : `Não foi possível acessar ${feature}: ${error.message}`);
  }

  async stopSource(source) {
    const props = { mic: ['micStream', 'audioSender'], camera: ['cameraStream', 'cameraSender'], screen: ['screenStream', 'screenSender'] }[source];
    const [streamKey, senderKey] = props;
    const stream = this[streamKey];
    if (!stream) return;
    this[streamKey] = null;
    stream.getTracks().forEach(track => { track.onended = null; track.stop(); });
    await this[senderKey]?.replaceTrack(null);
    if (source === 'mic') this.ui.setMicState('off');
    if (source === 'camera') this.ui.renderCamera(null, this.remoteCameraStream);
    if (source === 'screen') this.ui.renderScreen(null, this.remoteScreenStream);
  }

  async changeDevice(kind, deviceId) {
    const source = kind === 'audioinput' ? 'mic' : 'camera';
    if (!this[`${source === 'mic' ? 'mic' : 'camera'}Stream`]) return;
    const streamKey = source === 'mic' ? 'micStream' : 'cameraStream';
    try {
      const constraints = source === 'mic' ? { audio: this.audioConstraints(deviceId), video: false } : { audio: false, video: { deviceId: deviceId ? { exact: deviceId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } } };
      const nextStream = await navigator.mediaDevices.getUserMedia(constraints);
      const oldStream = this[streamKey];
      const track = source === 'mic' ? nextStream.getAudioTracks()[0] : nextStream.getVideoTracks()[0];
      track.onended = () => { if (this[streamKey] === nextStream) void this.stopSource(source); };
      const sender = source === 'mic' ? this.audioSender : this.cameraSender;
      await sender?.replaceTrack(track);
      this[streamKey] = nextStream;
      oldStream?.getTracks().forEach(old => { old.onended = null; old.stop(); });
      if (source === 'camera') this.ui.renderCamera(nextStream, this.remoteCameraStream);
      await this.refreshDevices();
    } catch (error) { this.reportCaptureError(error, source === 'mic' ? 'microfone' : 'câmera'); }
  }

  async refreshDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.ui.setDevices(devices);
    } catch { /* Device enumeration is optional and browser-controlled. */ }
  }

  setRemoteCameraStream(stream) { this.remoteCameraStream = stream; this.ui.renderCamera(this.cameraStream, stream); }
  setRemoteScreenStream(stream) { this.remoteScreenStream = stream; this.ui.renderScreen(this.screenStream, stream); }

  async stop() {
    const senders = [this.audioSender, this.cameraSender, this.screenSender];
    this.detachSenders();
    await Promise.allSettled(senders.map(sender => sender?.replaceTrack(null)));
    for (const stream of [this.micStream, this.cameraStream, this.screenStream]) stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
    this.micStream = this.cameraStream = this.screenStream = null;
    this.ui.setMicState('off');
    this.ui.renderCamera(null, this.remoteCameraStream);
    this.ui.renderScreen(null, this.remoteScreenStream);
  }
}
