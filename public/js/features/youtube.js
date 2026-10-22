const VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;

function parseVideoId(value) {
  const input = value.trim();
  if (VIDEO_ID.test(input)) return input;
  try {
    const url = new URL(input);
    if (!['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtube-nocookie.com', 'youtube-nocookie.com'].includes(url.hostname)) return null;
    const id = url.hostname.includes('youtu.be') ? url.pathname.split('/').filter(Boolean)[0] :
      url.searchParams.get('v') || url.pathname.match(/^\/(?:embed|shorts|live)\/([^/?]+)/)?.[1];
    return id && VIDEO_ID.test(id) ? id : null;
  } catch { return null; }
}

export class YouTubeTogether {
  constructor(ui) {
    this.ui = ui;
    this.channel = null;
    this.player = null;
    this.videoId = null;
    this.isHost = false;
    this.peerId = crypto.randomUUID();
    this.clock = 0;
    this.lastCommand = { clock: 0, peerId: '' };
    this.remoteAction = false;
    this.syncTimer = null;
    this.playbackTimer = null;
    this.progressTimer = null;
    this.clockOffset = 0;
    this.clockTimer = null;
    this.tolerance = 1;
    this.bindUI();
  }

  bindUI() {
    this.ui.$('youtubeToggleBtn').addEventListener('click', () => {
      const open = this.ui.$('youtubePanel').classList.contains('hidden');
      this.setPanelOpen(open);
    });
    this.ui.$('youtubeForm').addEventListener('submit', event => {
      event.preventDefault();
      const id = parseVideoId(this.ui.$('youtubeUrl').value);
      if (!id) { this.setStatus('Cole um link válido do YouTube ou um ID de vídeo de 11 caracteres.'); return; }
      this.videoId = id;
      this.send({ type: 'load', videoId: id });
      this.loadVideo(id);
    });
    this.ui.$('youtubeTolerance').addEventListener('change', event => { this.tolerance = Number(event.target.value); });
    this.ui.$('youtubePlay').addEventListener('click', () => this.userAction('play'));
    this.ui.$('youtubePause').addEventListener('click', () => this.userAction('pause'));
    this.ui.$('youtubeSync').addEventListener('click', () => this.requestSync());
    this.ui.$('youtubeSeek').addEventListener('change', event => {
      const seconds = Number(event.target.value);
      if (!Number.isFinite(seconds)) return;
      this.publishState('seek', false, seconds);
      this.applyRemoteState('seek', seconds);
    });
    this.ui.$('youtubeSeek').addEventListener('input', event => { this.ui.$('youtubePosition').textContent = this.formatTime(Number(event.target.value)); });
  }

  attach(channel, isHost) {
    this.detach();
    this.channel = channel;
    this.isHost = isHost;
    channel.onopen = () => {
      this.setStatus('Controle P2P conectado. Cada navegador reproduz o vídeo do YouTube.');
      if (this.videoId) this.send({ type: 'load', videoId: this.videoId });
      this.syncTimer = setInterval(() => this.publishSnapshot(), 3000);
      this.pingClock(); this.clockTimer = setInterval(() => this.pingClock(), 5000);
    };
    channel.onclose = () => this.setStatus('Controle P2P desconectado.');
    channel.onerror = () => this.setStatus('O canal de sincronização apresentou um erro.');
    channel.onmessage = event => this.receive(event.data);
  }

  detach() {
    clearInterval(this.syncTimer); clearInterval(this.playbackTimer); clearInterval(this.progressTimer); clearInterval(this.clockTimer);
    this.syncTimer = this.playbackTimer = this.progressTimer = this.clockTimer = null;
    const channel = this.channel; this.channel = null;
    if (channel) {
      channel.onopen = channel.onclose = channel.onerror = channel.onmessage = null;
      if (channel.readyState !== 'closed') channel.close();
    }
    if (this.player) { this.player.destroy(); this.player = null; }
    this.videoId = null; this.lastCommand = { clock: 0, peerId: '' }; this.clock = 0;
    this.setPanelOpen(false);
  }

  async ensureAPI() {
    if (window.YT?.Player) return;
    if (!window.youtubeApiPromise) {
      window.youtubeApiPromise = new Promise((resolve, reject) => {
        const previous = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => { previous?.(); resolve(); };
        const script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api'; script.async = true;
        script.onerror = () => reject(new Error('Não foi possível carregar o player do YouTube. Verifique a conexão e tente novamente.'));
        document.head.append(script);
        setTimeout(() => { if (!window.YT?.Player) reject(new Error('O player do YouTube demorou para responder.')); }, 15000);
      });
    }
    try { await window.youtubeApiPromise; }
    catch (error) { window.youtubeApiPromise = null; throw error; }
  }

