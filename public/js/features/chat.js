import { diagnostics } from '../core/diagnostics.js';
export class Chat {
  constructor(ui) {
    this.ui = ui;
    this.channel = null;
    this.unread = false;
    this.storageKey = 'tupi-chat-sound';
    this.soundEnabled = this.readSoundPreference();
    this.audioContext = null;
    this.nextNotificationTime = 0;
    this.notificationOscillators = new Set();
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
    ui.$('enableNotificationAudioBtn').addEventListener('click', () => {
      if (this.soundEnabled) void this.unlockAudio();
    });
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
    if (!this.soundEnabled) {
      this.ui.setNotificationAudioBlocked(false);
      for (const oscillator of this.notificationOscillators) {
        try { oscillator.stop(); } catch { /* Já finalizado. */ }
      }
      this.notificationOscillators.clear();
      this.nextNotificationTime = 0;
    }
    if (this.soundEnabled) {
      await this.unlockAudio();
    }
  }

  async unlockAudio() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) { this.ui.setNotificationAudioBlocked(this.soundEnabled, true); return false; }
    try {
      if (!this.audioContext) {
        this.audioContext = new AudioContext(); this.speaker?.track(this.audioContext);
        this.audioContext.onstatechange = () => this.ui.setNotificationAudioBlocked(this.soundEnabled && this.audioContext.state !== 'running');
      }
      // resume() pode ficar pendente até uma interação: mostre o botão antes.
      this.ui.setNotificationAudioBlocked(this.soundEnabled && this.audioContext.state !== 'running');
      if (this.audioContext.state !== 'running') await this.audioContext.resume();
      const ready = this.audioContext.state === 'running';
      this.ui.setNotificationAudioBlocked(this.soundEnabled && !ready);
      return ready;
    } catch { this.ui.setNotificationAudioBlocked(this.soundEnabled); return false; }
  }

  // Mensagem, arquivo, chegada à chamada ou início/abertura de uma atividade.
  async playNotification(kind = 'message') {
    if (!this.soundEnabled || !await this.unlockAudio() || !this.soundEnabled) return;
    const notes = { message: [740, 988], file: [660, 880, 1175], arrival: [523, 659, 784, 1047], activity: [587, 784, 988] }[kind] || [740, 988];
    try {
      const context = this.audioContext;
      const step = kind === 'arrival' ? 0.12 : 0.09;
      const now = Math.max(context.currentTime, this.nextNotificationTime);
      this.nextNotificationTime = now + (notes.length - 1) * step + 0.35;
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
        this.notificationOscillators.add(oscillator);
        oscillator.onended = () => { this.notificationOscillators.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
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
      const receivedAt = performance.now();
      if (typeof event.data === 'string' && event.data.length <= 4000) {
        this.ui.addMessage(this.ui.getRemoteName(), event.data);
        this.onIncoming?.('message', event.data);
        if (!this.isChatVisible() || document.hidden) {
          this.unread = true;
          this.ui.setChatUnread(true);
        }
        diagnostics.record('chat-applied', { ms: performance.now() - receivedAt });
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
      diagnostics.record('chat-sent', { bufferedBytes: this.channel.bufferedAmount });
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
