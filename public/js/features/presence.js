import { isAvatarId, sanitizeName } from './avatars.js';

// Canal "presence": avisa explicitamente o que cada lado está enviando (mic, câmera, tela) e qual avatar usa.
// O estado explícito evita que a última imagem fique congelada quando a outra pessoa para a câmera ou a tela.
export class Presence {
  constructor(ui, media, voice) {
    Object.assign(this, { ui, media, voice });
    this.channel = null;
    this.lastSent = '';
    ui.onLocalMedia(() => this.sendState());
    voice.onProfileChange(() => this.sendState());
  }

  localState() {
    return { t: 'state', avatar: this.voice.avatarId, name: this.voice.name, mic: Boolean(this.media.micStream), camera: Boolean(this.media.cameraStream), screen: Boolean(this.media.screenStream), screenAudio: this.media.hasScreenAudio() };
  }

  attach(channel) {
    this.detach();
    this.channel = channel;
    channel.onopen = () => this.sendState(true);
    channel.onmessage = event => this.receive(event.data);
    channel.onclose = () => { if (this.channel === channel) this.clearRemote(); };
    if (channel.readyState === 'open') this.sendState(true);
  }

  sendState(force = false) {
    if (this.channel?.readyState !== 'open') return;
    const payload = JSON.stringify(this.localState());
    if (!force && payload === this.lastSent) return;
    this.lastSent = payload;
    try { this.channel.send(payload); } catch { /* o próximo estado reenvia */ }
  }

  receive(data) {
    if (typeof data !== 'string' || data.length > 512) return;
    let message;
    try { message = JSON.parse(data); } catch { return; }
    if (message?.t !== 'state') return;
    const state = {
      avatar: isAvatarId(message.avatar) ? message.avatar : null,
      name: sanitizeName(message.name) || null,
      mic: message.mic === true,
      camera: message.camera === true,
      screen: message.screen === true,
      screenAudio: message.screenAudio === true
    };
    this.ui.setRemoteFlags({ camera: state.camera, screen: state.screen, screenAudio: state.screenAudio });
    this.voice.setRemoteState(state);
  }

  clearRemote() {
    this.ui.setRemoteFlags({ camera: true, screen: true, screenAudio: false });
    this.voice.setRemoteState(null);
  }

  detach() {
    const channel = this.channel;
    this.channel = null;
    this.lastSent = '';
    if (channel) {
      channel.onopen = channel.onmessage = channel.onclose = null;
      if (channel.readyState !== 'closed') channel.close();
    }
    this.clearRemote();
  }
}
