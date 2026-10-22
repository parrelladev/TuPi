export class ConnectionStats {
  constructor(ui, peer, quality, intervalMs = 2000) {
    this.ui = ui;
    this.peer = peer;
    this.quality = quality;
    this.intervalMs = intervalMs;
    this.timer = null;
    this.previous = new Map();
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
    this.ui.setConnectionDiagnostics('Aguardando conexão de mídia');
  }

  async sample() {
    const pc = this.peer.pc;
    if (!pc || pc.connectionState === 'closed') {
      this.ui.setConnectionDiagnostics('Aguardando conexão de mídia');
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
      if (pair) {
        const local = rows.find(row => row.id === pair.localCandidateId);
        const remote = rows.find(row => row.id === pair.remoteCandidateId);
        route = local?.candidateType === 'relay' || remote?.candidateType === 'relay' ? 'Relay TURN' :
          local?.candidateType && remote?.candidateType ? 'Direto' : 'ICE conectado';
      }
      const bitrateLabel = bitrate.length ? `${Math.round(bitrate.reduce((a, b) => a + b, 0) / 1000)} kbps` : '—';
      const fpsLabel = fps.length ? `${Math.round(Math.max(...fps))} fps env.` : receivedFps.length ? `${Math.round(Math.max(...receivedFps))} fps rec.` : '—';
      const jitterLabel = Number.isFinite(jitter) ? `${Math.round(jitter * 1000)} ms` : '—';
      const codec = outboundCodec?.mimeType?.replace(/^video\//, '');
      const adaptive = this.quality.adaptiveLevel ? ` · adaptativo ${Math.round(Math.pow(0.8, this.quality.adaptiveLevel) * 100)}%` : '';
      this.ui.setConnectionDiagnostics(`ICE ${pc.iceConnectionState} · ${route}${codec ? ` · ${codec}` : ''}${adaptive}\nBitrate ${bitrateLabel} · ${fpsLabel}\nRTT ${rtt} · jitter ${jitterLabel} · perda ${loss}`);
    } catch {
      this.ui.setConnectionDiagnostics('Métricas de conexão indisponíveis neste navegador');
    }
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
