'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { summarize } = require('../scripts/summarize-diagnostics.js');
const automaticUrl = `data:text/javascript;base64,${fs.readFileSync('public/js/core/diagnostics-runner.js').toString('base64')}`;
const diagnosticSource = fs.readFileSync('public/js/core/diagnostics.js', 'utf8').replace("'./diagnostics-runner.js'", JSON.stringify(automaticUrl));
const diagnosticUrl = `data:text/javascript;base64,${Buffer.from(diagnosticSource).toString('base64')}`;
const modulePromise = import(diagnosticUrl);

test('disabled diagnostics collect nothing; stop clears pending work', async () => {
  const { Diagnostics } = await modulePromise;
  const d = new Diagnostics(); d.start(); d.record('test');
  assert.equal(d.running, false); assert.equal(d.rows.length, 0);
  d.pending.set(1, { at: 0 }); d.stop(); assert.equal(d.pending.size, 0);
});

test('RTT matches local pending ID and originating phase, ignores unsolicited pong', async () => {
  const { Diagnostics } = await modulePromise;
  const d = new Diagnostics(true); d.running = true;
  let sent;
  const channel = { readyState: 'open', bufferedAmount: 0, send: data => { sent = JSON.parse(data); }, close() {} };
  d.attach(channel); d.ping(); d.phase = 'screen';
  channel.onmessage({ data: JSON.stringify({ type: 'pong', id: sent.id }) });
  const rtt = d.rows.find(row => row.type === 'peer-rtt');
  assert.equal(rtt.phase, 'voice'); assert.ok(rtt.ms >= 0);
  channel.onmessage({ data: JSON.stringify({ type: 'pong', id: sent.id }) });
  assert.equal(d.rows.filter(row => row.type === 'peer-rtt').length, 1);
  d.ping(); d.pending.get(sent.id).at -= 11000; d.ping();
  assert.ok(d.rows.some(row => row.type === 'probe-timeout'));
  d.stop(); channel.onmessage({ data: '{"type":"ping","id":1}' });
  assert.equal(sent.type, 'status'); assert.equal(sent.running, false);
});

test('audio uses interval deltas, preserves unavailable fields and resets safely', async () => {
  const { Diagnostics } = await modulePromise;
  const d = new Diagnostics(true); d.running = true;
  const row = { id: 'a', mid: '0', type: 'inbound-rtp', kind: 'audio', jitterBufferDelay: 10, jitterBufferEmittedCount: 100, packetsReceived: 100 };
  d.stats([row]);
  assert.equal(d.rows.filter(row => row.type === 'audio')[0].jitterBufferMs, null);
  d.stats([{ ...row, jitterBufferDelay: 12, jitterBufferEmittedCount: 200, packetsReceived: 200 }]);
  assert.equal(d.rows.filter(row => row.type === 'audio')[1].jitterBufferMs, 20);
  assert.equal(d.rows.filter(row => row.type === 'audio')[1].concealedSamples, null);
  d.stats([row]); assert.equal(d.rows.filter(row => row.type === 'audio')[2].jitterBufferMs, null);
});

test('file samples aggregate without per-chunk growth; exports and storage are bounded', async () => {
  const { Diagnostics } = await modulePromise;
  const d = new Diagnostics(true); d.running = true;
  for (let i = 0; i < 1000; i++) d.fileHandler(2, 3);
  assert.equal(d.rows.length, 0);
  d.flushFiles(); assert.equal(d.rows[0].count, 1000); assert.equal(d.rows[0].queueMaxMs, 2);
  for (let i = 0; i < 21000; i++) d.record('bounded');
  assert.equal(d.rows.length, 20000); assert.equal(d.dropped, 1001);
});

test('summary excludes nulls and groups scenarios and audio streams', () => {
  const result = summarize({ rows: [
    ...[1, 2, 3, 100, null].map(ms => ({ phase: 'voice', type: 'peer-rtt', ms })),
    { phase: 'screen', type: 'peer-rtt', ms: 50 },
    { phase: 'voice', type: 'audio', stream: '0', jitterMs: 4, concealedSamples: 12 }
  ] });
  assert.deepEqual(result.metrics['voice/peer-rtt/ms'], { n: 4, median: 2, p95: 100, max: 100 });
  assert.equal(result.metrics['screen/peer-rtt/ms'].median, 50);
  assert.equal(result.audioTotals['voice/stream-0'].concealedSamples, 12);
});

