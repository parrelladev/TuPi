'use strict';
const fs = require('node:fs');

function summarize(data) {
  if (data.schema === 2 && data.local) return { complete: data.complete, local: summarize(data.local), remote: data.remote ? summarize(data.remote) : null };
  const groups = new Map();
  // Only duration/gauge fields: cumulative/window counters are kept in event totals below.
  const fields = {
    http: ['headersMs', 'totalMs'], 'peer-rtt': ['ms'], scheduler: ['lateMs'],
    ice: ['rttMs'], audio: ['jitterMs', 'jitterBufferMs', 'jitterTargetMs', 'processingMs'],
    'audio-context': ['baseLatencyMs', 'outputLatencyMs'], capture: ['latencyMs'],
    'chat-applied': ['ms'], 'youtube-api-applied': ['ms'],
    'file-handlers': ['queueMaxMs', 'processingMaxMs'], buffers: ['chatBytes', 'fileBytes', 'controlBytes']
  };
  const events = {};
  const audioTotals = {};
  const diagnosticStates = {};
  for (const row of data.rows || []) {
    const key = `${row.phase}/${row.type}`;
    events[key] = (events[key] || 0) + 1;
    if (row.type === 'audio-availability' || row.type === 'probe-status') {
      const stateKey = `${key}/${row.reason || row.state}`;
      diagnosticStates[stateKey] = (diagnosticStates[stateKey] || 0) + 1;
    }
    for (const field of fields[row.type] || []) {
      if (!Number.isFinite(row[field])) continue;
      const metric = `${key}${row.stream != null ? `/stream-${row.stream}` : ''}/${field}`;
      if (!groups.has(metric)) groups.set(metric, []);
      groups.get(metric).push(row[field]);
    }
    if (row.type === 'audio') {
      const stream = `${row.phase}/stream-${row.stream ?? 'unknown'}`;
      const totals = audioTotals[stream] ||= {};
      for (const field of ['packetsLost', 'packetsReceived', 'concealedSamples', 'concealmentEvents', 'totalSamplesReceived']) {
        if (Number.isFinite(row[field])) totals[field] = (totals[field] || 0) + row[field];
      }
    }
  }
  const metrics = {};
  for (const [key, values] of groups) {
    values.sort((a, b) => a - b);
    const quantile = p => values[Math.max(0, Math.ceil(values.length * p) - 1)];
    metrics[key] = { n: values.length, median: quantile(0.5), p95: quantile(0.95), max: values.at(-1) };
  }
  return { build: data.build, dropped: data.dropped, pendingProbes: data.pendingProbes, metrics, events, audioTotals, diagnosticStates };
}

module.exports = { summarize };
if (require.main === module) {
  if (!process.argv[2]) { console.error('Uso: node scripts/summarize-diagnostics.js registro.json [depois.json]'); process.exitCode = 1; }
  else {
    const reports = process.argv.slice(2).map(file => ({ file, ...summarize(JSON.parse(fs.readFileSync(file, 'utf8'))) }));
    console.log(JSON.stringify(reports, null, 2));
  }
}
