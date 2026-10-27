import { AVATARS, avatarById, avatarMarkup, unknownAvatarMarkup, loadAvatarId, saveAvatarId, sanitizeName, defaultNameFor, loadCustomName, saveCustomName } from './avatars.js';
import { pop } from '../fx.js';

const VOICE_KEY = 'tupi-voice';
const VOLUME_MAX = 200;
const SPEAK_ON = 0.14;
const SPEAK_OFF = 0.08;
const HOLD_MS = 320;

class Meter {
  constructor(getStream) {
    this.getStream = getStream;
    this.key = '';
    this.source = null;
    this.analyser = null;
    this.data = null;
    this.level = 0;
    this.speaking = false;
    this.lastLoud = 0;
  }

  read(context, now) {
    const stream = this.getStream();
    const tracks = stream ? stream.getAudioTracks().filter(track => track.readyState === 'live') : [];
    const key = tracks.map(track => track.id).join(',');
    if (key !== this.key) {
      this.dispose();
      this.key = key;
      if (tracks.length) {
        try {
          this.source = context.createMediaStreamSource(new MediaStream(tracks));
          this.analyser = context.createAnalyser();
          this.analyser.fftSize = 512;
          this.analyser.smoothingTimeConstant = 0.4;
          this.source.connect(this.analyser);
          this.data = new Uint8Array(this.analyser.fftSize);
        } catch { this.dispose(); }
      }
    }
    let raw = 0;
    if (this.analyser) {
      this.analyser.getByteTimeDomainData(this.data);
      let sum = 0;
      for (const value of this.data) { const x = (value - 128) / 128; sum += x * x; }
      raw = Math.min(1, Math.sqrt(sum / this.data.length) * 6);
    }
    this.level = Math.max(raw, this.level * 0.82);
    if (this.level > SPEAK_ON) { this.speaking = true; this.lastLoud = now; }
    else if (this.speaking && this.level < SPEAK_OFF && now - this.lastLoud > HOLD_MS) this.speaking = false;
    return this;
  }

  dispose() {
    try { this.source?.disconnect(); } catch { /* já desconectado */ }
    this.source = this.analyser = this.data = null;
    this.level = 0;
    this.speaking = false;
  }
}

export class Voice {
  constructor(ui, media) {
    this.ui = ui;
    this.media = media;
    this.$ = ui.$;
    this.avatarId = loadAvatarId();
    this.customName = loadCustomName();
    this.remote = null;
    this.profileListeners = [];
    this.context = null;
    this.frame = 0;
    this.lastTick = 0;
    this.settings = this.loadSettings();
    this.output = { key: '', nodes: null, left: 0, right: 0, makeup: 1, active: false, blocked: false };
    this.meters = {
      local: new Meter(() => this.media.micStream),
      remote: new Meter(() => this.$('remoteAudio').srcObject)
    };
    this.renderPickers();
    this.renderAvatars();
    this.renderNames();
    this.bindControls();
    this.bindNameEditing();
    this.applyVolume();
    this.renderStates();
    ui.onLocalMedia(() => this.renderStates());
    const resume = () => {
      if (this.context?.state === 'suspended') void this.context.resume();
      if (this.output.blocked) this.$('voiceOut').play().then(() => { this.output.blocked = false; }).catch(() => {});
    };
    document.addEventListener('pointerdown', resume);
    document.addEventListener('keydown', resume);
    this.frame = requestAnimationFrame(now => this.tick(now));
  }

  onProfileChange(listener) { this.profileListeners.push(listener); }

  get name() { return this.customName || defaultNameFor(this.avatarId); }

  get remoteName() {
    if (!this.remote) return 'Convidado';
    return this.remote.name || (this.remote.avatar ? defaultNameFor(this.remote.avatar) : 'Convidado');
  }

  loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(VOICE_KEY) || '{}');
      return { volume: Number.isFinite(saved.volume) ? Math.min(VOLUME_MAX, Math.max(0, saved.volume)) : 100, muted: saved.muted === true };
    } catch { return { volume: 100, muted: false }; }
  }

  saveSettings() { try { localStorage.setItem(VOICE_KEY, JSON.stringify(this.settings)); } catch { /* só nesta sessão */ } }

  // Há dois seletores de avatar: o da chamada (barra de voz) e o do lobby.
  renderPickers() {
    for (const id of ['avatarPicker', 'lobbyPicker']) {
      this.$(id).replaceChildren(...AVATARS.map(avatar => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'picker-option';
        button.dataset.avatar = avatar.id;
        button.setAttribute('role', 'option');
        button.setAttribute('aria-label', avatar.name);
        button.title = avatar.name;
        button.innerHTML = `<span class="avatar">${avatarMarkup(avatar.id)}</span><small>${avatar.name}</small>`;
        return button;
      }));
    }
  }

  renderAvatars() {
    for (const id of ['avatarLocal', 'lobbyAvatar']) this.$(id).innerHTML = avatarMarkup(this.avatarId);
    const remoteId = this.remote?.avatar;
    for (const id of ['avatarRemote']) this.$(id).innerHTML = remoteId ? avatarMarkup(remoteId) : unknownAvatarMarkup;
    const name = avatarById(this.avatarId).name;
    for (const id of ['avatarLocalBtn', 'lobbyAvatarBtn']) this.$(id).setAttribute('aria-label', `Trocar meu avatar (atual: ${name})`);
    for (const id of ['avatarPicker', 'lobbyPicker']) this.$(id).querySelectorAll('.picker-option').forEach(option => option.setAttribute('aria-selected', String(option.dataset.avatar === this.avatarId)));
  }

  // Nomes na tela: o seu (card, prévia do lobby, campo do lobby) e o do convidado (todos os [data-remote-name]).
  renderNames() {
    const name = this.name;
    this.$('nameLocal').textContent = name;
    this.$('lobbyPreviewName').textContent = name;
    const lobbyInput = this.$('lobbyName');
    if (document.activeElement !== lobbyInput) lobbyInput.value = this.customName;
    lobbyInput.placeholder = defaultNameFor(this.avatarId);
    this.$('personLocal').setAttribute('aria-label', name);
    const remote = this.remoteName;
    document.querySelectorAll('[data-remote-name]').forEach(element => { element.textContent = remote; });
    this.$('personRemote').setAttribute('aria-label', remote);
    this.ui.setRemoteName(remote);
  }

  bindNameEditing() {
    const lobbyInput = this.$('lobbyName');
    lobbyInput.addEventListener('input', () => this.setLocalName(lobbyInput.value, { fromInput: true }));
    lobbyInput.addEventListener('blur', () => { lobbyInput.value = this.customName; });
    const button = this.$('nameLocalBtn');
    const input = this.$('nameLocalInput');
    const finish = save => {
      if (input.classList.contains('hidden')) return;
      if (save) this.setLocalName(input.value);
      input.classList.add('hidden');
      button.classList.remove('hidden');
      button.focus();
    };
    button.addEventListener('click', () => {
      input.value = this.customName;
      input.placeholder = defaultNameFor(this.avatarId);
      button.classList.add('hidden');
      input.classList.remove('hidden');
      input.focus();
      input.select();
    });
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); finish(true); }
      else if (event.key === 'Escape') { event.preventDefault(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
  }

  bindControls() {
    const pairs = [
      { picker: this.$('avatarPicker'), triggers: [this.$('avatarLocalBtn')], focus: this.$('avatarLocalBtn') },
      { picker: this.$('lobbyPicker'), triggers: [this.$('lobbyAvatarBtn')], focus: this.$('lobbyAvatarBtn') }
    ];
    for (const { picker, triggers, focus } of pairs) {
      const setOpen = open => {
        picker.classList.toggle('hidden', !open);
        triggers.forEach(trigger => trigger.setAttribute('aria-expanded', String(open)));
      };
      triggers.forEach(trigger => trigger.addEventListener('click', event => { event.stopPropagation(); setOpen(picker.classList.contains('hidden')); }));
      picker.addEventListener('click', event => {
        const option = event.target.closest('.picker-option');
        if (!option) return;
        this.setLocalAvatar(option.dataset.avatar);
        setOpen(false);
      });
      document.addEventListener('click', event => { if (!picker.classList.contains('hidden') && !picker.contains(event.target)) setOpen(false); });
      document.addEventListener('keydown', event => { if (event.key === 'Escape' && !picker.classList.contains('hidden')) { setOpen(false); focus.focus(); } });
    }

    this.$('voiceMicBtn').addEventListener('click', () => this.$('micBtn').click());
    this.$('lobbyMicBtn').addEventListener('click', () => this.$('micBtn').click());
    this.$('lobbyCamBtn').addEventListener('click', () => this.$('cameraBtn').click());
    const volume = this.$('remoteVolume');
    volume.addEventListener('input', () => {
      this.settings.volume = Number(volume.value);
      if (this.settings.volume > 0) this.settings.muted = false;
      this.applyVolume();
      this.saveSettings();
    });
    this.$('remoteMuteBtn').addEventListener('click', () => {
      this.settings.muted = !this.settings.muted;
      if (!this.settings.muted && this.settings.volume === 0) this.settings.volume = 60;
      this.applyVolume();
      this.saveSettings();
    });
  }

  setLocalAvatar(id) {
    if (id === this.avatarId) return;
    this.avatarId = id;
    saveAvatarId(id);
    this.renderAvatars();
    this.renderNames();
    for (const element of ['avatarLocal', 'lobbyAvatar']) pop(this.$(element));
    this.profileListeners.forEach(listener => listener());
  }

  // Nome vazio volta ao nome do avatar. `fromInput` evita reescrever o campo enquanto a pessoa digita.
  setLocalName(value, { fromInput = false } = {}) {
    const name = sanitizeName(value);
    if (name === this.customName) return;
    this.customName = name;
    saveCustomName(name);
    if (fromInput) {
      const input = this.$('lobbyName');
      const keep = input.value;
      this.renderNames();
      input.value = keep;
    } else this.renderNames();
    this.profileListeners.forEach(listener => listener());
  }

  setRemoteState(state) {
    const previous = this.remote?.avatar;
    const previousName = this.remoteName;
    this.remote = state;
    this.renderAvatars();
    this.renderNames();
    if (state?.avatar && state.avatar !== previous) pop(this.$('avatarRemote'));
    if (state && this.remoteName !== previousName) pop(this.$('nameRemote'));
    this.$('personRemote').dataset.present = String(Boolean(state));
    this.renderStates();
  }

  applyVolume() {
    const { volume, muted } = this.settings;
    const audio = this.$('remoteAudio');
    const routed = this.output.active;
    audio.volume = routed ? 1 : Math.min(1, volume / 100);
    audio.muted = routed ? true : muted;
    this.applyOutputGain();
    const slider = this.$('remoteVolume');
    slider.value = String(volume);
    slider.style.setProperty('--fill', `${muted ? 0 : volume / 2}%`);
    slider.style.setProperty('--fill-base', `${muted ? 0 : Math.min(volume, 100) / 2}%`);
    slider.dataset.over = String(!muted && volume > 100);
    this.$('remoteVolumeText').textContent = muted ? 'Mudo' : `${volume}%`;
    const button = this.$('remoteMuteBtn');
    button.setAttribute('aria-pressed', String(muted));
    button.setAttribute('aria-label', muted ? 'Reativar o som do convidado' : 'Silenciar o convidado');
    button.dataset.level = muted || volume === 0 ? 'off' : volume < 50 ? 'low' : 'high';
    this.renderStates();
  }

  applyOutputGain() {
    const { nodes, makeup } = this.output;
    if (!nodes) return;
    const level = this.settings.muted ? 0 : this.settings.volume / 100;
    nodes.gain.gain.setTargetAtTime(level * makeup, this.context.currentTime, 0.05);
  }

  // O áudio do convidado passa por Web Audio e sai igual nos dois ouvidos. Isso evita o caso de
  // sair só do lado esquerdo (fonte estéreo com um canal vazio ou mono mapeado para a esquerda).
  buildOutput(tracks) {
    const context = this.context;
    const source = context.createMediaStreamSource(new MediaStream(tracks));
    const up = context.createGain();
    up.channelCount = 2; up.channelCountMode = 'explicit'; up.channelInterpretation = 'speakers';
    const splitter = context.createChannelSplitter(2);
    const left = context.createAnalyser();
    const right = context.createAnalyser();
    left.fftSize = right.fftSize = 512;
    const mono = context.createGain();
    mono.channelCount = 1; mono.channelCountMode = 'explicit'; mono.channelInterpretation = 'speakers';
    const gain = context.createGain();
    source.connect(up);
    up.connect(splitter);
    splitter.connect(left, 0);
    splitter.connect(right, 1);
    up.connect(mono);
    mono.connect(gain);
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -8; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.003; limiter.release.value = 0.12;
    gain.connect(limiter);
    // A saída passa por um elemento <audio> para poder usar o alto-falante escolhido (setSinkId) em qualquer navegador.
    const sink = context.createMediaStreamDestination();
    limiter.connect(sink);
    const out = this.$('voiceOut');
    out.srcObject = sink.stream;
    this.output.blocked = false;
    out.play().catch(() => { this.output.blocked = true; });
    this.output.nodes = { source, up, splitter, left, right, mono, gain, limiter, dataL: new Uint8Array(512), dataR: new Uint8Array(512) };
  }

  disposeOutput() {
    const { nodes } = this.output;
    if (nodes) for (const node of [nodes.source, nodes.up, nodes.splitter, nodes.mono, nodes.gain, nodes.limiter]) { try { node.disconnect(); } catch { /* já desconectado */ } }
    this.output.nodes = null;
    this.$('voiceOut').srcObject = null;
    this.output.left = this.output.right = 0;
    this.output.makeup = 1;
  }

  rms(analyser, data) {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const value of data) { const x = (value - 128) / 128; sum += x * x; }
    return Math.sqrt(sum / data.length);
  }

  updateOutput() {
    const output = this.output;
    const stream = this.$('remoteAudio').srcObject;
    const tracks = stream ? stream.getAudioTracks().filter(track => track.readyState === 'live') : [];
    const key = tracks.map(track => track.id).join(',');
    if (key !== output.key) {
      this.disposeOutput();
      output.key = key;
      if (tracks.length) { try { this.buildOutput(tracks); } catch { this.disposeOutput(); } }
    }
    const { nodes } = output;
    if (nodes) {
      output.left = Math.max(this.rms(nodes.left, nodes.dataL), output.left * 0.92);
      output.right = Math.max(this.rms(nodes.right, nodes.dataR), output.right * 0.92);
      const loud = Math.max(output.left, output.right);
      if (loud > 0.01) {
        const makeup = Math.min(output.left, output.right) < loud * 0.12 ? 2 : 1;
        if (makeup !== output.makeup) { output.makeup = makeup; this.applyOutputGain(); }
      }
    }
    const active = Boolean(nodes) && this.context.state === 'running' && !output.blocked;
    if (active !== output.active) { output.active = active; this.applyVolume(); }
  }

  renderStates() {
    const micOn = Boolean(this.media.micStream);
    const mic = this.$('voiceMicBtn');
    mic.setAttribute('aria-pressed', String(micOn));
    mic.setAttribute('aria-label', micOn ? 'Desligar microfone' : 'Ativar microfone');
    this.$('personLocal').dataset.mic = micOn ? 'on' : 'off';
    const lobbyMic = this.$('lobbyMicBtn');
    lobbyMic.setAttribute('aria-pressed', String(micOn));
    lobbyMic.setAttribute('aria-label', micOn ? 'Desligar microfone' : 'Ativar microfone');
    this.$('lobbyPreview').dataset.mic = micOn ? 'on' : 'off';
    this.$('personRemote').dataset.mic = this.remote?.mic ? 'on' : 'off';
    this.$('personRemote').dataset.muted = String(this.settings.muted);
    this.paintStates();
  }

  paintStates() {
    const local = this.meters.local;
    const remote = this.meters.remote;
    const micOn = Boolean(this.media.micStream);
    this.$('stateLocal').textContent = !micOn ? 'Microfone desligado' : local.speaking ? 'Falando' : 'Ouvindo';
    const present = Boolean(this.remote);
    this.$('stateRemote').textContent = !present ? 'Aguardando outra pessoa' : this.settings.muted ? 'Silenciado por você' : !this.remote.mic ? 'Microfone desligado' : remote.speaking ? 'Falando' : 'Ouvindo';
  }

  tick(now) {
    this.frame = requestAnimationFrame(next => this.tick(next));
    if (now - this.lastTick < 33) return;
    this.lastTick = now;
    const hasAudio = this.media.micStream || this.$('remoteAudio').srcObject;
    if (!hasAudio && !this.meters.local.level && !this.meters.remote.level) return;
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      try { this.context = new AudioContext(); } catch { return; }
    }
    if (this.context.state !== 'running') {
      this.context.resume().catch(() => {});
      if (this.output.active) { this.output.active = false; this.applyVolume(); }
      return;
    }
    this.updateOutput();
    const sides = [
      ['local', this.meters.local.read(this.context, now), ['personLocal', 'lobbyPreview']],
      ['remote', this.meters.remote.read(this.context, now), ['personRemote']]
    ];
    let changed = false;
    for (const [side, meter, ids] of sides) {
      const speaking = meter.speaking && (side === 'local' ? Boolean(this.media.micStream) : Boolean(this.remote?.mic));
      const level = speaking ? meter.level : 0;
      for (const id of ids) {
        const element = this.$(id);
        element.style.setProperty('--level', level.toFixed(3));
        if (element.dataset.speaking !== String(speaking)) { element.dataset.speaking = String(speaking); changed = true; }
      }
    }
    const micLevel = (this.media.micStream ? this.meters.local.level : 0).toFixed(3);
    this.$('micMeter').style.setProperty('--level', micLevel);
    this.$('lobbyMeter').style.setProperty('--level', micLevel);
    if (changed) this.paintStates();
  }
}
