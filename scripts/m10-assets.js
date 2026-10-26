'use strict';

// Reproducible asset inventory. gzip is comparative; server.js serves raw bytes.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { gzipSync } = require('node:zlib');

const root = path.join(__dirname, '..');
function inventory(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en')).flatMap(entry => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return inventory(absolute);
    if (!entry.isFile()) return [];
    const body = fs.readFileSync(absolute);
    return [{ file: path.relative(root, absolute).split(path.sep).join('/'), bytes: body.length, gzipBytes: gzipSync(body, { level: 9 }).length }];
  });
}
const assets = inventory(path.join(root, 'public'));
const sum = (rows, field) => rows.reduce((total, row) => total + row[field], 0);
const code = assets.filter(asset => /\.(js|css|svg)$/.test(asset.file));
console.log(JSON.stringify({
  measuredAt: new Date().toISOString(),
  environment: { node: process.version, platform: process.platform, arch: process.arch, kernel: os.release(), ws: require('ws/package.json').version },
  method: 'All regular files in public; per-file gzip level 9. No build; HTTP server serves uncompressed files. Excludes optional YouTube/network traffic.',
  totals: { files: assets.length, rawBytes: sum(assets, 'bytes'), gzipBytes: sum(assets, 'gzipBytes'), jsCssSvgBytes: sum(code, 'bytes'), jsCssSvgGzipBytes: sum(code, 'gzipBytes') },
  assets
}, null, 2));
