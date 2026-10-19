const { test } = require('node:test'); const assert = require('node:assert/strict'); const fs = require('node:fs'); const path = require('node:path');
const modulePromise = import('../app/audio.js');

test('changing voices during preparation cannot arm the old microphone or clear the new attempt', async () => {
  const { AudioMixer } = await modulePromise; const requests = new Map(); let armed = 0, disarmed = 0;
  const mixer = new AudioMixer({ prepare: voice => new Promise((resolve, reject) => requests.set(voice, { resolve, reject })), arm: async () => { armed++; }, disarm: async () => { disarmed++; } }, () => {});
  mixer.open = async () => {};
  const first = mixer.startMic('physical-mic', 'output', 'bolsonaro'); mixer.stopMic();
  const next = mixer.startMic('physical-mic', 'output', 'mano-brown'); const before = disarmed;
  requests.get('bolsonaro').reject(new Error('old request failed')); await first;
  assert.equal(armed, 0); assert.equal(disarmed, before); assert.equal(mixer.starting, true);
  mixer.stopMic(); requests.get('mano-brown').resolve(); await next;
  assert.equal(armed, 0); assert.equal(mixer.active, false);
});
test('cancel while opening output never arms microphone permission', async () => {
  const { AudioMixer } = await modulePromise; let release, armed = 0;
  const mixer = new AudioMixer({ arm: async () => { armed++; }, disarm: async () => {} }, () => {});
  mixer.open = () => new Promise(resolve => { release = resolve; });
  const pending = mixer.startMic('physical-mic', 'output', 'normal'); mixer.stopMic(); release(); await pending;
  assert.equal(armed, 0); assert.equal(mixer.active, false);
});
test('cancel during permission arming never reaches getUserMedia', async () => {
  const { AudioMixer } = await modulePromise; let release;
  const mixer = new AudioMixer({ arm: () => new Promise(resolve => { release = resolve; }), disarm: async () => {} }, () => {});
  mixer.open = async () => {};
  const pending = mixer.startMic('physical-mic', 'output', 'normal'); await Promise.resolve(); mixer.stopMic(); release();
  // getUserMedia is intentionally absent; touching it would reject this test.
  await pending; assert.equal(mixer.active, false);
});