  async loadVideo(id) {
    this.videoId = id;
    this.setPanelOpen(true);
    if (this.player) { this.player.destroy(); this.player = null; }
    this.ui.$('youtubePlayer').replaceChildren();
    this.ui.$('youtubeVideoTitle').textContent = `Vídeo ${id}`;
    this.setStatus('Carregando player do YouTube…');
    try {
      await this.ensureAPI();
      if (this.videoId !== id) return;
      const host = document.createElement('div'); host.id = 'youtubePlayerFrame';
      this.ui.$('youtubePlayer').replaceChildren(host);
      this.player = new window.YT.Player(host, {
        width: '100%', height: '100%', videoId: id,
        playerVars: { playsinline: 1, origin: location.origin, enablejsapi: 1, controls: 1 },
        events: {
          onReady: () => {
            this.setStatus('Player pronto. Pressione Reproduzir em cada navegador se o autoplay for bloqueado.');
            if (this.pendingState) { const pending = this.pendingState; this.pendingState = null; this.applyRemoteState(pending.action, pending.seconds); }
            clearInterval(this.progressTimer);
            this.progressTimer = setInterval(() => {
              if (!this.player) return;
              const duration = this.player.getDuration() || 0;
              const now = Date.now();
              const currentTime = this.player.getCurrentTime() || 0;
              if (this.player.getPlayerState() === 1 && Number.isFinite(this.lastObservedTime) &&
                  Math.abs(currentTime - this.lastObservedTime - (now - this.lastObservedAt) / 1000) > 2) {
                this.publishState('seek', false, currentTime);
              }
              this.lastObservedTime = currentTime; this.lastObservedAt = now;
              const seek = this.ui.$('youtubeSeek'); seek.max = String(Math.max(1, Math.floor(duration)));
              if (document.activeElement !== seek) seek.value = String(Math.floor(currentTime));
              this.ui.$('youtubePosition').textContent = `${this.formatTime(currentTime)} / ${this.formatTime(duration)}`;
            }, 500);
          },
          onStateChange: event => this.onPlayerState(event),
          onAutoplayBlocked: () => this.setStatus('Reprodução automática bloqueada. Pressione Reproduzir neste navegador.'),
          onError: event => this.onPlayerError(event.data)
        }
      });
    } catch (error) { this.setStatus(error.message); }
  }

  setPanelOpen(open) {
    this.ui.$('youtubePanel').classList.toggle('hidden', !open);
    this.ui.$('youtubeToggleBtn').setAttribute('aria-expanded', String(open));
    this.ui.$('youtubeToggleBtn').setAttribute('aria-label', open ? 'Fechar YouTube Watch Together' : 'Abrir YouTube Watch Together');
    this.ui.$('stagePanel').classList.toggle('youtube-active', open);
  }

  onPlayerState(event) {
    const names = { '-1': 'Aguardando reprodução', 0: 'Vídeo encerrado', 1: 'Reproduzindo', 2: 'Pausado', 3: 'Carregando vídeo', 5: 'Vídeo pronto' };
    this.setStatus(names[event.data] || 'Player atualizado.');
    if (this.pendingState && [1, 2, 5].includes(event.data)) {
      const pending = this.pendingState; this.pendingState = null; this.applyRemoteState(pending.action, pending.seconds);
    }
    if (!this.remoteAction && [1, 2].includes(event.data)) this.publishState(event.data === 1 ? 'play' : 'pause', true);
  }

  onPlayerError(code) {
    const messages = { 2: 'ID de vídeo inválido.', 5: 'O vídeo não pode ser reproduzido neste navegador.', 100: 'Vídeo indisponível ou removido.', 101: 'O proprietário desativou a reprodução incorporada.', 150: 'O proprietário desativou a reprodução incorporada.', 153: 'O YouTube recusou o player incorporado neste contexto.' };
    this.setStatus(messages[code] || `O YouTube informou um erro (${code}).`);
  }

  userAction(action) {
    if (!this.player || !this.videoId) { this.setStatus('Cole um link do YouTube para começar.'); return; }
    this.publishState(action, false);
    this.applyAction(action);
  }

  publishState(action, fromPlayer, position) {
    const seconds = Number.isFinite(position) ? position : this.player?.getCurrentTime?.() || 0;
    this.clock = Math.max(this.clock, this.lastCommand.clock) + 1;
    const command = { type: 'command', action, seconds, at: Date.now(), videoId: this.videoId, clock: this.clock, peerId: this.peerId };
    this.lastCommand = { clock: command.clock, peerId: command.peerId };
    this.send(command);
    if (fromPlayer) return;
  }

  applyAction(action) {
    if (action === 'play') this.player?.playVideo();
    else if (action === 'pause') this.player?.pauseVideo();
  }

