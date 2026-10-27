export class Chat {
  constructor(ui) {
    this.ui = ui;
    this.channel = null;
    this.unread = false;
    this.storageKey = 'tupi-chat-sound';
    this.soundEnabled = this.readSoundPreference();
    this.audioContext = null;
    ui.$('chatForm').addEventListener('submit', event => this.sendFromForm(event));
    // Enter envia; Shift+Enter quebra a linha. O campo cresce até 5 linhas.
    const input = ui.$('chatInput');
    input.addEventListener('keydown', event => {
      if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      ui.$('chatForm').requestSubmit();
    });
    input.addEventListener('input', () => this.autosize());
    ui.$('chatSoundToggle').addEventListener('click', () => this.toggleSound());
    ui.setChatSoundEnabled(this.soundEnabled);
    this.unlockAudioOnInteraction = () => {
      if (this.soundEnabled) void this.unlockAudio();
    };
    document.addEventListener('pointerdown', this.unlockAudioOnInteraction);
    document.addEventListener('keydown', this.unlockAudioOnInteraction);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      if (this.soundEnabled) void this.unlockAudio();
      if (this.isChatVisible()) this.markRead();
    });
  }

  autosize() {
    const input = this.ui.$('chatInput');
    input.style.height = 'auto';
    // Com o chat recolhido o campo não tem layout (scrollHeight 0): deixa a altura mínima do CSS.
    input.style.height = input.scrollHeight ? `${Math.min(input.scrollHeight + 2, 120)}px` : '';
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
    this.unread = false;
    this.ui.setChatUnread(false);
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
      if (!this.audioContext) { this.audioContext = new AudioContext(); this.speaker?.track(this.audioContext); }
      if (this.audioContext.state === 'suspended') await this.audioContext.resume();
      return this.audioContext.state === 'running';
    } catch { return false; }
  }

  // kind: 'message' (duas notas), 'file' (três notas) ou 'arrival' (arpejo ascendente, a outra pessoa chegou).
  async playNotification(kind = 'message') {
    if (!this.soundEnabled || !await this.unlockAudio()) return;
    const notes = { message: [740, 988], file: [660, 880, 1175], arrival: [523, 659, 784, 1047] }[kind] || [740, 988];
    try {
      const context = this.audioContext;
      const step = kind === 'arrival' ? 0.12 : 0.09;
      const now = context.currentTime;
      notes.forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = now + index * step;
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.12, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + (index === notes.length - 1 ? 0.3 : 0.16));
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.32);
      });
    } catch { /* Falha no áudio não deve interromper o recebimento da mensagem. */ }
  }

  attach(channel) {
    this.detach();
    this.channel = channel;
    channel.onopen = () => this.ui.setChatConnected(true);
    channel.onclose = () => this.ui.setChatConnected(false);
    channel.onerror = () => this.ui.notify('O canal de mensagens apresentou um erro.');
    channel.onmessage = event => {
      if (typeof event.data === 'string' && event.data.length <= 4000) {
        this.ui.addMessage(this.ui.getRemoteName(), event.data);
        this.onIncoming?.('message', event.data);
        if (!this.isChatVisible() || document.hidden) {
          this.unread = true;
          this.ui.setChatUnread(true);
        }
        this.playNotification('message');
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
      this.autosize();
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
