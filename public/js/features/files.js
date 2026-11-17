import { diagnostics } from '../core/diagnostics.js';
import { canStreamSave, openStreamSave } from './stream-save.js';

// Protocolo 2: um bloco por vez, confirmado individualmente (compatível com versões antigas).
// Protocolo 3: janela deslizante (vários blocos em voo) com blocos maiores e confirmação cumulativa.
const PROTOCOLS = { 2: { chunkSize: 64 * 1024, window: 1, label: 'compatível' }, 3: { chunkSize: 128 * 1024, window: 16, label: 'rápido' } };
const FAST_RECOMMENDED_BYTES = 4 * 1024 * 1024;
const MODE_KEY = 'tupi-file-mode';
const HIGH_WATER_WINDOWED = 4 * 1024 * 1024;
const MEMORY_LIMIT = 1024 * 1024 * 1024;
const COMPACT_BYTES = 32 * 1024 * 1024;
const HIGH_WATER = 512 * 1024;
const LOW_WATER = 128 * 1024;

async function digest(bytes) {
  const result = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(result)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export class FileTransfers {
  constructor(ui, { shouldPause = () => false } = {}) {
    this.ui = ui; this.shouldPause = shouldPause; this.channel = null;
    this.transfer = null; this.nextId = 1; this.messageQueue = Promise.resolve();
    this.buildUI();
  }

  buildUI() {
    const panel = document.createElement('section'); panel.className = 'file-transfer';
    panel.innerHTML = '<div class="file-transfer-heading"><strong>Transferir arquivo</strong><span>P2P, direto entre vocês</span></div><div class="file-transfer-actions"><label class="file-pick"><i class="ph ph-paperclip" aria-hidden="true"></i>Escolher arquivo<input id="fileInput" type="file" hidden></label><select id="fileMode" class="file-mode" aria-label="Modo de transferência"><option value="auto">Automático</option><option value="fast">Rápido</option><option value="safe">Compatível</option></select><button id="cancelTransfer" type="button" class="file-cancel fx hidden"><i class="ph ph-x" aria-hidden="true"></i>Cancelar</button></div><p id="fileModeHint" class="file-mode-hint">Automático usa o modo rápido a partir de 4 MiB.</p><div id="fileTransferStatus" class="file-transfer-status" role="status" aria-live="polite">Aguardando conexão</div><progress id="fileTransferProgress" class="fx hidden" max="100" value="0"></progress><div id="incomingFile" class="incoming-file fx hidden" role="group" aria-label="Pedido de recebimento"><span id="incomingFileText"></span><div><button id="acceptFile" type="button"><i class="ph-fill ph-download-simple" aria-hidden="true"></i>Receber</button><button id="rejectFile" type="button"><i class="ph ph-x-circle" aria-hidden="true"></i>Recusar</button></div></div>';
    const form = this.ui.$('chatForm'); form.parentElement.insertBefore(panel, form);
    this.modeSelect = panel.querySelector('#fileMode'); this.modeHint = panel.querySelector('#fileModeHint');
    try { const saved = localStorage.getItem(MODE_KEY); if (['auto', 'fast', 'safe'].includes(saved)) this.modeSelect.value = saved; } catch { /* sem armazenamento */ }
    this.modeSelect.addEventListener('change', () => { try { localStorage.setItem(MODE_KEY, this.modeSelect.value); } catch { /* vale na sessão */ } this.updateModeHint(); });
    this.updateModeHint();
    this.input = panel.querySelector('#fileInput'); this.status = panel.querySelector('#fileTransferStatus');
    this.progress = panel.querySelector('#fileTransferProgress'); this.cancelButton = panel.querySelector('#cancelTransfer');
    this.incoming = panel.querySelector('#incomingFile'); this.incomingText = panel.querySelector('#incomingFileText');
    this.input.addEventListener('change', () => { const file = this.input.files?.[0]; if (file) void this.offer(file); this.input.value = ''; });
    this.cancelButton.addEventListener('click', () => this.cancel());
    panel.querySelector('#acceptFile').addEventListener('click', () => { void this.accept(); });
    panel.querySelector('#rejectFile').addEventListener('click', () => this.reject());
  }

  attach(channel) {
    this.detach(); this.channel = channel; channel.binaryType = 'arraybuffer';
    channel.bufferedAmountLowThreshold = LOW_WATER;
    channel.onopen = () => this.setStatus('Pronto para transferir arquivos');
    channel.onclose = () => { this.cancel(false); this.setStatus('Canal de arquivos desconectado'); };
    channel.onerror = () => this.setStatus('Erro no canal de arquivos');
    channel.onmessage = event => {
      if (!diagnostics.running) {
        this.messageQueue = this.messageQueue.then(() => this.onMessage(event.data)).catch(() => this.cancel());
        return;
      }
      const receivedAt = performance.now();
      this.messageQueue = this.messageQueue.then(async () => {
        const startedAt = performance.now();
        try { await this.onMessage(event.data); }
        finally { diagnostics.fileHandler(startedAt - receivedAt, performance.now() - startedAt); }
      }).catch(() => this.cancel());
    };
  }

  updateModeHint(size) {
    const hints = {
      auto: 'Automático usa o modo rápido a partir de 4 MiB.',
      fast: 'Rápido envia vários blocos de uma vez: ideal para arquivos grandes. Exige o TuPi atualizado nos dois lados.',
      safe: 'Compatível envia um bloco por vez: mais lento em arquivos grandes, funciona com versões antigas.'
    };
    this.modeHint.textContent = hints[this.modeSelect.value] + (size == null ? '' : size >= FAST_RECOMMENDED_BYTES ? ' Para este arquivo, recomendo o modo rápido.' : ' Para este arquivo, o modo compatível basta.');
  }

  pickVersion(size) {
    const recommended = size >= FAST_RECOMMENDED_BYTES ? 3 : 2;
    const mode = this.modeSelect.value;
    return { version: mode === 'fast' ? 3 : mode === 'safe' ? 2 : recommended, recommended };
  }

  speedText(transfer, bytes) {
    const seconds = (Date.now() - (transfer.startedAt || Date.now())) / 1000;
    return seconds > 0.5 ? ` · ${this.formatSize(bytes / seconds)}/s` : '';
  }

  setStatus(text) { this.status.textContent = text; }
  sendControl(message) { if (this.channel?.readyState === 'open') this.channel.send(JSON.stringify(message)); }

  async offer(file, forcedVersion) {
    if (this.channel?.readyState !== 'open') { this.setStatus('Aguardando conexão com a outra pessoa'); return; }
    if (this.transfer) { this.setStatus('Conclua ou cancele a transferência atual primeiro'); return; }
    const id = `${Date.now().toString(36)}-${this.nextId++}`;
    const { version, recommended } = forcedVersion ? { version: forcedVersion, recommended: forcedVersion } : this.pickVersion(file.size);
    const { chunkSize, window } = PROTOCOLS[version];
    const chunks = Math.ceil(file.size / chunkSize);
    this.updateModeHint(file.size);
    this.transfer = { id, role: 'sender', file, chunks, chunkSize, version, window, cancelled: false };
    this.progress.value = 0; this.progress.classList.remove('hidden'); this.cancelButton.classList.remove('hidden');
    this.sendControl({ type: 'offer', version, id, name: file.name, size: file.size, mime: file.type || 'application/octet-stream', chunks, chunkSize, ...(version === 3 ? { window } : {}) });
    const note = version !== recommended ? ` (para este tamanho, o modo ${PROTOCOLS[recommended].label} é o recomendado)` : '';
    this.setStatus(`Pedido enviado: ${file.name} (${this.formatSize(file.size)}) · modo ${PROTOCOLS[version].label}${note}`);
  }

  async onMessage(data) {
    if (typeof data !== 'string') { await this.receiveChunk(data); return; }
    if (data.length > 8192) { this.cancel(); this.setStatus('Mensagem de controle inválida: tamanho máximo excedido'); return; }
    let message; try { message = JSON.parse(data); } catch { return; }
    if (!message || typeof message !== 'object' || Array.isArray(message) || typeof message.type !== 'string') return;
    if (message.type === 'offer') return this.showOffer(message);
    if (!this.transfer || message.id !== this.transfer.id) return;
    if (message.type === 'accept' && this.transfer.role === 'sender') void this.sendFile();
    if (message.type === 'ack' && this.transfer.role === 'sender' && Number.isInteger(message.index) && message.index >= 0) this.transfer.ack?.(message.index);
    if (message.type === 'chunk' && this.transfer.role === 'receiver') {
      if (message.index !== this.transfer.nextChunk || !/^[a-f0-9]{64}$/.test(message.hash)) { this.cancel(); this.setStatus('Transferência interrompida: metadados do bloco inválidos'); return; }
      this.transfer.expectedChunkHash = message.hash;
    }
    if (message.type === 'reject') {
      const { role, version, file } = this.transfer;
      const incompatible = /protocolo/i.test(String(message.reason || ''));
      this.finish(`Transferência recusada${message.reason ? `: ${String(message.reason).slice(0, 200)}` : ''}`);
      if (role === 'sender' && version === 3 && incompatible) { this.setStatus('A outra pessoa não tem o modo rápido; reenviando no modo compatível...'); void this.offer(file, 2); }
    }
    if (message.type === 'cancel') this.finish('Transferência cancelada pela outra pessoa');
    if (message.type === 'done' && this.transfer.role === 'sender') this.finish(`Arquivo enviado e verificado${this.speedText(this.transfer, this.transfer.file.size)}`);
    if (message.type === 'end' && this.transfer.role === 'receiver') await this.finishReceive(message);
  }

  showOffer(message) {
    const spec = PROTOCOLS[message.version];
    if (!spec) {
      this.sendControl({ type: 'reject', id: message.id, reason: 'versão do protocolo incompatível; atualize os dois navegadores e tente novamente' });
      this.setStatus('Protocolo incompatível: atualize os dois navegadores'); return;
    }
    if (this.transfer || typeof message.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(message.id) || !Number.isSafeInteger(message.size) || message.size < 0 || message.size > 20 * 1024 * 1024 * 1024 || typeof message.name !== 'string' || message.name.length > 255 || /[\\/\u0000-\u001f]/.test(message.name) || typeof message.mime !== 'string' || message.mime.length > 128 || message.chunkSize !== spec.chunkSize || !Number.isInteger(message.chunks) || message.chunks !== Math.ceil(message.size / spec.chunkSize) || (message.version === 3 && !(Number.isInteger(message.window) && message.window >= 1 && message.window <= 64))) {
      this.sendControl({ type: 'reject', id: message.id, reason: 'arquivo ou tamanho inválido, ou outra transferência está ativa' }); return;
    }
    this.transfer = { ...message, role: 'receiver', cancelled: false, ackEvery: message.version === 3 ? Math.max(1, Math.floor(message.window / 4)) : 1 };
    this.incomingText.textContent = `${message.name} · ${this.formatSize(message.size)} · modo ${spec.label}. Você aceita receber?`;
    this.incoming.classList.remove('hidden'); this.setStatus('Aguardando seu consentimento para receber o arquivo');
    this.onIncoming?.(message);
  }

  async accept() {
    const transfer = this.transfer; if (!transfer || transfer.role !== 'receiver') return;
    const direct = Boolean(window.showSaveFilePicker);
    if (!direct && !canStreamSave() && transfer.size > MEMORY_LIMIT) {
      this.sendControl({ type: 'reject', id: transfer.id, reason: 'este navegador não salva arquivos grandes diretamente em disco' });
      this.finish('Arquivo grande recusado: este navegador exige buffer em memória acima de 1 GiB'); return;
    }
    this.incoming.classList.add('hidden');
    try {
      if (direct) {
        const handle = await window.showSaveFilePicker({ suggestedName: transfer.name });
        transfer.writable = await handle.createWritable();
      } else if (canStreamSave()) {
        // Sem showSaveFilePicker (Firefox, Safari): o Service Worker entrega os blocos ao gerenciador de downloads.
        this.setStatus('Aguardando o navegador iniciar o download...');
        try { transfer.writable = await openStreamSave(transfer, () => this.cancel()); }
        catch { if (transfer.size > MEMORY_LIMIT) throw new Error('stream'); transfer.parts = []; }
      } else transfer.parts = [];
    } catch (error) {
      if (error.name === 'AbortError') { this.reject(); return; }
      this.reject('não foi possível abrir o arquivo de destino'); return;
    }
    transfer.received = 0; transfer.nextChunk = 0; transfer.expectedChunkHash = null; transfer.startedAt = Date.now();
    this.progress.value = 0; this.progress.classList.remove('hidden'); this.cancelButton.classList.remove('hidden');
    this.sendControl({ type: 'accept', id: transfer.id }); this.setStatus(`Recebendo ${transfer.name}...`);
  }

  reject(reason = '') {
    if (!this.transfer) return;
    this.sendControl({ type: 'reject', id: this.transfer.id, reason }); this.finish(reason ? `Recebimento não iniciado: ${reason}` : 'Arquivo recusado');
  }

  async sendFile() {
    const transfer = this.transfer; if (!transfer || transfer.role !== 'sender') return;
    this.setStatus(`Enviando ${transfer.file.name}...`);
    transfer.startedAt = Date.now();
    try {
      const completed = transfer.version === 3 ? await this.sendWindowed(transfer) : await this.sendStopAndWait(transfer);
      if (!completed) return;
      while (!transfer.cancelled && this.channel?.bufferedAmount > LOW_WATER) await new Promise(resolve => setTimeout(resolve, 100));
      if (!transfer.cancelled) this.sendControl({ type: 'end', id: transfer.id, chunks: transfer.chunks });
    } catch {
      clearTimeout(transfer.ackTimer);
      if (!transfer.cancelled) { this.cancel(); this.setStatus('Falha ao ler ou enviar o arquivo'); }
    }
  }

  showSendProgress(transfer, bytes) {
    const sent = Math.min(transfer.file.size, bytes);
    this.progress.value = transfer.file.size ? Math.round(sent / transfer.file.size * 100) : 100;
    this.setStatus(`Enviando ${transfer.file.name}: ${this.progress.value}%${this.speedText(transfer, sent)}`);
  }

  // Protocolo 2: um bloco por vez, com confirmação individual.
  async sendStopAndWait(transfer) {
    const { chunkSize } = transfer;
    for (let index = 0; index < transfer.chunks; index++) {
      while (!transfer.cancelled && (this.channel?.readyState !== 'open' || this.channel.bufferedAmount > HIGH_WATER || this.shouldPause())) {
        if (this.shouldPause()) this.setStatus('Mídia ocupando a rede; transferência pausada temporariamente');
        await new Promise(resolve => setTimeout(resolve, 150));
      }
      if (transfer.cancelled) return false;
      const buffer = await transfer.file.slice(index * chunkSize, (index + 1) * chunkSize).arrayBuffer();
      const hash = await digest(buffer);
      const ack = new Promise((resolve, reject) => {
        transfer.ack = received => received === index ? resolve() : reject(new Error('Confirmação de bloco inválida'));
        transfer.ackTimer = setTimeout(() => reject(new Error('Tempo esgotado aguardando confirmação do bloco')), 30_000);
      });
      this.sendControl({ type: 'chunk', id: transfer.id, index, hash });
      this.channel.send(buffer);
      await ack; clearTimeout(transfer.ackTimer); transfer.ack = null;
      this.showSendProgress(transfer, (index + 1) * chunkSize);
    }
    return true;
  }

  // Protocolo 3: até `window` blocos em voo; o receptor confirma de forma cumulativa ("recebi até o bloco N").
  async sendWindowed(transfer) {
    const { chunkSize, window } = transfer;
    let acked = 0; let wake = null;
    transfer.lastProgress = Date.now();
    transfer.ack = index => {
      if (index >= acked) { acked = index + 1; transfer.lastProgress = Date.now(); this.showSendProgress(transfer, acked * chunkSize); }
      const resume = wake; wake = null; resume?.();
    };
    const waitForAck = () => new Promise(resolve => { wake = resolve; setTimeout(resolve, 1000); });
    for (let index = 0; index < transfer.chunks; index++) {
      while (!transfer.cancelled) {
        const windowFull = index - acked >= window;
        if (this.channel?.readyState === 'open' && !windowFull && this.channel.bufferedAmount <= HIGH_WATER_WINDOWED && !this.shouldPause()) break;
        if (windowFull && Date.now() - transfer.lastProgress > 30_000) throw new Error('Tempo esgotado aguardando confirmação dos blocos');
        if (this.shouldPause()) this.setStatus('Mídia ocupando a rede; transferência pausada temporariamente');
        await (windowFull ? waitForAck() : new Promise(resolve => setTimeout(resolve, 25)));
      }
      if (transfer.cancelled) return false;
      const buffer = await transfer.file.slice(index * chunkSize, (index + 1) * chunkSize).arrayBuffer();
      const hash = await digest(buffer);
      if (transfer.cancelled) return false;
      this.sendControl({ type: 'chunk', id: transfer.id, index, hash });
      this.channel.send(buffer);
    }
    // Todos os blocos já saíram; aguarda a confirmação do último antes de encerrar.
    while (!transfer.cancelled && acked < transfer.chunks) {
      if (Date.now() - transfer.lastProgress > 30_000) throw new Error('Tempo esgotado aguardando confirmação dos blocos');
      await waitForAck();
    }
    return !transfer.cancelled;
  }

  async receiveChunk(data) {
    const transfer = this.transfer; if (!transfer || transfer.role !== 'receiver' || !transfer.parts && !transfer.writable) return;
    const expectedLength = Math.min(transfer.chunkSize, transfer.size - transfer.received);
    const incomingLength = data instanceof ArrayBuffer ? data.byteLength : data?.size;
    if (incomingLength !== expectedLength || transfer.received >= transfer.size || !transfer.expectedChunkHash) { this.cancel(); this.setStatus('Transferência interrompida: tamanho ou sequência de bloco inválida'); return; }
    const buffer = data instanceof ArrayBuffer ? data : await data.arrayBuffer();
    if (await digest(buffer) !== transfer.expectedChunkHash) {
      const chunkNumber = transfer.nextChunk + 1;
      this.cancel(); this.setStatus(`Integridade não confirmada no bloco ${chunkNumber}; arquivo descartado`); return;
    }
    const length = buffer.byteLength;
    if (transfer.writable) await transfer.writable.write(buffer);
    else {
      transfer.parts.push(buffer);
      transfer.partBytes = (transfer.partBytes || 0) + length;
      // Agrupa em Blob a cada 32 MiB: o navegador pode manter o Blob em disco em vez de RAM.
      if (transfer.partBytes >= COMPACT_BYTES) { transfer.parts = [new Blob(transfer.parts)]; transfer.partBytes = 0; }
    }
    transfer.received += length;
    const index = transfer.nextChunk++;
    transfer.expectedChunkHash = null;
    if ((index + 1) % transfer.ackEvery === 0 || transfer.nextChunk === transfer.chunks) this.sendControl({ type: 'ack', id: transfer.id, index });
    this.progress.value = transfer.size ? Math.round(transfer.received / transfer.size * 100) : 100;
    this.setStatus(`Recebendo ${transfer.name}: ${this.progress.value}%${this.speedText(transfer, transfer.received)}`);
  }

  async finishReceive(message) {
    const transfer = this.transfer;
    if (transfer.received !== transfer.size || transfer.nextChunk !== transfer.chunks || message.chunks !== transfer.chunks || transfer.expectedChunkHash) {
      const reason = `Integridade não confirmada: ${transfer.received}/${transfer.size} bytes e ${transfer.nextChunk}/${transfer.chunks} blocos; arquivo descartado`;
      this.cancel(); this.setStatus(reason); return;
    }
    try {
      if (transfer.writable) await transfer.writable.close();
      else {
        const blob = new Blob(transfer.parts, { type: transfer.mime });
        const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = transfer.name; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
      this.sendControl({ type: 'done', id: transfer.id }); this.finish(`Arquivo recebido e verificado: ${transfer.name}${this.speedText(transfer, transfer.size)}`);
    } catch { this.cancel(); this.setStatus('Falha ao salvar o arquivo recebido'); }
  }

  cancel(notifyPeer = true) {
    const transfer = this.transfer; if (!transfer) return;
    transfer.cancelled = true;
    clearTimeout(transfer.ackTimer);
    transfer.ack?.(-1);
    if (notifyPeer) this.sendControl({ type: 'cancel', id: transfer.id });
    if (transfer.writable) void transfer.writable.abort().catch(() => {});
    this.finish('Transferência cancelada');
  }

  finish(status) {
    this.transfer = null; this.incoming.classList.add('hidden'); this.progress.classList.add('hidden'); this.cancelButton.classList.add('hidden');
    this.setStatus(status);
  }

  detach() {
    if (this.transfer) this.cancel(false);
    const channel = this.channel; this.channel = null;
    if (channel) { channel.onmessage = channel.onopen = channel.onclose = channel.onerror = null; if (channel.readyState !== 'closed') channel.close(); }
    this.setStatus('Aguardando conexão');
  }

  formatSize(size) { return size < 1024 * 1024 ? `${Math.ceil(size / 1024)} KiB` : `${(size / 1024 / 1024).toFixed(1)} MiB`; }
}