  receive(raw) {
    if (typeof raw !== 'string' || raw.length > 2000) return;
    let message; try { message = JSON.parse(raw); } catch { return; }
    if (!message || typeof message !== 'object' || Array.isArray(message) || typeof message.type !== 'string') return;
    if (message.type === 'ping' && Number.isFinite(message.sentAt)) { this.send({ type: 'pong', sentAt: message.sentAt, remoteAt: Date.now() }); return; }
    if (message.type === 'pong' && Number.isSafeInteger(message.sentAt) && Number.isSafeInteger(message.remoteAt) && Math.abs(message.remoteAt - message.sentAt) < 24 * 60 * 60 * 1000) {
      const now = Date.now(); this.clockOffset = message.remoteAt - ((message.sentAt + now) / 2); return;
    }
    if (message.type === 'load' && typeof message.videoId === 'string' && VIDEO_ID.test(message.videoId)) {
      if (message.videoId !== this.videoId) { this.ui.$('youtubeUrl').value = `https://youtu.be/${message.videoId}`; void this.loadVideo(message.videoId); }
      return;
    }
    if (message.type === 'sync-request' && this.isHost) { this.publishSnapshot(); return; }
    if (message.type === 'command' && ['play', 'pause', 'seek'].includes(message.action) && Number.isFinite(message.seconds) && message.seconds >= 0 && message.seconds <= 86400 && Number.isSafeInteger(message.at) && Math.abs(Date.now() - message.at) < 24 * 60 * 60 * 1000 && VIDEO_ID.test(message.videoId || '')) {
      const incoming = { clock: Number.isSafeInteger(message.clock) && message.clock >= 0 ? message.clock : 0, peerId: typeof message.peerId === 'string' ? message.peerId.slice(0, 128) : '' };
      this.clock = Math.max(this.clock, incoming.clock);
      if (this.compare(incoming, this.lastCommand) <= 0) return;
      this.lastCommand = incoming;
      if (message.videoId !== this.videoId) { this.ui.$('youtubeUrl').value = `https://youtu.be/${message.videoId}`; void this.loadVideo(message.videoId); }
      const elapsed = Number.isFinite(message.at) ? Math.max(0, (Date.now() + this.clockOffset - message.at) / 1000) : 0;
      this.applyRemoteState(message.action, message.seconds + (message.action === 'play' ? elapsed : 0));
      return;
    }
    if (message.type === 'snapshot' && !this.isHost && message.videoId === this.videoId && Number.isFinite(message.seconds) && message.seconds >= 0 && message.seconds <= 86400 && Number.isSafeInteger(message.at) && Math.abs(Date.now() - message.at) < 24 * 60 * 60 * 1000 && ['play', 'pause'].includes(message.action)) {
      const elapsed = message.action === 'play' ? Math.max(0, (Date.now() + this.clockOffset - (message.at || Date.now())) / 1000) : 0;
      this.applyRemoteState(message.action, message.seconds + elapsed);
    }
  }

  compare(a, b) { return a.clock - b.clock || a.peerId.localeCompare(b.peerId); }
  formatTime(value) { const seconds = Math.max(0, Math.floor(value || 0)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; }

  applyRemoteState(action, seconds) {
    if (!this.player) { this.pendingState = { action, seconds }; return; }
    this.remoteAction = true;
    const current = this.player.getCurrentTime() || 0;
    const drift = seconds - current;
    if (Math.abs(drift) > this.tolerance) this.player.seekTo(Math.max(0, seconds), true);
    else if (Math.abs(drift) > 0.15 && action === 'play') {
      const correctionRate = drift > 0 ? 1.05 : 0.95;
      if (this.player.getAvailablePlaybackRates?.().includes(correctionRate)) {
        this.player.setPlaybackRate(correctionRate);
        clearTimeout(this.playbackTimer);
        this.playbackTimer = setTimeout(() => { this.player?.setPlaybackRate(1); }, 1800);
      }
    }
    if (action === 'seek') this.player.seekTo(Math.max(0, seconds), true);
    else this.applyAction(action);
    setTimeout(() => { this.remoteAction = false; }, 800);
  }

  publishSnapshot() {
    if (!this.isHost || this.channel?.readyState !== 'open' || !this.player || !this.videoId) return;
    const state = this.player.getPlayerState();
    if (![1, 2].includes(state)) return;
    this.send({ type: 'snapshot', videoId: this.videoId, action: state === 1 ? 'play' : 'pause', seconds: this.player.getCurrentTime() || 0, at: Date.now() });
  }

  requestSync() {
    if (this.isHost) this.publishSnapshot();
    else this.send({ type: 'sync-request' });
    this.setStatus('Solicitando correção de sincronização…');
  }

  send(message) { try { if (this.channel?.readyState === 'open') this.channel.send(JSON.stringify(message)); } catch { this.setStatus('Não foi possível enviar o controle de sincronização.'); } }
  pingClock() { this.send({ type: 'ping', sentAt: Date.now() }); }
  setStatus(text) { this.ui.$('youtubeStatus').textContent = text; }
}
