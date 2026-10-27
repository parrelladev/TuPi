'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const commonJsFiles = ['server.js', 'public/js/theme-boot.js'];
const moduleFiles = [
  'public/app.js', 'public/js/ui.js', 'public/js/fx.js', 'public/js/theme.js', 'public/js/core/signaling.js',
  'public/js/core/peer.js', 'public/js/core/quality.js', 'public/js/core/stats.js',
  'public/js/features/chat.js', 'public/js/features/media.js',
  'public/js/features/files.js', 'public/js/features/youtube.js',
  'public/js/features/avatars.js', 'public/js/features/presence.js', 'public/js/features/voice.js'
];

function check(file, module = false) {
  const args = module ? ['--input-type=module', '--check'] : ['--check', file];
  const result = spawnSync(process.execPath, args, module ? { input: fs.readFileSync(path.join(process.cwd(), file)) } : { cwd: process.cwd(), encoding: 'utf8' });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status || 1;
}

for (const file of commonJsFiles) check(file);
for (const file of moduleFiles) check(file, true);
