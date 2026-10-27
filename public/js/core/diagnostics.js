import { AutomaticTest } from './diagnostics-runner.js';
// Metadata-only diagnostics. Never record payloads or device/IP identifiers.
export class Diagnostics {
  constructor(enabled = false) {
    this.enabled = enabled;
    this.running = false;
    this.generation = 0;
    this.rows = [];
    this.pending = new Map();
    this.previous = new Map();
    this.phase = 'voice';
    this.sequence = 0;
    this.dropped = 0;
    this.fileWindows = new Map();
    this.peerStatus = 'stopped';
    this.audioStatus = 'Aguardando amostra de áudio.';
    this.automatic = new AutomaticTest(this);
  }

  setPeerStatus(state) {
    if (this.peerStatus !== state) this.record('probe-status', { state });
    this.peerStatus = state;
    this.onStatus?.();
  }

  statusText() {
    const messages = {
      stopped: 'Coleta parada.', waiting: 'Aguardando resposta da outra ponta…',
      responding: 'Outra ponta respondendo.', 'remote-stopped': 'Outra ponta conectada, mas com a coleta parada. Clique Iniciar lá também.',
      silent: 'Outra ponta sem resposta há mais de 10 s. Verifique diagnóstico, versão e conexão nas duas máquinas.',
      unavailable: 'Canal de diagnóstico indisponível. Abra a mesma versão com diagnostics=1 nas duas máquinas e reconecte.',
      congested: 'Canal de diagnóstico com fila de envio.', error: 'Falha ao enviar a sonda.'
    };
    return `${messages[this.peerStatus]} ${this.running ? this.audioStatus : ''}`.trim();
  }

  record(type, values = {}, phase = this.phase) {
    if (!this.running) return;
    if (this.rows.length >= 20000) { this.dropped++; return; }
    this.rows.push({ atMs: performance.now(), phase, type, ...values });
  }

  start() {
    if (!this.enabled || this.running) return;
    this.running = true;
    this.generation++;
    this.lastReply = null;
    this.probeStartedAt = performance.now();
    this.audioStatus = 'Aguardando amostra de áudio.';
    this.setPeerStatus(this.channel?.readyState === 'open' ? 'waiting' : 'unavailable');
    this.previous.clear();
    this.record('start');
    this.lastTick = performance.now();
    this.timer = setInterval(() => {
      const now = performance.now();
      this.record('scheduler', { lateMs: Math.max(0, now - this.lastTick - 2000), hidden: document.hidden });
      this.lastTick = now;
      this.sampleLocal?.();
      this.ping();
      this.flushFiles();
    }, 2000);
    this.httpTimer = setInterval(() => { void this.httpProbe(); }, 10000);
    void this.httpProbe();
  }

  stop() {
    this.flushFiles();
    for (const sent of this.pending.values()) this.record('probe-interrupted', {}, sent.phase);
    this.record('stop');
    this.running = false;
    this.generation++;
    clearInterval(this.timer); clearInterval(this.httpTimer);
    this.abort?.abort();
    this.pending.clear();
    this.setPeerStatus('stopped');
  }

  fileHandler(queueMs, processingMs) {
    if (!this.running) return;
    const window = this.fileWindows.get(this.phase) || { count: 0, queueTotalMs: 0, processingTotalMs: 0, queueMaxMs: 0, processingMaxMs: 0 };
    window.count++;
    window.queueTotalMs += queueMs; window.processingTotalMs += processingMs;
    window.queueMaxMs = Math.max(window.queueMaxMs, queueMs);
    window.processingMaxMs = Math.max(window.processingMaxMs, processingMs);
    this.fileWindows.set(this.phase, window);
  }

  flushFiles() {
    for (const [phase, window] of this.fileWindows) this.record('file-handlers', window, phase);
    this.fileWindows.clear();
  }

