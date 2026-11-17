const HELPER_URL = 'ws://127.0.0.1:17172';
const MOVE_INTERVAL_MS = 33;
const MAX_RAW_LENGTH = 300;
const REQUEST_TIMEOUT_MS = 20000;
const INPUT_LIMITS = { move: 40, wheel: 40, btn: 60, key: 60, text: 10 };

// Allow-list fechada: só esses KeyboardEvent.code chegam ao canal (espelha helper/key-map.js).
const ALLOWED_KEY_CODES = new Set([
  ...Array.from({ length: 26 }, (_, i) => `Key${String.fromCharCode(65 + i)}`),
  ...Array.from({ length: 10 }, (_, i) => `Digit${i}`),
  ...Array.from({ length: 10 }, (_, i) => `Numpad${i}`),
  ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
  'NumpadAdd', 'NumpadSubtract', 'NumpadMultiply', 'NumpadDivide', 'NumpadDecimal', 'NumpadEnter',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Enter', 'Escape', 'Tab', 'Backspace', 'Delete', 'Space',
  'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight',
  'CapsLock', 'Home', 'End', 'PageUp', 'PageDown', 'Insert',
  'Minus', 'Equal', 'BracketLeft', 'BracketRight', 'Semicolon', 'Quote', 'Comma', 'Period', 'Slash', 'Backslash', 'Backquote'
]);

const DECLINE_REASONS = {
  busy: 'A pessoa já está controlando outra sessão.',
  disabled: 'O controle remoto foi desativado.',
  timeout: 'O pedido expirou sem resposta.',
  manual: 'O pedido foi recusado.'
};

const clamp01 = value => Math.min(1, Math.max(0, value));
const validCoord = value => Number.isFinite(value) && value >= 0 && value <= 1;

export class RemoteControl {
  constructor(ui, media) {
    this.ui = ui;
    this.media = media;
    this.channel = null;
    this.local = { allow: false, autoAccept: false, screenOk: false };
    this.remote = { allow: false, autoAccept: false, screenOk: false };
    this.grant = null; // { role: 'owner' | 'controller', id }
    this.pendingRequestId = null;
    this.incomingRequestId = null;
    this.requestTimeout = null;
    this.requestAckTimeout = null;
    this.helperSocket = null;
    this.lastMoveSent = 0;
    this.seq = 0;
    this.incomingCounts = new Map();
    this.strikeCount = 0;
    this.bindUI();
    this.renderAllowUI();
    this.updateRequestButton();
    ui.onLocalMedia(() => this.syncScreenState());
  }

  // ---- canal P2P ----
  attach(channel) {
    this.detach();
    this.channel = channel;
    channel.onopen = () => this.sendToggle();
    channel.onclose = () => this.handlePeerGone();
    channel.onerror = () => this.handlePeerGone();
    channel.onmessage = event => this.receive(event.data);
  }

  detach() {
    this.endAnyGrant();
    const channel = this.channel; this.channel = null;
    if (channel) {
      channel.onopen = channel.onclose = channel.onerror = channel.onmessage = null;
      if (channel.readyState !== 'closed') channel.close();
    }
    this.remote = { allow: false, autoAccept: false, screenOk: false };
    this.pendingRequestId = null; this.incomingRequestId = null;
    clearTimeout(this.requestTimeout); clearTimeout(this.requestAckTimeout);
    this.updateRequestButton();
  }

  leave() {
    this.disconnectHelper();
    this.local = { allow: false, autoAccept: false, screenOk: false };
    this.ui.$('rcAllowCheck').checked = false;
    this.ui.$('rcAutoAcceptCheck').checked = false;
    this.detach();
  }

  send(message) { try { if (this.channel?.readyState === 'open') this.channel.send(JSON.stringify(message)); } catch { /* canal pode ter caído entre a checagem e o envio */ } }

  // ---- estado de compartilhamento de tela ----
  isScreenMonitor() {
    const track = this.media.screenStream?.getVideoTracks()[0];
    return Boolean(track && track.readyState === 'live' && track.getSettings?.().displaySurface === 'monitor');
  }

  syncScreenState() {
    const screenOk = this.isScreenMonitor();
    if (screenOk === this.local.screenOk) return;
    this.local.screenOk = screenOk;
    if (!screenOk) {
      if (this.grant?.role === 'owner') this.revoke();
      this.local.allow = false;
      this.disconnectHelper();
    }
    this.renderAllowUI();
    this.sendToggle();
  }

