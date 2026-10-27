// Controles sobre a tela compartilhada: tela cheia, ajustar/preencher e mudo do áudio da tela.
export class ScreenControls {
  constructor(ui, media) {
    this.ui = ui;
    this.media = media;
    this.area = document.querySelector('.screen-area');
    this.fit = false;
    this.remoteMuted = false;
    this.sharedMuted = false;
    const $ = ui.$;
    this.fitBtn = $('screenFitBtn');
    this.fullBtn = $('screenFullBtn');
    this.audioBtn = $('screenAudioBtn');
    this.shareBtn = $('shareAudioBtn');

    this.fitBtn.addEventListener('click', () => this.toggleFit());
    this.fullBtn.addEventListener('click', () => this.toggleFullscreen());
    this.audioBtn.addEventListener('click', () => {
      this.remoteMuted = !this.remoteMuted;
      this.render();
    });
    this.shareBtn.addEventListener('click', () => {
      this.sharedMuted = !this.sharedMuted;
      this.media.setScreenAudioEnabled(!this.sharedMuted);
      this.render();
    });
    document.addEventListener('fullscreenchange', () => this.render());
    ui.onLocalMedia(() => this.render());
    this.render();
  }

  canFullscreen() { return this.area.classList.contains('active') && Boolean(this.area.requestFullscreen); }

  toggleFit() {
    this.fit = !this.fit;
    this.ui.$('screenViews').classList.toggle('fit-cover', this.fit);
    this.render();
  }

  async toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (this.canFullscreen()) await this.area.requestFullscreen();
    } catch { this.ui.notify('Não foi possível entrar em tela cheia.'); }
  }

  setLevel(button, muted, label) {
    button.dataset.level = muted ? 'off' : 'high';
    button.setAttribute('aria-pressed', String(muted));
    const text = muted ? `Reativar ${label}` : `Silenciar ${label}`;
    button.setAttribute('aria-label', text);
    button.title = text;
  }

  render() {
    const flags = this.ui.getRemoteFlags();
    const sharing = this.media.hasScreenAudio();
    const watching = flags.screen && flags.screenAudio;
    if (!sharing) this.sharedMuted = false;
    if (!watching) this.remoteMuted = false;
    this.shareBtn.classList.toggle('hidden', !sharing);
    this.audioBtn.classList.toggle('hidden', !watching);
    this.setLevel(this.shareBtn, this.sharedMuted, 'o áudio que você compartilha');
    this.setLevel(this.audioBtn, this.remoteMuted, 'o áudio da tela');
    this.ui.$('screenAudio').muted = this.remoteMuted;

    this.fitBtn.setAttribute('aria-pressed', String(this.fit));
    const fitText = this.fit ? 'Ajustar a tela inteira (sem cortar)' : 'Preencher o espaço (cortar bordas)';
    this.fitBtn.setAttribute('aria-label', fitText);
    this.fitBtn.title = fitText;
    const fullscreen = document.fullscreenElement === this.area;
    this.area.classList.toggle('is-fs', fullscreen);
    this.fullBtn.setAttribute('aria-pressed', String(fullscreen));
    const fullText = fullscreen ? 'Sair da tela cheia (F)' : 'Tela cheia (F)';
    this.fullBtn.setAttribute('aria-label', fullText);
    this.fullBtn.title = fullText;
  }
}
