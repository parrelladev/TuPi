const HEIGHTS = { '480': 480, '720': 720, '1080': 1080, '1440': 1440, '2160': 2160, native: null };
const PRESETS = {
  standard: { height: 720, fps: 30, bitrate: 8 },
  performance: { height: 480, fps: 30, bitrate: 3 },
  high: { height: 1080, fps: 30, bitrate: 12 },
  maximum: { height: 1440, fps: 30, bitrate: 20 },
  ultra: { height: 2160, fps: 60, bitrate: 50 }
};

export class QualitySettings {
  constructor(ui, media) {
    this.ui = ui;
    this.media = media;
    this.preset = 'standard';
    this.adaptiveLevel = 0;
    this.poorSamples = 0;
    this.goodSamples = 0;
    const presets = document.querySelector('.quality-presets');
    if (presets && !presets.querySelector('[data-quality-preset="ultra"]')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.qualityPreset = 'ultra';
      button.setAttribute('aria-pressed', 'false');
      button.innerHTML = 'Ultra <small>Tentativa 4K, 60 fps</small>';
      presets.append(button);
      const resolution = ui.$('screenResolution');
      if (![...resolution.options].some(option => option.value === '2160')) resolution.add(new Option('2160p (4K)', '2160'));
    }
    for (const button of document.querySelectorAll('[data-quality-preset]')) {
      button.addEventListener('click', () => this.selectPreset(button.dataset.qualityPreset));
    }
    for (const id of ['screenResolution', 'screenFps', 'screenBitrate', 'screenFocus']) {
      ui.$(id).addEventListener('change', () => { this.preset = 'custom'; this.updatePresetButtons(); void this.applySource(); });
    }
    this.selectPreset('standard', false);
    const codecNames = globalThis.RTCRtpSender?.getCapabilities?.('video')?.codecs
      ?.map(codec => codec.mimeType?.replace(/^video\//, ''))
      .filter(Boolean);
    if (codecNames?.length) this.ui.setCodecCapabilities([...new Set(codecNames)].join(', '));
  }

  readScreen() {
    const heightValue = uiValue(this.ui, 'screenResolution');
    const height = HEIGHTS[heightValue];
    const fps = clamp(Number(uiValue(this.ui, 'screenFps')) || 30, 1, 144);
    const bitrateMbps = clamp(Number(uiValue(this.ui, 'screenBitrate')) || 8, 1, 50);
    return { height, fps, bitrate: bitrateMbps * 1_000_000, focus: uiValue(this.ui, 'screenFocus') };
  }

  captureConstraints() {
    const profile = this.readScreen();
    const video = { frameRate: { ideal: profile.fps, max: profile.fps } };
    if (profile.height) {
      video.height = { ideal: profile.height };
      video.width = { ideal: Math.round(profile.height * 16 / 9) };
    }
    return video;
  }

  async applySource() {
    const stream = this.media.screenStream;
    const track = stream?.getVideoTracks().find(item => item.readyState === 'live');
    const sender = this.media.screenSender;
    const profile = this.readScreen();
    if (track?.applyConstraints) {
      try { await track.applyConstraints(this.captureConstraints()); }
      catch (error) { this.ui.notify(`O navegador não conseguiu aplicar toda a qualidade solicitada para a tela: ${error.message}`); }
    }
    if (sender?.getParameters && sender?.setParameters) {
      try {
        const parameters = sender.getParameters();
        if (parameters.encodings?.length) {
          parameters.encodings[0].maxBitrate = Math.round(profile.bitrate * Math.pow(0.8, this.adaptiveLevel));
          parameters.encodings[0].maxFramerate = profile.fps;
          parameters.degradationPreference = profile.focus === 'game' ? 'maintain-framerate' : 'maintain-resolution';
          await sender.setParameters(parameters);
        }
      } catch (error) {
        this.ui.notify(`O navegador não aceitou o limite de bitrate da tela: ${error.message}`);
      }
    }
    if (track) track.contentHint = profile.focus === 'game' ? 'motion' : profile.focus === 'watch' ? 'detail' : '';
    this.updateEffective(track);
  }

  updateEffective(track) {
    if (!track) return;
    const settings = track.getSettings?.() || {};
    this.ui.setEffectiveQuality(`Tela: ${settings.width || '?'}×${settings.height || '?'} · ${settings.frameRate || '?'} fps`);
  }

  selectPreset(name, apply = true) {
    const preset = PRESETS[name];
    if (!preset) return;
    this.preset = name;
    this.adaptiveLevel = this.poorSamples = this.goodSamples = 0;
    this.ui.$('screenResolution').value = String(preset.height);
    this.ui.$('screenFps').value = String(preset.fps);
    this.ui.$('screenBitrate').value = String(preset.bitrate);
    this.updatePresetButtons();
    if (apply) void this.applySource();
  }

  updatePresetButtons() {
    for (const button of document.querySelectorAll('[data-quality-preset]')) {
      button.setAttribute('aria-pressed', String(button.dataset.qualityPreset === this.preset));
    }
  }

  observeNetwork({ rtt, loss }) {
    if (!Number.isFinite(rtt)) return;
    const poor = rtt > 0.3 || (Number.isFinite(loss) && loss > 0.05);
    const good = rtt < 0.18 && Number.isFinite(loss) && loss < 0.02;
    this.poorSamples = poor ? this.poorSamples + 1 : 0;
    this.goodSamples = good ? this.goodSamples + 1 : 0;
    let changed = false;
    if (this.poorSamples >= 3 && this.adaptiveLevel < 3) {
      this.adaptiveLevel++;
      this.poorSamples = 0;
      changed = true;
    } else if (this.goodSamples >= 8 && this.adaptiveLevel > 0) {
      this.adaptiveLevel--;
      this.goodSamples = 0;
      changed = true;
    }
    if (changed) void this.applySource();
  }
}

function uiValue(ui, id) { return ui.$(id).value; }
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
