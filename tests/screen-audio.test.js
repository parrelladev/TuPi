'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const peerSource = fs.readFileSync('public/js/core/peer.js', 'utf8').replace("import { diagnostics } from './diagnostics.js';", 'const diagnostics = {};');
const peerModule = import('data:text/javascript;base64,' + Buffer.from(peerSource).toString('base64'));
test('áudio da tela é identificado mesmo quando chega antes da faixa do microfone', async () => {
  const { PeerSession } = await peerModule;
  const mic = { kind: 'audio' }, screen = { kind: 'audio' };
  const microphone = { receiver: { track: mic } }, screenAudio = { receiver: { track: screen } };
  const pc = { getTransceivers: () => [microphone, screenAudio] };
  const stream = () => ({ tracks: [], getTracks() { return this.tracks; }, addTrack(t) { this.tracks.push(t); } });
  const routes = [], state = { pc, screenAudioTransceiver: null, remoteAudioStream: stream(), remoteScreenAudioStream: stream(), ui: { setScreenAudio: () => routes.push('screen'), playScreenAudio: () => routes.push('play-screen'), setRemoteAudio: () => routes.push('mic'), setPeerMediaStatus() {} }, playRemoteAudio() {} };
  PeerSession.prototype.handleTrack.call(state, { track: screen, transceiver: screenAudio }, pc);
  PeerSession.prototype.handleTrack.call(state, { track: mic, transceiver: microphone }, pc);
  assert.deepEqual(routes, ['screen', 'mic']);
  assert.deepEqual(state.remoteScreenAudioStream.tracks, [screen]);
  screen.onunmute(); assert.equal(routes.at(-1), 'play-screen');
});
test('orientação sobre captura sem áudio distingue Firefox e opção desmarcada', () => {
  const source = fs.readFileSync('public/js/features/media.js', 'utf8').replace('export class Media', 'class Media');
  const context = { navigator: { userAgent: 'Mozilla/5.0 Firefox/145.0' } };
  const reason = vm.runInNewContext(source + '\nMedia.prototype.noAudioReason({getSettings:()=>({})}, true)', context);
  assert.match(reason, /Firefox não oferece captura/);
  assert.match(reason, /quem recebe pode continuar no Firefox/);
  const unchecked = vm.runInNewContext(source + '\nMedia.prototype.noAudioReason({}, false)', { navigator: context.navigator });
  assert.match(unchecked, /desmarcada/);
});
