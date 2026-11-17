'use strict';
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');

(async () => {
  const root = path.resolve(__dirname, '../..');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tupi-activity-browser-'));
  const server = spawn(process.execPath, [path.join(root, 'server.js')], {
    cwd: root, env: { ...process.env, PORT: '3140', HOST: '127.0.0.1', BOARD_DATA_DIR: dir, ICE_SERVERS: '[]' }, stdio: 'pipe'
  });
  let browser;
  const errors = [];
  try {
    await new Promise((resolve, reject) => {
      server.stdout.once('data', resolve); server.once('error', reject);
      server.once('exit', code => reject(new Error(`Servidor encerrou: ${code}`)));
    });
    browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'msedge' });
    const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
    const pages = await Promise.all(contexts.map(context => context.newPage()));
    for (const page of pages) {
      page.setDefaultTimeout(15000);
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(() => {
        window.activityNotes = []; window.activitySent = []; window.notificationChannels = [];
        const createOscillator = AudioContext.prototype.createOscillator;
        AudioContext.prototype.createOscillator = function () {
          window.notificationContext = this;
          return createOscillator.call(this);
        };
        const setValue = AudioParam.prototype.setValueAtTime;
        AudioParam.prototype.setValueAtTime = function (value, at) {
          // O primeiro tom de activity é 587 Hz; chegada e chat usam outros tons.
          if (value === 587) window.activityNotes.push(at);
          return setValue.call(this, value, at);
        };
        const send = RTCDataChannel.prototype.send;
        RTCDataChannel.prototype.send = function (data) {
          if (this.label === 'notifications') window.activitySent.push(data);
          return send.call(this, data);
        };
        const create = RTCPeerConnection.prototype.createDataChannel;
        RTCPeerConnection.prototype.createDataChannel = function (...args) {
          const channel = create.apply(this, args);
          if (channel.label === 'notifications') window.notificationChannels.push(channel);
          return channel;
        };
        navigator.mediaDevices.getDisplayMedia = async () => {
          const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
          canvas.getContext('2d').fillRect(0, 0, 640, 360);
          return canvas.captureStream(10);
        };
      });
      await page.goto('http://127.0.0.1:3140/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.locator('#lobbyJoinBtn').click();
    }
    const [a, b] = pages;
    for (const page of pages) await page.waitForFunction(() => document.querySelector('#chatStatus').textContent === 'Conectado');
    await a.waitForFunction(() => window.notificationChannels.some(c => c.readyState === 'open'));
    const expectCounts = async (local, remote) => {
      await a.waitForFunction(n => window.activityNotes.length === n, local);
      await b.waitForFunction(n => window.activityNotes.length === n, remote);
    };
    await a.locator('#youtubeToggleBtn').click(); await expectCounts(1, 1);
    // Abrir quadro logo após YouTube preserva os dois avisos.
    await b.locator('#whiteboardBtn').click(); await expectCounts(2, 2);
    await a.locator('#screenBtn').click();
    await a.locator('#shareConfiguredBtn').click(); await expectCounts(3, 3);
    await a.locator('#screenBtn').click();
    assert.deepEqual(await a.evaluate(() => window.activitySent), ['youtube-opened', 'screen-started']);
    assert.deepEqual(await b.evaluate(() => window.activitySent), ['board-opened']);

    // Reconexão restaura os painéis sem tratar estado como ação.
    await a.locator('#reconnectBtn').click();
    await a.waitForFunction(() => !document.querySelector('#reconnectBtn').disabled);
    for (const page of pages) await page.waitForFunction(() => document.querySelector('#chatStatus').textContent === 'Conectado');
    assert.equal(await a.evaluate(() => window.activityNotes.length), 3);
    assert.equal(await b.evaluate(() => window.activityNotes.length), 3);
    // A preferência local desativa o som sem impedir o envio/recebimento.
    await b.locator('#chatToggleBtn').click(); await b.locator('#chatSoundToggle').click();
    await a.locator('#youtubeToggleBtn').click(); await a.locator('#youtubeToggleBtn').click();
    await a.waitForFunction(() => window.activityNotes.length === 4);
    await b.waitForFunction(() => !document.querySelector('#youtubePanel').classList.contains('hidden'));
    assert.equal(await b.evaluate(() => window.activityNotes.length), 3);
    assert.equal(await b.evaluate(() => localStorage.getItem('tupi-chat-sound')), 'off');
    // Interrupção do Web Audio deixa uma ação visível, inclusive com os
    // painéis de YouTube/quadro abertos e em uma tela pequena.
    await a.setViewportSize({ width: 390, height: 844 });
    await a.evaluate(() => window.notificationContext.suspend());
    const enable = a.locator('#enableNotificationAudioBtn');
    await enable.waitFor({ state: 'visible' });
    const bounds = await enable.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 391);
    await enable.click(); await enable.waitFor({ state: 'hidden' });
    assert.equal(await a.evaluate(() => window.notificationContext.state), 'running');
    assert.notEqual(await a.evaluate(() => localStorage.getItem('tupi-chat-sound')), 'off');
    assert.deepEqual(errors, []);
    console.log('PASS: dois participantes, tela/quadro/YouTube, tipos sem conteúdo, sem eco/replay, eventos próximos, áudio desativado e ativação com um clique.');
  } finally {
    await browser?.close(); server.kill();
    await new Promise(resolve => server.exitCode !== null ? resolve() : server.once('exit', resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
