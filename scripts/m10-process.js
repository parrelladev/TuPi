'use strict';

// Linux-only, opt-in sampler for the server process; never measures browser media.
const fs = require('node:fs');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const pid = Number(process.argv[2]);
const seconds = Number(process.argv[3] || 60);
if (process.platform !== 'linux' || !Number.isInteger(pid) || pid <= 0 || !Number.isFinite(seconds) || seconds < 5 || seconds > 3600) {
  console.error('Uso (Linux): node scripts/m10-process.js <PID do servidor> [segundos: 5..3600]');
  process.exit(1);
}
const ticksPerSecond = Number(execFileSync('getconf', ['CLK_TCK'], { encoding: 'utf8' }).trim());
const samples = [];
let initialStartTime;
function sample() {
  const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
  const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/);
  const startTime = fields[19]; // Field 22, with pid and comm removed.
  if (initialStartTime !== undefined && startTime !== initialStartTime) throw new Error('PID reutilizado durante a coleta.');
  initialStartTime = startTime;
  const status = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
  const rss = status.match(/^VmRSS:\s+(\d+) kB$/m);
  if (!rss) throw new Error('RSS indisponível.');
  return { elapsedMs: performance.now() - started, cpuTicks: Number(fields[11]) + Number(fields[12]), rssKiB: Number(rss[1]) };
}
const started = performance.now();
(async () => {
  samples.push(sample());
  while (performance.now() - started < seconds * 1000) {
    await new Promise(resolve => setTimeout(resolve, Math.min(5000, Math.max(1, seconds * 1000 - (performance.now() - started)))));
    samples.push(sample());
  }
  const first = samples[0];
  const last = samples.at(-1);
  const elapsedSeconds = (last.elapsedMs - first.elapsedMs) / 1000;
  const cpuSeconds = (last.cpuTicks - first.cpuTicks) / ticksPerSecond;
  console.log(JSON.stringify({ measuredAt: new Date().toISOString(), pid, node: process.version, kernel: os.release(),
    method: 'Linux /proc: delta utime+stime / CLK_TCK; CPU percent of one core; VmRSS sampled every 5s. Server only; excludes browser, GPU and TURN.',
    elapsedSeconds, ticksPerSecond, cpuSeconds, cpuPercentOneCore: 100 * cpuSeconds / elapsedSeconds,
    rssMinKiB: Math.min(...samples.map(row => row.rssKiB)), rssMaxKiB: Math.max(...samples.map(row => row.rssKiB)), samples
  }, null, 2));
})().catch(error => { console.error(`Coleta incompleta: ${error.message}`); process.exitCode = 1; });