  attach(channel) {
    this.detach();
    this.channel = channel;
    channel.onmessage = event => {
      if (!this.enabled || typeof event.data !== 'string' || event.data.length > 25000) return;
      let message; try { message = JSON.parse(event.data); } catch { return; }
      if (!message || !Number.isSafeInteger(message.id) || message.id < 0) return;
      if (this.automatic.receive(message)) return;
      if (event.data.length > 160) return;
      if (message.type === 'ping') {
        // Bound echo traffic too; application data never travels on this channel.
        const now = performance.now();
        if (this.lastEcho != null && now - this.lastEcho < 250) return;
        this.lastEcho = now;
        try { if (channel.readyState === 'open' && channel.bufferedAmount < 4096) channel.send(JSON.stringify({ type: this.running ? 'pong' : 'status', id: message.id, running: this.running })); } catch {}
      } else if (this.running && (message.type === 'pong' || message.type === 'status' && message.running === false) && this.pending.has(message.id)) {
        const sent = this.pending.get(message.id);
        this.pending.delete(message.id);
        this.lastReply = performance.now();
        if (message.type === 'pong') this.record('peer-rtt', { ms: this.lastReply - sent.at }, sent.phase);
        this.setPeerStatus(message.type === 'pong' ? 'responding' : 'remote-stopped');
      }
    };
    this.probeStartedAt = performance.now(); this.lastReply = null;
    this.lastEcho = null;
    channel.onopen = () => { this.probeStartedAt = performance.now(); if (this.running) this.setPeerStatus('waiting'); };
    channel.onclose = () => { this.record('probe-channel-closed'); this.automatic.disconnected(); if (this.running) this.setPeerStatus('unavailable'); };
  }

  detach() {
    this.automatic.disconnected();
    for (const sent of this.pending.values()) this.record('probe-interrupted', {}, sent.phase);
    this.pending.clear();
    if (this.channel) {
      this.channel.onmessage = this.channel.onclose = this.channel.onopen = null;
      this.channel.close(); this.channel = null;
    }
    this.previous.clear();
    this.lastReply = null;
    if (this.running) this.setPeerStatus('unavailable');
  }

  ping() {
    if (!this.running) return;
    const now = performance.now();
    for (const [id, sent] of this.pending) if (now - sent.at > 10000) {
      this.record('probe-timeout', {}, sent.phase); this.pending.delete(id);
    }
    const channel = this.channel;
    if (channel?.readyState !== 'open' || channel.bufferedAmount > 4096) {
      this.setPeerStatus(channel?.readyState === 'open' ? 'congested' : 'unavailable');
      this.record('probe-unavailable'); return;
    }
    if (now - (this.lastReply ?? this.probeStartedAt ?? now) > 10000) this.setPeerStatus('silent');
    else if (!this.lastReply) this.setPeerStatus('waiting');
    const id = ++this.sequence;
    try {
      channel.send(JSON.stringify({ type: 'ping', id }));
      this.pending.set(id, { at: now, phase: this.phase });
    } catch { this.record('probe-send-error'); this.setPeerStatus('error'); }
  }

  async httpProbe() {
    if (!this.running || this.httpBusy) return;
    this.httpBusy = true;
    const phase = this.phase;
    const generation = this.generation;
    const start = performance.now();
    const abort = new AbortController(); this.abort = abort;
    const timer = setTimeout(() => abort.abort(), 8000);
    try {
      const response = await fetch(`/api/diagnostics/ping?n=${++this.sequence}`, { cache: 'no-store', signal: abort.signal });
      const headersMs = performance.now() - start;
      await response.arrayBuffer();
      if (this.generation === generation) this.record('http', { headersMs, totalMs: performance.now() - start, status: response.status,
        cloudflare: response.headers.has('cf-ray'), cacheStatus: response.headers.get('cf-cache-status') }, phase);
    } catch { if (this.generation === generation) this.record('http-error', { ms: performance.now() - start }, phase); }
    finally { clearTimeout(timer); this.httpBusy = false; }
  }