test('YouTube pending command retains local receive time until API invocation', async () => {
  const source = fs.readFileSync('public/js/features/youtube.js', 'utf8').replace("'../core/diagnostics.js'", JSON.stringify(diagnosticUrl));
  const { YouTubeTogether } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const { diagnostics } = await modulePromise;
  diagnostics.running = true;
  const youtube = Object.create(YouTubeTogether.prototype);
  youtube.tolerance = 1;
  const measurement = { receivedAt: performance.now() - 20, phase: 'youtube' };
  youtube.applyRemoteState('pause', 0, measurement);
  assert.equal(youtube.pendingState.measurement, measurement);
  let paused = false;
  youtube.player = { getCurrentTime: () => 0, pauseVideo: () => { paused = true; } };
  youtube.applyRemoteState('pause', 0, youtube.pendingState.measurement);
  assert.equal(paused, true);
  const row = diagnostics.rows.find(row => row.type === 'youtube-api-applied');
  assert.ok(row.ms >= 20); assert.equal(row.phase, 'youtube');
  diagnostics.stop();
});

test('probe distinguishes stopped remote, silence and recovery without inventing RTT', async () => {
  const { Diagnostics } = await modulePromise;
  const d = new Diagnostics(true); d.running = true;
  let sent;
  const channel = { readyState: 'open', bufferedAmount: 0, send(data) { sent = JSON.parse(data); }, close() {} };
  d.attach(channel); d.ping();
  channel.onmessage({ data: JSON.stringify({ type: 'status', id: sent.id, running: false }) });
  assert.equal(d.peerStatus, 'remote-stopped');
  assert.equal(d.pending.size, 0);
  assert.equal(d.rows.filter(row => row.type === 'peer-rtt').length, 0);
  d.lastReply -= 11000; d.ping();
  assert.equal(d.peerStatus, 'silent');
  channel.onmessage({ data: JSON.stringify({ type: 'pong', id: sent.id }) });
  assert.equal(d.peerStatus, 'responding');
  channel.readyState = 'closed'; channel.onclose();
  assert.equal(d.peerStatus, 'unavailable');
  d.stop(); assert.equal(d.peerStatus, 'stopped');
});

test('stopped remote answers bounded status only, disabled remote sends nothing', async () => {
  const { Diagnostics } = await modulePromise;
  const d = new Diagnostics(true);
  const sent = [];
  const channel = { readyState: 'open', bufferedAmount: 0, send(data) { sent.push(JSON.parse(data)); }, close() {} };
  d.attach(channel);
  channel.onmessage({ data: '{"type":"ping","id":42}' });
  channel.onmessage({ data: '{"type":"ping","id":43}' });
  assert.deepEqual(sent, [{ type: 'status', id: 42, running: false }]);
  assert.equal(d.rows.length, 0);
  d.enabled = false; d.lastEcho = null;
  channel.onmessage({ data: '{"type":"ping","id":44}' });
  assert.equal(sent.length, 1);
});

test('audio absence distinguishes no RTP, unknown media and video only, with safe receiver state', async () => {
  const { Diagnostics } = await modulePromise;
  const d = new Diagnostics(true); d.running = true;
  const pc = { getTransceivers: () => [{ currentDirection: 'recvonly', receiver: { track: { kind: 'audio', id: 'private-id', label: 'private-label', readyState: 'live', muted: true, enabled: true } } }] };
  d.stats([], pc);
  d.stats([{ type: 'inbound-rtp', kind: 'video' }], pc);
  d.stats([{ type: 'inbound-rtp' }], pc);
  d.statsUnavailable('get-stats-failed');
  d.statsUnavailable('no-connection');
  assert.deepEqual(d.rows.map(row => row.reason), ['no-inbound-rtp', 'no-audio-inbound-rtp', 'unclassified-inbound-rtp', 'get-stats-failed', 'no-connection']);
  assert.equal(d.rows[0].receivers[0].muted, true);
  assert.ok(!JSON.stringify(d.export()).includes('private-'));
});

test('audio classification falls back to codec and reports missing metric fields', async () => {
  const { Diagnostics } = await modulePromise;
  const d = new Diagnostics(true); d.running = true;
  d.stats([{ id: 'c', type: 'codec', mimeType: 'audio/opus' }, { id: 'a', type: 'inbound-rtp', codecId: 'c', packetsReceived: 5 }]);
  const availability = d.rows.find(row => row.type === 'audio-availability');
  assert.equal(availability.reason, 'available');
  assert.equal(availability.fields[0].packetsReceived, true);
  assert.equal(availability.fields[0].bufferDelay, false);
  assert.equal(d.rows.find(row => row.type === 'audio').jitterBufferMs, null);
  assert.equal(summarize(d.export()).diagnosticStates['voice/audio-availability/available'], 1);
});
