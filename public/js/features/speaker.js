const KEY = 'tupi-speaker';

// Escolha do alto-falante (setSinkId): vale para os elementos de áudio da chamada e, quando o navegador permite, para os contextos Web Audio.
export class Speaker {
  constructor(ui) {
    this.ui = ui;
    this.targets = new Set();
    this.id = this.load();
    this.supported = typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
    ui.setPreferredSpeaker(this.id);
    const select = ui.$('speakerSelect');
    const test = ui.$('speakerTest');
    if (!this.supported) {
      select.disabled = true;
      test.disabled = true;
      select.title = 'Este navegador não permite escolher o alto-falante.';
    }
    select.addEventListener('change', () => { void this.set(select.value); });
    test.addEventListener('click', () => { void this.test(); });
    for (const id of ['remoteAudio', 'voiceOut', 'screenAudio']) this.track(ui.$(id));
  }

  load() { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } }
  save() { try { if (this.id) localStorage.setItem(KEY, this.id); else localStorage.removeItem(KEY); } catch { /* vale só nesta sessão */ } }

  track(target) {
    if (!target) return;
    this.targets.add(target);
    if (this.id) void this.applyTo(target);
  }

  async applyTo(target) {
    if (typeof target.setSinkId !== 'function') return;
    try { await target.setSinkId(this.id || ''); }
    catch { /* dispositivo removido ou sem permissão: continua no padrão */ }
  }

  async set(id) {
    this.id = id;
    this.save();
    this.ui.setPreferredSpeaker(id);
    await Promise.all([...this.targets].map(target => this.applyTo(target)));
    this.ui.notify(id ? 'Alto-falante alterado.' : 'Usando o alto-falante padrão.');
  }

  // Toca três notas curtas no dispositivo escolhido.
  async test() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) { this.ui.notify('Este navegador não consegue tocar o teste de som.'); return; }
    try {
      const context = new AudioContext();
      const sink = context.createMediaStreamDestination();
      const now = context.currentTime;
      [523, 659, 784].forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = now + index * 0.22;
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
        oscillator.connect(gain).connect(sink);
        oscillator.start(start);
        oscillator.stop(start + 0.22);
      });
      const audio = new Audio();
      audio.srcObject = sink.stream;
      await this.applyTo(audio);
      await audio.play();
      setTimeout(() => { audio.srcObject = null; void context.close(); }, 1200);
    } catch { this.ui.notify('Não foi possível tocar o teste neste dispositivo.'); }
  }
}
