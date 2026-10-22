export class Chat {
  constructor(ui) {
    this.ui = ui;
    this.channel = null;
    this.unread = 0;
    this.storageKey = 'tupi-chat-sound';
    this.soundEnabled = this.readSoundPreference();
    this.audioContext = null;
    ui.$('chatForm').addEventListener('submit', event => this.sendFromForm(event));
    ui.$('chatSoundToggle').addEventListener('click', () => this.toggleSound());
    ui.setChatSoundEnabled(this.soundEnabled);
    if (this.soundEnabled) {
      document.addEventListener('pointerdown', () => this.unlockAudio(), { once: true });
      document.addEventListener('keydown', () => this.unlockAudio(), { once: true });
    }
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.isChatVisible()) this.markRead();
    });
  }

  readSoundPreference() {
    try { return localStorage.getItem(this.storageKey) !== 'off'; }
    catch { return true; }
  }

  isChatVisible() {
    const panel = this.ui.$('chatPanel');
    return panel.getClientRects().length > 0 && getComputedStyle(panel).display !== 'none';
  }

  markRead() {
    this.unread = 0;
    this.ui.setChatUnread(0);
  }

  async toggleSound() {
    this.soundEnabled = !this.soundEnabled;
    try { localStorage.setItem(this.storageKey, this.soundEnabled ? 'on' : 'off'); }
    catch { /* Preferência vale durante esta sessão mesmo sem armazenamento. */ }
    this.ui.setChatSoundEnabled(this.soundEnabled);
    if (this.soundEnabled) {
      const ready = await this.unlockAudio();
      if (!ready) {
        this.soundEnabled = false;
        this.ui.setChatSoundEnabled(false);
        try { localStorage.setItem(this.storageKey, 'off'); } catch {}
        this.ui.notify('Este navegador não oferece áudio para notificações.');
      }
    }
  }

  async unlockAudio() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return false;
    try {
      this.audioContext ||= new AudioContext();
      if (this.audioContext.state === 'suspended') await this.audioContext.resume();
      return this.audioContext.state === 'running';
    } catch { return false; }
  }

  playNotification() {
    const context = this.audioContext;
    if (!this.soundEnabled || !context || context.state !== 'running') return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(740, now);
    oscillator.frequency.setValueAtTime(988, now + 0.09);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.23);
  }

  attach(channel) {
    this.detach();
    this.channel = channel;
    channel.onopen = () => this.ui.setChatConnected(true);
    channel.onclose = () => this.ui.setChatConnected(false);
    channel.onerror = () => this.ui.notify('O canal de mensagens apresentou um erro.');
    channel.onmessage = event => {
      if (typeof event.data === 'string' && event.data.length <= 4000) {
        this.ui.addMessage('Convidado', event.data);
        if (!this.isChatVisible() || document.hidden) {
          this.unread += 1;
          this.ui.setChatUnread(this.unread);
        }
        this.playNotification();
      }
    };
  }

  sendFromForm(event) {
    event.preventDefault();
    const input = this.ui.$('chatInput');
    const text = input.value.trim();
    if (!text || this.channel?.readyState !== 'open') return;
    try {
      this.channel.send(text);
      this.ui.addMessage('Você', text, true);
      input.value = '';
    } catch { this.ui.notify('Não foi possível enviar a mensagem.'); }
  }

  detach() {
    const channel = this.channel;
    this.channel = null;
    if (!channel) return;
    channel.onmessage = null;
    channel.onopen = null;
    channel.onclose = null;
    channel.onerror = null;
    if (channel.readyState !== 'closed') channel.close();
  }
}
