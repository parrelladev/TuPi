// Distribuição visual local: fechar ou destacar um painel não encerra os demais.
export function planPanels({ screen, youtube, whiteboard, primary, maximized }) {
  const active = [];
  if (screen || (!youtube && !whiteboard)) active.push('screen');
  if (youtube) active.push('youtube');
  if (whiteboard) active.push('whiteboard');
  return {
    active,
    primary: active.includes(primary) ? primary : whiteboard ? 'whiteboard' : active[0],
    maximized: active.includes(maximized) ? maximized : null
  };
}

export class StageLayout {
  constructor(ui, youtube, whiteboard) {
    this.ui = ui;
    this.youtube = youtube;
    this.whiteboard = whiteboard;
    this.stage = ui.$('stagePanel');
    this.panels = { screen: this.stage.querySelector('.screen-area'), youtube: ui.$('youtubePanel'), whiteboard: whiteboard.panel };
    this.names = { screen: 'Tela compartilhada', youtube: 'YouTube', whiteboard: 'Quadro Branco' };
    this.split = 60;
    this.previousActive = '';
    for (const [key, panel] of Object.entries(this.panels)) {
      panel.dataset.stagePanel = key;
      panel.classList.add('stage-tile');
      const actions = document.createElement('div');
      actions.className = 'stage-panel-actions';
      actions.innerHTML = `<button type="button" data-stage-focus="${key}" aria-label="Dar destaque: ${this.names[key]}" title="Dar destaque"><i class="ph ph-layout" aria-hidden="true"></i></button><button type="button" data-stage-expand="${key}" aria-label="Ampliar: ${this.names[key]}" title="Ampliar painel"><i class="ph ph-corners-out" aria-hidden="true"></i></button>`;
      if (key === 'whiteboard') panel.querySelector('.wb-header-actions').append(actions);
      else {
        const header = document.createElement('div');
        header.className = 'stage-panel-header';
        const name = document.createElement('strong');
        name.textContent = this.names[key];
        header.append(name, actions);
        panel.prepend(header);
      }
    }
    this.prepareYouTubeControls();
    this.youtubeObserver = new ResizeObserver(() => this.updateYouTubeControls());
    this.youtubeObserver.observe(this.panels.youtube);
    this.stage.addEventListener('click', event => {
      const focus = event.target.closest('[data-stage-focus]');
      const expand = event.target.closest('[data-stage-expand]');
      if (focus) { this.primary = focus.dataset.stageFocus; this.update(); }
      if (expand) { this.maximized = this.maximized === expand.dataset.stageExpand ? null : expand.dataset.stageExpand; this.update(); }
    });
    this.divider = document.createElement('div');
    this.divider.className = 'stage-divider';
    this.divider.tabIndex = 0;
    this.divider.setAttribute('role', 'separator');
    this.divider.setAttribute('aria-orientation', 'vertical');
    this.divider.setAttribute('aria-label', 'Ajustar largura dos painéis');
    this.divider.setAttribute('aria-valuemin', '30');
    this.divider.setAttribute('aria-valuemax', '75');
    this.divider.title = 'Arraste para redimensionar; use as setas pelo teclado';
    this.stage.append(this.divider);
    this.divider.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      this.divider.setPointerCapture(event.pointerId);
      this.resizing = true;
      event.preventDefault();
    });
    this.divider.addEventListener('pointermove', event => {
      if (!this.resizing) return;
      const bounds = this.stage.getBoundingClientRect();
      this.setSplit((event.clientX - bounds.left) / bounds.width * 100);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) this.divider.addEventListener(type, () => { this.resizing = false; });
    this.divider.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      this.setSplit(event.key === 'Home' ? 30 : event.key === 'End' ? 75 : this.split + (event.key === 'ArrowLeft' ? -2 : 2));
    });
    ui.onLocalMedia(() => this.update());
    this.setSplit(this.split);
    this.update();
  }

  prepareYouTubeControls() {
    const panel = this.panels.youtube;
    this.videoControls = [...panel.querySelectorAll(':scope > .youtube-form, :scope > .youtube-title-row, :scope > .youtube-controls, :scope > .youtube-volume, :scope > .youtube-status')].map(node => {
      const anchor = document.createComment('Posição original dos controles do YouTube');
      node.before(anchor);
      return { node, anchor };
    });
    this.videoDialog = document.createElement('dialog');
    this.videoDialog.className = 'shortcuts-dialog stage-video-dialog';
    this.videoDialog.id = 'stageVideoControls';
    this.videoDialog.setAttribute('aria-labelledby', 'stageVideoControlsTitle');
    this.videoDialog.innerHTML = '<div class="shortcuts-head"><h2 id="stageVideoControlsTitle"><i class="ph ph-sliders-horizontal" aria-hidden="true"></i>Controles do YouTube</h2><button class="btn btn-soft" type="button" aria-label="Fechar controles do YouTube"><i class="ph ph-x" aria-hidden="true"></i></button></div><div class="stage-video-controls"></div>';
    panel.append(this.videoDialog);
    this.videoDialog.querySelector('button').onclick = () => this.videoDialog.close();
    this.videoDialog.addEventListener('click', event => { if (event.target === this.videoDialog) this.videoDialog.close(); });
    this.videoSettingsButton = document.createElement('button');
    this.videoSettingsButton.type = 'button';
    this.videoSettingsButton.setAttribute('aria-label', 'Controles do YouTube');
    this.videoSettingsButton.setAttribute('aria-haspopup', 'dialog');
    this.videoSettingsButton.setAttribute('aria-controls', this.videoDialog.id);
    this.videoSettingsButton.title = 'Controles do YouTube';
    this.videoSettingsButton.innerHTML = '<i class="ph ph-sliders-horizontal" aria-hidden="true"></i>';
    panel.querySelector('.stage-panel-actions').prepend(this.videoSettingsButton);
    this.videoSettingsButton.onclick = () => this.videoDialog.showModal();
  }

  updateYouTubeControls() {
    const panel = this.panels.youtube;
    const compact = this.youtube.isOpen() && this.stage.dataset.panelCount !== '1' && panel.clientHeight > 0 && panel.clientHeight < 420;
    this.videoSettingsButton.hidden = !compact;
    if (!this.youtube.isOpen() || !compact) this.videoDialog.close();
    if (compact === this.compactVideoControls) return;
    this.compactVideoControls = compact;
    panel.classList.toggle('stage-compact', compact);
    for (const { node, anchor } of this.videoControls) {
      if (compact) this.videoDialog.querySelector('.stage-video-controls').append(node);
      else anchor.after(node);
    }
  }

  setSplit(value) {
    this.split = Math.min(75, Math.max(30, value));
    this.stage.style.setProperty('--stage-split', `${this.split}%`);
    this.divider.setAttribute('aria-valuenow', String(Math.round(this.split)));
  }

  update() {
    const layout = planPanels({ screen: this.panels.screen.classList.contains('active'), youtube: this.youtube.isOpen(), whiteboard: this.whiteboard.isOpen(), primary: this.primary, maximized: this.maximized });
    // Abrir outro recurso restaura a composição, preservando qualquer mídia ativa.
    if (layout.active.some(key => !this.previousActive.split(',').includes(key))) layout.maximized = null;
    this.previousActive = layout.active.join(',');
    this.primary = layout.primary;
    this.maximized = layout.maximized;
    this.stage.dataset.panelCount = String(layout.active.length);
    this.stage.dataset.expanded = this.maximized || '';
    for (const [key, panel] of Object.entries(this.panels)) {
      const active = layout.active.includes(key);
      panel.classList.toggle('stage-panel-off', !active || !!this.maximized && key !== this.maximized);
      panel.classList.toggle('stage-primary', key === this.primary);
      const focus = panel.querySelector('[data-stage-focus]');
      focus.setAttribute('aria-pressed', String(key === this.primary));
      focus.hidden = layout.active.length < 2;
      const expand = panel.querySelector('[data-stage-expand]');
      expand.hidden = layout.active.length < 2;
      expand.setAttribute('aria-pressed', String(key === this.maximized));
      expand.setAttribute('aria-label', `${key === this.maximized ? 'Restaurar composição' : 'Ampliar'}: ${this.names[key]}`);
      expand.title = key === this.maximized ? 'Restaurar composição' : 'Ampliar painel';
      expand.querySelector('i').className = key === this.maximized ? 'ph ph-corners-in' : 'ph ph-corners-out';
    }
    for (const [id, open] of [['youtubeToggleBtn', this.youtube.isOpen()], ['whiteboardBtn', this.whiteboard.isOpen()], ['screenBtn', this.panels.screen.classList.contains('active')]]) {
      const button = this.ui.$(id);
      button.classList.toggle('is-on', open);
      button.setAttribute('aria-pressed', String(open));
    }
    this.updateYouTubeControls();
    this.ui.$('whiteboardBtn').setAttribute('aria-expanded', String(this.whiteboard.isOpen()));
    this.ui.$('whiteboardBtn').setAttribute('aria-label', this.whiteboard.isOpen() ? 'Fechar Quadro Branco' : 'Abrir Quadro Branco');
  }
}
