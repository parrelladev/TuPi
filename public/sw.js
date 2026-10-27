'use strict';

// Service Worker do TuPi: (1) abre o app offline (rede primeiro, cache como reserva) e
// (2) entrega arquivos recebidos por P2P ao gerenciador de downloads do navegador, em stream.
const CACHE = 'tupi-shell-v1';
const PRECACHE = [
  '/', '/app.js', '/style.css', '/manifest.webmanifest',
  '/assets/tupi-claro.svg', '/assets/tupi-escuro.svg', '/assets/favicon.ico', '/assets/icon-192.png', '/assets/icon-512.png',
  '/js/ui.js', '/js/fx.js', '/js/theme.js', '/js/theme-boot.js',
  '/js/core/signaling.js', '/js/core/peer.js', '/js/core/quality.js', '/js/core/stats.js', '/js/core/diagnostics.js', '/js/core/diagnostics-runner.js',
  '/js/features/chat.js', '/js/features/files.js', '/js/features/stream-save.js', '/js/features/youtube.js', '/js/features/media.js',
  '/js/features/avatars.js', '/js/features/presence.js', '/js/features/voice.js', '/js/features/speaker.js',
  '/js/features/notifier.js', '/js/features/screen.js',
  '/vendor/open-props.css', '/vendor/motion.js', '/vendor/auto-animate.js',
  '/vendor/phosphor/phosphor.css', '/vendor/phosphor/Phosphor.woff2', '/vendor/phosphor/Phosphor-Fill.woff2'
];
const DOWNLOAD_PREFIX = '/sw-download/';
const STREAM_TTL_MS = 120_000;
const streams = new Map();

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => Promise.all(PRECACHE.map(url => cache.add(new Request(url, { cache: 'reload' })).catch(() => {})))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith(DOWNLOAD_PREFIX)) { event.respondWith(serveDownload(url.pathname.slice(DOWNLOAD_PREFIX.length))); return; }
  if (request.method !== 'GET' || url.pathname === '/signal' || url.pathname.startsWith('/api/')) return;
  event.respondWith(networkFirst(request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') cache.put(request, response.clone()).catch(() => {});
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: true }) || (request.mode === 'navigate' ? await cache.match('/') : undefined);
    if (cached) return cached;
    throw error;
  }
}

// A página abre um stream pelo MessagePort ("stream"), recebe "ready", e só então navega para /sw-download/<id>.
self.addEventListener('message', event => {
  const message = event.data;
  const port = event.ports[0];
  if (!message || message.type !== 'stream' || !port || typeof message.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(message.id)) return;
  let controller;
  let pendingAck = false;
  let settled = false;
  const entry = { name: String(message.name || 'arquivo').slice(0, 255), size: Number(message.size) || 0, mime: String(message.mime || '') };
  entry.stream = new ReadableStream({
    start(c) { controller = c; },
    pull() {
      port.postMessage({ type: 'pulling' });
      if (pendingAck) { pendingAck = false; port.postMessage({ type: 'ack' }); }
    },
    cancel() { settled = true; streams.delete(message.id); port.postMessage({ type: 'cancel' }); }
  }, new CountQueuingStrategy({ highWaterMark: 16 }));
  port.onmessage = ({ data }) => {
    if (settled || !data) return;
    try {
      if (data.type === 'chunk' && data.buffer instanceof ArrayBuffer) {
        controller.enqueue(new Uint8Array(data.buffer));
        if (controller.desiredSize > 0) port.postMessage({ type: 'ack' }); else pendingAck = true;
      } else if (data.type === 'end') { settled = true; controller.close(); }
      else if (data.type === 'abort') { settled = true; streams.delete(message.id); controller.error(new Error('Transferência cancelada')); }
    } catch { settled = true; }
  };
  streams.set(message.id, entry);
  setTimeout(() => { if (streams.get(message.id) === entry && !entry.served) { streams.delete(message.id); settled = true; try { controller.error(new Error('expirado')); } catch {} } }, STREAM_TTL_MS);
  port.postMessage({ type: 'ready' });
});

function serveDownload(id) {
  const entry = streams.get(id);
  if (!entry || entry.served) return new Response('Download não encontrado', { status: 404 });
  entry.served = true;
  const ascii = entry.name.replace(/[^\x20-\x7e]|["\\%]/g, '_');
  const headers = {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(entry.name).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())}`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store'
  };
  if (entry.size > 0) headers['Content-Length'] = String(entry.size);
  return new Response(entry.stream, { headers });
}
