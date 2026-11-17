'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const modulePromise = import(`data:text/javascript;base64,${fs.readFileSync('public/js/core/diagnostics-runner.js').toString('base64')}`);
const flush = () => new Promise(resolve => setImmediate(resolve));
function diagnostic() {
  return { running: false, rows: [], previous: new Map(), dropped: 0,
    start() { this.running = true; }, stop() { this.running = false; },
    export() { return { schema: 1, rows: this.rows, dropped: 0 }; } };
}
async function pair() {
  const { AutomaticTest } = await modulePromise;
  const da = diagnostic(), db = diagnostic();
  const a = new AutomaticTest(da), b = new AutomaticTest(db);
  da.channel = { readyState: 'open', bufferedAmount: 0, send: raw => queueMicrotask(() => b.receive(JSON.parse(raw))) };
  db.channel = { readyState: 'open', bufferedAmount: 0, send: raw => queueMicrotask(() => a.receive(JSON.parse(raw))) };
  return { a, b, da, db };
}

test('one click starts both peers, early finish produces one combined report', async () => {
  const { a, b, da, db } = await pair();
  a.start(); await flush();
  assert.equal(da.running, true); assert.equal(db.running, true);
  da.rows.push({ type: 'peer-rtt', phase: 'voice', ms: 100 });
  db.rows.push({ type: 'peer-rtt', phase: 'voice', ms: 120 });
  a.finish(); await flush();
  assert.equal(a.active, false); assert.equal(b.active, false);
  assert.equal(da.running, false); assert.equal(db.running, false);
  assert.equal(a.report.complete, true);
  assert.equal(a.report.summary.remote.metrics['peer-rtt.ms'].median, 120);
});

test('remote user can stop and still deliver report to initiating peer', async () => {
  const { a, b } = await pair(); a.start(); await flush();
  b.finish(); await flush();
  assert.equal(a.report.complete, true); assert.equal(b.active, false);
});

test('busy remote does not have existing collection overwritten', async () => {
  const { a, b, db } = await pair(); db.running = true; db.rows.push({ type: 'existing' });
  a.start(); await flush();
  assert.equal(a.active, false); assert.equal(b.active, undefined);
  assert.equal(db.rows[0].type, 'existing'); assert.equal(db.running, true);
});

test('disconnect preserves partial report and stale session messages are ignored', async () => {
  const { a, b, da } = await pair(); a.start(); await flush();
  da.rows.push({ type: 'peer-rtt', phase: 'voice', ms: 50 });
  a.disconnected(); b.disconnected();
  assert.equal(a.report.complete, false); assert.equal(a.report.local.rows.length, 1);
  a.receive({ type: 'auto-end', id: a.id }); assert.equal(a.report.complete, false);
});

test('invalid or out of sequence report blocks are rejected', async () => {
  const { a, b, da } = await pair(); a.start(); await flush();
  da.channel.send = () => {}; a.finish();
  a.receive({ type: 'auto-part', id: a.id, index: 2, data: '{}' });
  assert.equal(a.active, false); assert.equal(a.report.complete, false);
  b.disconnected();
});

test('three minute deadline stops both sides and transfers multiple report blocks', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { a, b, db } = await pair(); a.start(); await flush();
  db.rows = Array.from({ length: 1000 }, () => ({ type: 'peer-rtt', phase: 'screen', ms: 123 }));
  t.mock.timers.tick(180000); await flush();
  assert.equal(a.report.complete, true);
  assert.equal(a.report.remote.rows.length, 1000);
  assert.equal(a.active, false); assert.equal(b.active, false);
});
