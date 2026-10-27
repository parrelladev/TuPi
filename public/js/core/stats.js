export class ConnectionStats {
  constructor(ui, peer, quality, intervalMs = 2000) {
    this.ui = ui;
    this.peer = peer;
    this.quality = quality;
    this.intervalMs = intervalMs;
    this.timer = null;
    this.previous = new Map();
    this.lastLevel = 0;
  }

  start() {
    this.stop();
    this.timer = setInterval(() => { void this.sample(); }, this.intervalMs);
    void this.sample();
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    this.previous.clear();
    this.lastLevel = 0;
    this.ui.setConnectionDiagnostics('Aguardando conexão de mídia');
    this.ui.setConnectionQuality(null);
  }

  async sample() {
    const pc = this.peer.pc;
    if (!pc || pc.connectionState === 'closed') {
      this.ui.setConnectionDiagnostics('Aguardando conexão de mídia');
      this.ui.setConnectionQuality(null);
      return;
    }
    try {
      const report = await pc.getStats();
      const now = performance.now();
      const rows = [...report.values()];
      const videos = rows.filter(row => row.type === 'outbound-rtp' && (row.kind || row.mediaType) === 'video' && !row.isRemote);
      const inbound = rows.filter(row => row.type === 'inbound-rtp' && (row.kind || row.mediaType) === 'video');
      const pair = rows.find(row => row.type === 'candidate-pair' && row.state === 'succeeded' && (row.selected || row.nominated)) ||
        rows.find(row => row.type === 'candidate-pair' && row.selected) ||
        rows.find(row => row.id === rows.find(item => item.type === 'transport')?.selectedCandidatePairId);
      const outboundCodec = rows.find(row => row.type === 'codec' && videos.some(video => video.codecId === row.id));
      const bitrate = videos.map(row => this.rate(row, 'bytesSent', now)).filter(Number.isFinite);
      const fps = videos.map(row => this.rate(row, 'framesEncoded', now)).filter(Number.isFinite);
      const receivedFps = inbound.map(row => this.rate(row, 'framesDecoded', now)).filter(Number.isFinite);
      const rtt = pair?.currentRoundTripTime != null ? `${Math.round(pair.currentRoundTripTime * 1000)} ms` : '—';
      const jitter = inbound.map(row => row.jitter).find(Number.isFinite);
      const lost = inbound.reduce((sum, row) => sum + (row.packetsLost || 0), 0);
      const received = inbound.reduce((sum, row) => sum + (row.packetsReceived || 0), 0);
      const loss = received + lost ? `${(100 * lost / (received + lost)).toFixed(1)}%` : '—';
      const lossFraction = received + lost ? lost / (received + lost) : NaN;
      this.quality.observeNetwork({ rtt: pair?.currentRoundTripTime, loss: lossFraction });
      let route = 'ICE: —';
      let relayed = false;
      let protocol = '';
      if (pair) {
        const local = rows.find(row => row.id === pair.localCandidateId);
        const remote = rows.find(row => row.id === pair.remoteCandidateId);
        relayed = local?.candidateType === 'relay' || remote?.candidateType === 'relay';
        protocol = (local?.protocol || '').toUpperCase();
        route = relayed ? 'Relay TURN' :
          local?.candidateType && remote?.candidateType ? 'Direto' : 'ICE conectado';
      }
      const bitrateLabel = bitrate.length ? `${Math.round(bitrate.reduce((a, b) => a + b, 0) / 1000)} kbps` : '—';
      const fpsLabel = fps.length ? `${Math.round(Math.max(...fps))} fps env.` : receivedFps.length ? `${Math.round(Math.max(...receivedFps))} fps rec.` : '—';
      const jitterLabel = Number.isFinite(jitter) ? `${Math.round(jitter * 1000)} ms` : '—';
      const codec = outboundCodec?.mimeType?.replace(/^video\//, '');
      const adaptive = this.quality.adaptiveLevel ? ` · adaptativo ${Math.round(Math.pow(0.8, this.quality.adaptiveLevel) * 100)}%` : '';
      this.reportQuality({ pair, relayed, protocol, route, rows, loss: lossFraction, jitter, bitrateLabel });
      this.ui.setConnectionDiagnostics(`ICE ${pc.iceConnectionState} · ${route}${codec ? ` · ${codec}` : ''}${adaptive}\nBitrate ${bitrateLabel} · ${fpsLabel}\nRTT ${rtt} · jitter ${jitterLabel} · perda ${loss}`);
    } catch {
      this.ui.setConnectionDiagnostics('Métricas de conexão indisponíveis neste navegador');
    }
  }

  // Nota de 0 (sem dados) a 4 (ótima) a partir de latência, perda e jitter.
  rateLevel(rttMs, lossPct, jitterMs) {
    if (!Number.isFinite(rttMs)) return 0;
    const loss = Number.isFinite(lossPct) ? lossPct : 0;
    const jitter = Number.isFinite(jitterMs) ? jitterMs : 0;
    if (rttMs > 350 || loss > 8 || jitter > 80) return 1;
    if (rttMs > 150 || loss > 2 || jitter > 40) return 2;
    if (rttMs > 80 || loss > 0.5 || jitter > 20) return 3;
    return 4;
  }

  reportQuality({ pair, relayed, protocol, route, loss, jitter, bitrateLabel }) {
    const rtt = pair?.currentRoundTripTime != null ? pair.currentRoundTripTime * 1000 : NaN;
    const lossPct = Number.isFinite(loss) ? loss * 100 : NaN;
    const jitterMs = Number.isFinite(jitter) ? jitter * 1000 : NaN;
    const level = this.rateLevel(rtt, lossPct, jitterMs);
    const rows = [
      ['Rota', pair ? (relayed ? 'Relé TURN' : route === 'Direto' ? 'Direta (P2P)' : route) + (protocol ? ` · ${protocol}` : '') : '—'],
      ['Latência', Number.isFinite(rtt) ? `${Math.round(rtt)} ms` : '—'],
      ['Perda', Number.isFinite(lossPct) ? `${lossPct.toFixed(1)}%` : '—'],
      ['Jitter', Number.isFinite(jitterMs) ? `${Math.round(jitterMs)} ms` : '—'],
      ['Vídeo enviado', bitrateLabel]
    ];
    const tips = [];
    if (level >= 1 && level <= 2) tips.push('Rede instável: desligar a câmera ou reduzir a qualidade da tela ajuda.');
    if (relayed) tips.push('Você está usando um servidor de relé (TURN): funciona em qualquer rede, mas é mais lento para arquivos e vídeo.');
    if (this.quality.adaptiveLevel > 0) tips.push('A qualidade do vídeo foi reduzida automaticamente e as transferências de arquivo ficam em pausa enquanto isso.');
    this.ui.setConnectionQuality({ level, rtt, rows, tip: tips.join(' ') });
    if (level === 1 && this.lastLevel >= 2) this.ui.notify('Conexão ruim. Desligar a câmera pode ajudar.');
    if (level > 0) this.lastLevel = level;
  }

  rate(row, field, now) {
    const key = `${row.id}:${field}`;
    const current = { value: row[field], time: now };
    const old = this.previous.get(key);
    this.previous.set(key, current);
    if (!old || current.value < old.value || current.time <= old.time) return NaN;
    const factor = field === 'bytesSent' ? 8 : 1;
    return (current.value - old.value) * factor * 1000 / (current.time - old.time);
  }
}