  statsUnavailable(reason) {
    if (!this.running) return;
    this.record('audio-availability', { reason });
    this.audioStatus = reason === 'no-connection' ? 'Áudio: aguardando conexão WebRTC.' : 'Áudio: a leitura de estatísticas falhou.';
    this.onStatus?.();
  }

  stats(rows, pc) {
    if (!this.running) return;
    const transport = rows.find(row => row.type === 'transport' && row.selectedCandidatePairId);
    const pair = transport ? rows.find(row => row.id === transport.selectedCandidatePairId) : undefined;
    if (pair) {
      const local = rows.find(row => row.id === pair.localCandidateId);
      const remote = rows.find(row => row.id === pair.remoteCandidateId);
      this.record('ice', { rttMs: pair.currentRoundTripTime == null ? null : pair.currentRoundTripTime * 1000,
        localType: local?.candidateType, remoteType: remote?.candidateType, protocol: local?.protocol });
    }
    const inbound = rows.filter(row => row.type === 'inbound-rtp');
    const kind = row => row.kind || row.mediaType || rows.find(item => item.id === row.codecId)?.mimeType?.split('/')[0];
    const audio = inbound.filter(row => kind(row) === 'audio');
    const receivers = (pc?.getTransceivers?.() || []).filter(t => t.receiver?.track?.kind === 'audio').map(t => ({
      direction: t.currentDirection, state: t.receiver.track.readyState, muted: t.receiver.track.muted, enabled: t.receiver.track.enabled
    }));
    const reason = audio.length ? 'available' : !inbound.length ? 'no-inbound-rtp' : inbound.some(row => !kind(row)) ? 'unclassified-inbound-rtp' : 'no-audio-inbound-rtp';
    this.record('audio-availability', { reason, inboundCount: inbound.length, audioCount: audio.length,
      unclassifiedCount: inbound.filter(row => !kind(row)).length, receivers,
      fields: audio.map(row => ({ jitter: Number.isFinite(row.jitter), bufferDelay: Number.isFinite(row.jitterBufferDelay),
        emittedCount: Number.isFinite(row.jitterBufferEmittedCount), processingDelay: Number.isFinite(row.totalProcessingDelay),
        concealedSamples: Number.isFinite(row.concealedSamples), packetsReceived: Number.isFinite(row.packetsReceived) })) });
    this.audioStatus = audio.length ? 'Estatísticas de áudio recebido disponíveis (campos variam por navegador).' :
      `Sem estatísticas de áudio recebido: ${reason === 'no-inbound-rtp' ? 'o navegador não retornou RTP recebido' : reason === 'unclassified-inbound-rtp' ? 'há RTP sem identificação de mídia' : 'o RTP recebido não contém áudio'}. Isso não comprova ausência de som.`;
    this.onStatus?.();
    for (const row of audio) {
      const old = this.previous.get(row.id);
      const delta = field => old && Number.isFinite(row[field]) && Number.isFinite(old[field]) && row[field] >= old[field] ? row[field] - old[field] : null;
      const emitted = delta('jitterBufferEmittedCount');
      const average = field => emitted > 0 && delta(field) != null ? 1000 * delta(field) / emitted : null;
      this.record('audio', { stream: row.mid, jitterMs: row.jitter == null ? null : row.jitter * 1000,
        jitterBufferMs: average('jitterBufferDelay'), jitterTargetMs: average('jitterBufferTargetDelay'),
        processingMs: delta('totalProcessingDelay') != null && delta('packetsReceived') > 0 ? 1000 * delta('totalProcessingDelay') / delta('packetsReceived') : null,
        packetsLost: delta('packetsLost'), packetsReceived: delta('packetsReceived'),
        concealedSamples: delta('concealedSamples'), concealmentEvents: delta('concealmentEvents'),
        totalSamplesReceived: delta('totalSamplesReceived'), insertedSamples: delta('insertedSamplesForDeceleration'),
        removedSamples: delta('removedSamplesForAcceleration') });
      this.previous.set(row.id, row);
    }
  }

