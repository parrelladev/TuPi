const DURATION = 180000;
const LIMIT = 8 * 1024 * 1024;
const CHUNK = 12000;

export function summarizeRun(run) {
  const metrics = {};
  for (const [type, field] of [['peer-rtt', 'ms'], ['http', 'totalMs'], ['audio', 'jitterBufferMs'], ['audio', 'jitterMs']]) {
    const values = run.rows.filter(row => row.type === type && Number.isFinite(row[field])).map(row => row[field]).sort((a, b) => a - b);
    metrics[`${type}.${field}`] = values.length ? { n: values.length, median: values[Math.ceil(values.length / 2) - 1], p95: values[Math.ceil(values.length * 0.95) - 1], max: values.at(-1) } : null;
  }
  return { metrics, scenarios: [...new Set(run.rows.map(row => row.phase))],
    hiddenSamples: run.rows.filter(row => row.type === 'scheduler' && row.hidden).length,
    micAbsentSamples: run.rows.filter(row => row.type === 'capture' && row.streamPresent === false).length,
    audioMissingSamples: run.rows.filter(row => row.type === 'audio-availability' && row.reason !== 'available').length,
    timeouts: run.rows.filter(row => row.type === 'probe-timeout').length, dropped: run.dropped };
}

// Coordination and report exchange use the diagnostic channel only. No media/content is recorded.
export class AutomaticTest {
  constructor(diagnostics) { this.d = diagnostics; this.status = 'Converse normalmente. O teste dura 3 minutos e coleta as duas pontas.'; }
  notify(text) { this.status = text; this.onChange?.(); }
  send(type, extra = {}) {
    if (this.d.channel?.readyState !== 'open') throw new Error('channel');
    this.d.channel.send(JSON.stringify({ type, id: this.id, ...extra }));
  }
  start() {
    if (this.active || this.d.running) return;
    if (this.d.channel?.readyState !== 'open') { this.notify('Entre numa chamada com a versão atual nas duas máquinas para testar.'); return; }
    this.id = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
    this.active = true; this.owner = true; this.local = null; this.finishing = false; this.report = null; this.remote = null; this.parts = []; this.size = 0;
    this.notify('Conectando o teste à outra ponta…');
    this.timer = setTimeout(() => this.fail('A outra ponta não confirmou. Atualize as duas máquinas e tente novamente.'), 10000);
    try { this.send('auto-start'); } catch { this.fail('Não foi possível iniciar: canal desconectado.'); }
  }
  begin() {
    clearTimeout(this.timer);
    this.d.stop(); this.d.rows = []; this.d.dropped = 0; this.d.previous.clear(); this.d.phase = 'voice';
    this.measuring = true; this.d.start(); this.d.sampleLocal?.();
    this.deadline = performance.now() + DURATION;
    this.notify('Teste automático em andamento (3 minutos). Sem gravação de conteúdo; as métricas serão reunidas na máquina que iniciou.');
    this.timer = setTimeout(() => this.finish(), DURATION + (this.owner ? 0 : 5000));
  }
  finish() {
    if (!this.active || this.finishing) return;
    this.finishing = true; this.measuring = false;
    clearTimeout(this.timer); this.d.stop(); this.local = this.d.export();
    if (this.owner) {
      this.notify('Coleta encerrada. Reunindo o relatório da outra ponta…');
      this.timer = setTimeout(() => this.fail('A coleta local foi salva, mas o relatório remoto não chegou.'), 20000);
      try { this.send('auto-stop'); } catch { this.fail('Conexão encerrada. Relatório disponível apenas desta ponta.'); }
    } else {
      try { this.send('auto-stop'); } catch { this.disconnected(); return; }
      void this.sendReport();
    }
  }
  async sendReport() {
    const id = this.id;
    try {
      const payload = JSON.stringify(this.local);
      if (payload.length > LIMIT) throw new Error('limit');
      const deadline = performance.now() + 15000;
      for (let offset = 0, index = 0; offset < payload.length; offset += CHUNK, index++) {
        while (this.d.channel?.bufferedAmount > 65536) {
          if (performance.now() > deadline || !this.active || this.id !== id) throw new Error('timeout');
          await new Promise(resolve => setTimeout(resolve, 25));
        }
        if (!this.active || this.id !== id) return;
        this.send('auto-part', { index, data: payload.slice(offset, offset + CHUNK) });
      }
      this.send('auto-end');
      this.active = false; this.finishing = false;
      this.notify('Teste concluído. Relatório enviado à máquina que iniciou.');
    } catch { this.fail('Não foi possível enviar o relatório. A coleta local continua disponível para exportar.'); }
  }
  fail(message) {
    clearTimeout(this.timer);
    if (this.measuring) { this.d.stop(); this.local = this.d.export(); }
    if (this.owner && this.local) this.buildReport(false);
    this.measuring = this.finishing = this.active = false;
    this.notify(message);
  }
  disconnected() { if (this.active) this.fail('Conexão interrompida. A coleta disponível foi preservada.'); }
  buildReport(complete) {
    this.report = { schema: 2, build: 'automatic-diagnostics-1', complete,
      note: 'Relógios locais independentes. Cenários observados, sem simular câmera, microfone, arquivos ou comandos YouTube.',
      local: this.local, remote: this.remote || null,
      summary: { local: summarizeRun(this.local), remote: this.remote ? summarizeRun(this.remote) : null } };
  }
  receive(message) {
    if (typeof message.type !== 'string' || !message.type.startsWith('auto-')) return false;
    if (message.type === 'auto-start') {
      if (this.active || this.d.running) {
        try { this.d.channel.send(JSON.stringify({ type: 'auto-busy', id: message.id })); } catch {}
        return true;
      }
      this.id = message.id; this.owner = false; this.active = true; this.finishing = false; this.local = null; this.report = null;
      this.begin();
      try { this.send('auto-ready'); } catch { this.disconnected(); }
      return true;
    }
    if (!this.active || message.id !== this.id) return true;
    if (message.type === 'auto-busy' && this.owner) { this.fail('A outra ponta já está coletando. Encerre a coleta atual e tente novamente.'); return true; }
    if (message.type === 'auto-ready' && this.owner && !this.measuring && !this.finishing) { this.begin(); return true; }
    if (message.type === 'auto-stop') { this.finish(); return true; }
    if (message.type === 'auto-part' && this.owner && this.finishing) {
      if (!Number.isInteger(message.index) || message.index !== this.parts.length || typeof message.data !== 'string' || message.data.length > CHUNK || (this.size += message.data.length) > LIMIT) {
        this.fail('Relatório remoto inválido ou maior que o limite.'); return true;
      }
      this.parts.push(message.data);
    }
    if (message.type === 'auto-end' && this.owner && this.finishing) {
      try {
        const remote = JSON.parse(this.parts.join(''));
        if (!Array.isArray(remote.rows) || remote.rows.length > 20000 || remote.rows.some(row => !row || typeof row.type !== 'string')) throw new Error('invalid');
        this.remote = remote; this.buildReport(true);
        clearTimeout(this.timer); this.active = this.finishing = false; this.parts = [];
        this.notify('Teste concluído nas duas pontas. Baixe o relatório único.');
      } catch { this.fail('Não foi possível validar o relatório remoto.'); }
    }
    return true;
  }
}
