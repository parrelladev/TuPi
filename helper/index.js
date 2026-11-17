'use strict';
const { WebSocketServer } = require('ws');
const { mouse, keyboard, screen, Point, Button } = require('@nut-tree-fork/nut-js');
const { resolveKey, allowedCode } = require('./key-map');

const PORT = 17172;
const BUTTONS = { 0: Button.LEFT, 1: Button.MIDDLE, 2: Button.RIGHT };

let activeSocket = null;
let screenSize = { width: 1920, height: 1080 };

async function readScreenSize() {
  try { screenSize = { width: await screen.width(), height: await screen.height() }; }
  catch { /* mantém o último valor conhecido se a leitura falhar */ }
}

const clampCoord = value => Number.isFinite(value) && value >= 0 && value <= 1;
const toPixel = (x, y) => new Point(Math.round(x * screenSize.width), Math.round(y * screenSize.height));

async function handleCommand(message) {
  if (message.t === 'move' && clampCoord(message.x) && clampCoord(message.y)) {
    await mouse.setPosition(toPixel(message.x, message.y));
    return;
  }
  if (message.t === 'btn' && [0, 1, 2].includes(message.b) && [0, 1].includes(message.s)) {
    if (clampCoord(message.x) && clampCoord(message.y)) await mouse.setPosition(toPixel(message.x, message.y));
    const button = BUTTONS[message.b];
    if (message.s === 1) await mouse.pressButton(button); else await mouse.releaseButton(button);
    return;
  }
  if (message.t === 'wheel' && Number.isFinite(message.dx) && Number.isFinite(message.dy) && Math.abs(message.dx) <= 500 && Math.abs(message.dy) <= 500) {
    if (message.dy > 0) await mouse.scrollDown(Math.round(message.dy));
    else if (message.dy < 0) await mouse.scrollUp(Math.round(-message.dy));
    if (message.dx > 0) await mouse.scrollRight(Math.round(message.dx));
    else if (message.dx < 0) await mouse.scrollLeft(Math.round(-message.dx));
    return;
  }
  if (message.t === 'key' && allowedCode(message.code) && [0, 1].includes(message.s)) {
    const key = resolveKey(message.code);
    if (!key) return;
    if (message.s === 1) await keyboard.pressKey(key); else await keyboard.releaseKey(key);
    return;
  }
  if (message.t === 'text' && typeof message.value === 'string' && message.value.length <= 200 && !/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(message.value)) {
    await keyboard.type(message.value);
  }
}

function send(ws, message) { try { ws.send(JSON.stringify(message)); } catch { /* o socket pode já ter caído */ } }

const wss = new WebSocketServer({ host: '127.0.0.1', port: PORT });

// Escuta só em 127.0.0.1: essa é a única barreira de pareamento. Quem já consegue
// abrir um socket nesta porta já está rodando código nesta mesma máquina.
wss.on('connection', async ws => {
  if (activeSocket && activeSocket !== ws) activeSocket.close();
  activeSocket = ws;
  await readScreenSize();
  send(ws, { t: 'ready', screen: screenSize });

  ws.on('message', async raw => {
    if (activeSocket !== ws) return;
    const text = typeof raw === 'string' ? raw : Buffer.isBuffer(raw) ? raw.toString() : null;
    if (!text || text.length > 400) return;
    let message;
    try { message = JSON.parse(text); } catch { return; }
    if (!message || typeof message !== 'object' || typeof message.t !== 'string') return;
    try { await handleCommand(message); } catch { /* comando inválido ou falha pontual do SO: ignora e segue */ }
  });
  ws.on('close', () => { if (activeSocket === ws) activeSocket = null; });
});

console.log('TuPi Remote Helper');
console.log(`Escutando em ws://127.0.0.1:${PORT} (só nesta máquina)`);
console.log('No TuPi, ligue "Permitir controle remoto" (Mais > Controle remoto) para conectar automaticamente.');
console.log('Mantenha esta janela aberta enquanto usar o controle remoto. Feche para revogar o acesso imediatamente.');