  export() {
    this.flushFiles();
    return { schema: 1, build: 'latency-baseline-3', dropped: this.dropped,
      pendingProbes: this.pending.size, rows: this.rows };
  }
}

export const diagnostics = new Diagnostics(typeof location !== 'undefined');

export function mountDiagnostics(sampleLocal) {
  if (!diagnostics.enabled) return;
  diagnostics.sampleLocal = sampleLocal;
  const panel = document.createElement('details'); panel.className = 'temporary-diagnostics';
  const heading = document.createElement('summary'); heading.textContent = 'Diagnóstico temporário (sem conteúdo da conversa)'; panel.append(heading);
  const autoStatus = document.createElement('p'); autoStatus.setAttribute('role', 'status');
  autoStatus.textContent = diagnostics.automatic.status;
  const download = data => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `tupi-diagnostics-${Date.now()}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const test = document.createElement('button'); test.type = 'button'; test.textContent = 'Testar conexão (3 min)';
  test.onclick = () => diagnostics.automatic.start();
  const finish = document.createElement('button'); finish.type = 'button'; finish.textContent = 'Encerrar teste agora';
  finish.onclick = () => diagnostics.automatic.finish();
  const report = document.createElement('button'); report.type = 'button'; report.textContent = 'Baixar relatório único'; report.disabled = true;
  report.onclick = () => { if (diagnostics.automatic.report) download(diagnostics.automatic.report); };
  diagnostics.automatic.onChange = () => {
    autoStatus.textContent = diagnostics.automatic.status;
    test.disabled = diagnostics.automatic.active;
    finish.disabled = !diagnostics.automatic.measuring;
    report.disabled = !diagnostics.automatic.report;
    panel.open = true;
  };
  finish.disabled = true;
  panel.append(test, finish, report, autoStatus);
  const manual = document.createElement('details'); const manualHeading = document.createElement('summary'); manualHeading.textContent = 'Coleta manual (avançado)'; manual.append(manualHeading); panel.append(manual);
  const select = document.createElement('select'); select.setAttribute('aria-label', 'Cenário do diagnóstico');
  for (const [value, label] of [['voice', 'Só voz'], ['screen', 'Voz + tela'], ['file', 'Voz + arquivo'], ['youtube', 'YouTube']]) {
    const option = document.createElement('option'); option.value = value; option.textContent = label; select.append(option);
  }
  select.onchange = () => { if (diagnostics.automatic.active) return; diagnostics.phase = select.value; diagnostics.previous.clear(); diagnostics.record('phase'); };
  manual.append(select);
  const status = document.createElement('span'); status.textContent = ' Parado ';
  status.setAttribute('role', 'status');
  diagnostics.onStatus = () => {
    const text = diagnostics.statusText();
    if (status.textContent !== text) status.textContent = text;
    heading.textContent = diagnostics.running ? `Diagnóstico temporário · ${diagnostics.peerStatus === 'responding' ? 'outra ponta respondendo' : 'verifique o estado da coleta'}` : 'Diagnóstico temporário (sem conteúdo da conversa)';
  };
  for (const [label, action] of [
    ['Iniciar', () => diagnostics.start()],
    ['Parar', () => diagnostics.stop()],
    ['Marcar corte de áudio', () => diagnostics.record('reported-audio-cut')],
    ['Marcar comando sem efeito', () => diagnostics.record('reported-command-failure')],
    ['Exportar JSON', () => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(diagnostics.export(), null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `tupi-diagnostics-${Date.now()}.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }]
  ]) { const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.onclick = () => { if (!diagnostics.automatic.active) action(); }; manual.append(button); }
  panel.append(status); document.body.prepend(panel);
}