  // ---- UI ----
  bindUI() {
    const ui = this.ui;
    ui.$('rcMenuToggle').addEventListener('click', () => {
      const open = ui.$('rcOptions').classList.contains('hidden');
      ui.$('rcOptions').classList.toggle('hidden', !open);
      ui.$('rcMenuToggle').setAttribute('aria-expanded', String(open));
    });
    ui.$('rcAllowCheck').addEventListener('change', event => {
      if (!this.local.screenOk) { event.target.checked = false; return; }
      this.local.allow = event.target.checked;
      if (this.local.allow) this.connectHelper();
      else { this.disconnectHelper(); if (this.grant?.role === 'owner') this.revoke(); }
      this.sendToggle();
    });
    ui.$('rcAutoAcceptCheck').addEventListener('change', event => {
      this.local.autoAccept = event.target.checked;
      this.sendToggle();
    });
    ui.$('rcConnectBtn').addEventListener('click', () => this.connectHelper());
    ui.$('rcRequestBtn').addEventListener('click', () => this.requestControl());
    ui.$('rcRequestInlineBtn').addEventListener('click', () => this.requestControl());
    ui.$('rcAcceptBtn').addEventListener('click', () => this.respondToRequest(true));
    ui.$('rcDeclineBtn').addEventListener('click', () => this.respondToRequest(false));
    ui.$('remoteControlRequestDialog').addEventListener('click', event => { if (event.target === ui.$('remoteControlRequestDialog')) this.respondToRequest(false); });
    ui.$('rcRevokeBtn').addEventListener('click', () => this.revoke());
    ui.$('rcStopControllingBtn').addEventListener('click', () => this.stopControlling());
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && this.grant?.role === 'owner') { event.preventDefault(); this.revoke(); }
    });
    const video = ui.$('screenVideo');
    video.tabIndex = -1;
    video.addEventListener('pointermove', event => this.onPointerMove(event));
    video.addEventListener('pointerdown', event => this.onPointerButton(event, 1));
    video.addEventListener('pointerup', event => this.onPointerButton(event, 0));
    video.addEventListener('contextmenu', event => { if (this.isControlling()) event.preventDefault(); });
    video.addEventListener('wheel', event => this.onWheel(event), { passive: false });
    video.addEventListener('keydown', event => this.onKey(event, 1));
    video.addEventListener('keyup', event => this.onKey(event, 0));
  }

  renderAllowUI() {
    const check = this.ui.$('rcAllowCheck');
    check.disabled = !this.local.screenOk;
    this.ui.$('rcAllowHint').textContent = this.local.screenOk ? '' : 'Compartilhe a tela inteira (não uma janela ou aba) para habilitar.';
    if (!this.local.screenOk) check.checked = false;
  }

  updateRequestButton() {
    const available = Boolean(this.remote.allow && this.remote.screenOk);
    const enabled = available && !this.grant && !this.pendingRequestId;
    const label = this.pendingRequestId ? 'Pedido enviado…' : 'Pedir controle';
    this.ui.$('rcRequestBtn').disabled = !enabled;
    const inline = this.ui.$('rcRequestInlineBtn');
    inline.classList.toggle('hidden', !available || Boolean(this.grant));
    inline.disabled = !enabled;
    const span = inline.querySelector('span');
    if (span) span.textContent = label;
  }

  renderGrantUI() {
    this.ui.$('rcBeingControlledBanner').classList.toggle('hidden', this.grant?.role !== 'owner');
    this.ui.$('rcControllingBanner').classList.toggle('hidden', this.grant?.role !== 'controller');
    this.updateRequestButton();
  }

  // ---- captura de input (lado controlador) ----
  isControlling() { return this.grant?.role === 'controller'; }

  nextSeq() { this.seq += 1; return this.seq; }

  videoCoords(event) {
    const video = this.ui.$('screenVideo');
    const rect = video.getBoundingClientRect();
    if (!video.videoWidth || !video.videoHeight || !rect.width || !rect.height) return null;
    const videoAspect = video.videoWidth / video.videoHeight;
    const rectAspect = rect.width / rect.height;
    let contentW = rect.width, contentH = rect.height, barX = 0, barY = 0;
    if (rectAspect > videoAspect) { contentW = rect.height * videoAspect; barX = (rect.width - contentW) / 2; }
    else { contentH = rect.width / videoAspect; barY = (rect.height - contentH) / 2; }
    const nx = (event.clientX - rect.left - barX) / contentW;
    const ny = (event.clientY - rect.top - barY) / contentH;
    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return null;
    return { x: clamp01(nx), y: clamp01(ny) };
  }

  onPointerMove(event) {
    if (!this.isControlling()) return;
    const coords = this.videoCoords(event);
    if (!coords) return;
    const now = performance.now();
    if (now - this.lastMoveSent < MOVE_INTERVAL_MS) return;
    this.lastMoveSent = now;
    this.send({ t: 'move', seq: this.nextSeq(), x: coords.x, y: coords.y });
  }

  onPointerButton(event, state) {
    if (!this.isControlling() || event.button > 2) return;
    event.preventDefault();
    const coords = this.videoCoords(event);
    const message = { t: 'btn', seq: this.nextSeq(), b: event.button, s: state };
    if (coords) { message.x = coords.x; message.y = coords.y; }
    this.send(message);
  }

  onWheel(event) {
    if (!this.isControlling()) return;
    event.preventDefault();
    this.send({ t: 'wheel', seq: this.nextSeq(), dx: Math.max(-500, Math.min(500, event.deltaX)), dy: Math.max(-500, Math.min(500, event.deltaY)) });
  }

  onKey(event, state) {
    if (!this.isControlling() || !ALLOWED_KEY_CODES.has(event.code)) return;
    event.preventDefault();
    this.send({ t: 'key', seq: this.nextSeq(), code: event.code, s: state });
  }

  // ---- protocolo de consentimento ----
  sendToggle() { this.send({ t: 'toggle', allow: this.local.allow, autoAccept: this.local.autoAccept, screenOk: this.local.screenOk }); }

  requestControl() {
    if (!this.remote.allow || !this.remote.screenOk || this.grant || this.pendingRequestId) return;
    this.pendingRequestId = crypto.randomUUID().slice(0, 8);
    this.send({ t: 'request', id: this.pendingRequestId });
    this.updateRequestButton();
    this.ui.$('rcHelperStatus').textContent = 'Pedido enviado. Aguardando resposta…';
    clearTimeout(this.requestAckTimeout);
    this.requestAckTimeout = setTimeout(() => {
      if (!this.pendingRequestId) return;
      this.pendingRequestId = null;
      this.updateRequestButton();
      this.ui.notify('O pedido de controle não foi respondido.');
    }, REQUEST_TIMEOUT_MS + 2000);
  }

  respondToRequest(accept) {
    clearTimeout(this.requestTimeout);
    const id = this.incomingRequestId; this.incomingRequestId = null;
    this.ui.$('remoteControlRequestDialog').close();
    if (!id) return;
    if (accept && !this.grant) { this.grant = { role: 'owner', id }; this.send({ t: 'accept', id }); this.renderGrantUI(); }
    else this.send({ t: 'decline', id, reason: 'manual' });
  }

  revoke() {
    if (this.grant?.role !== 'owner') return;
    this.grant = null;
    this.send({ t: 'revoke' });
    this.renderGrantUI();
  }

  stopControlling() {
    if (this.grant?.role !== 'controller') return;
    this.grant = null;
    this.send({ t: 'end' });
    this.renderGrantUI();
  }

  endAnyGrant() {
    if (!this.grant) return;
    this.send({ t: this.grant.role === 'owner' ? 'revoke' : 'end' });
    this.grant = null;
    this.renderGrantUI();
  }

  handlePeerGone() {
    this.grant = null;
    this.pendingRequestId = null; this.incomingRequestId = null;
    clearTimeout(this.requestTimeout); clearTimeout(this.requestAckTimeout);
    this.renderGrantUI();
  }

  isOverLimit(type) {
    const now = Date.now();
    const bucket = this.incomingCounts.get(type) || { start: now, count: 0 };
    if (now - bucket.start >= 1000) { bucket.start = now; bucket.count = 0; }
    bucket.count += 1;
    this.incomingCounts.set(type, bucket);
    return bucket.count > (INPUT_LIMITS[type] || 20);
  }

  receive(raw) {
    if (typeof raw !== 'string' || raw.length > MAX_RAW_LENGTH) return;
    let message; try { message = JSON.parse(raw); } catch { return; }
    if (!message || typeof message !== 'object' || Array.isArray(message) || typeof message.t !== 'string') return;

    if (message.t === 'toggle') {
      this.remote.allow = message.allow === true;
      this.remote.autoAccept = message.autoAccept === true;
      this.remote.screenOk = message.screenOk === true;
      this.updateRequestButton();
      return;
    }
    if (message.t === 'request' && typeof message.id === 'string' && message.id.length <= 16) {
      if (!this.local.allow || !this.local.screenOk) { this.send({ t: 'decline', id: message.id, reason: 'disabled' }); return; }
      if (this.grant) { this.send({ t: 'decline', id: message.id, reason: 'busy' }); return; }
      if (this.local.autoAccept) { this.grant = { role: 'owner', id: message.id }; this.send({ t: 'accept', id: message.id }); this.renderGrantUI(); return; }
      this.incomingRequestId = message.id;
      this.ui.$('remoteControlRequestDialog').showModal();
      clearTimeout(this.requestTimeout);
      this.requestTimeout = setTimeout(() => {
        if (this.incomingRequestId !== message.id) return;
        this.incomingRequestId = null;
        this.ui.$('remoteControlRequestDialog').close();
        this.send({ t: 'decline', id: message.id, reason: 'timeout' });
      }, REQUEST_TIMEOUT_MS);
      return;
    }
    if (message.t === 'accept' && message.id === this.pendingRequestId) {
      this.pendingRequestId = null;
      clearTimeout(this.requestAckTimeout);
      this.grant = { role: 'controller', id: message.id };
      this.renderGrantUI();
      this.ui.$('screenVideo').focus();
      return;
    }
    if (message.t === 'decline' && message.id === this.pendingRequestId) {
      this.pendingRequestId = null;
      clearTimeout(this.requestAckTimeout);
      this.updateRequestButton();
      this.ui.notify(DECLINE_REASONS[message.reason] || DECLINE_REASONS.manual);
      return;
    }
    if (message.t === 'revoke') {
      if (this.grant?.role === 'controller') { this.grant = null; this.renderGrantUI(); this.ui.notify('O controle remoto foi encerrado.'); }
      return;
    }
    if (message.t === 'end') {
      if (this.grant?.role === 'owner') { this.grant = null; this.renderGrantUI(); }
      return;
    }
    if (!['move', 'btn', 'wheel', 'key', 'text'].includes(message.t)) return;
    if (!this.grant || this.grant.role !== 'owner') return;
    if (this.isOverLimit(message.t)) {
      if (['key', 'btn'].includes(message.t)) {
        this.strikeCount += 1;
        if (this.strikeCount > 20) { this.revoke(); this.ui.notify('Controle remoto revogado: tráfego de entrada excessivo.'); }
      }
      return;
    }
    this.strikeCount = 0;
    this.forwardToHelper(message);
  }

  forwardToHelper(message) {
    if (!this.helperSocket || this.helperSocket.readyState !== WebSocket.OPEN) return;
    const t = message.t;
    if (t === 'move') {
      if (!validCoord(message.x) || !validCoord(message.y)) return;
      this.helperSocket.send(JSON.stringify({ t, x: message.x, y: message.y }));
    } else if (t === 'btn') {
      if (![0, 1, 2].includes(message.b) || ![0, 1].includes(message.s)) return;
      const payload = { t, b: message.b, s: message.s };
      if (validCoord(message.x) && validCoord(message.y)) { payload.x = message.x; payload.y = message.y; }
      this.helperSocket.send(JSON.stringify(payload));
    } else if (t === 'wheel') {
      if (!Number.isFinite(message.dx) || !Number.isFinite(message.dy) || Math.abs(message.dx) > 500 || Math.abs(message.dy) > 500) return;
      this.helperSocket.send(JSON.stringify({ t, dx: message.dx, dy: message.dy }));
    } else if (t === 'key') {
      if (!ALLOWED_KEY_CODES.has(message.code) || ![0, 1].includes(message.s)) return;
      this.helperSocket.send(JSON.stringify({ t, code: message.code, s: message.s }));
    } else if (t === 'text') {
      if (typeof message.value !== 'string' || message.value.length > 200 || /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(message.value)) return;
      this.helperSocket.send(JSON.stringify({ t, value: message.value }));
    }
  }

  // ---- helper nativo local ----
  // O helper só escuta em 127.0.0.1: nenhum pareamento extra é necessário, qualquer
  // processo desta própria máquina já passaria pela mesma barreira de rede.
  connectHelper() {
    if (this.helperSocket) return;
    this.ui.$('rcHelperStatus').textContent = 'Conectando ao helper…';
    let socket;
    try { socket = new WebSocket(HELPER_URL); }
    catch { this.ui.$('rcHelperStatus').textContent = 'Não foi possível abrir o WebSocket local.'; return; }
    this.helperSocket = socket;
    socket.onmessage = event => this.handleHelperMessage(event.data);
    socket.onclose = () => {
      if (this.helperSocket !== socket) return;
      this.helperSocket = null;
      this.ui.$('rcHelperStatus').textContent = this.local.allow ? 'Helper não encontrado. Rode o helper no PC e tente de novo.' : 'Helper não conectado.';
      if (this.grant?.role === 'owner') this.revoke();
    };
    socket.onerror = () => {};
  }

  disconnectHelper() {
    const socket = this.helperSocket; this.helperSocket = null;
    if (!socket) return;
    socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close();
    this.ui.$('rcHelperStatus').textContent = 'Helper não conectado.';
  }

  handleHelperMessage(raw) {
    let message; try { message = JSON.parse(raw); } catch { return; }
    if (!message || typeof message !== 'object') return;
    if (message.t === 'ready' && message.screen) {
      this.ui.$('rcHelperStatus').textContent = `Helper conectado (${message.screen.width}×${message.screen.height}).`;
    }
  }
}
