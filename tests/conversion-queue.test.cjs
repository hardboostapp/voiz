const { test } = require('node:test'); const assert = require('node:assert/strict');
const modulePromise = import('../app/conversion-queue.mjs');
const turn = () => new Promise(resolve => setImmediate(resolve));
test('a stalled conversion preserves every following speech block in order', async () => {
  const { ConversionQueue } = await modulePromise; const started = [], received = []; let release;
  const queue = new ConversionQueue(async sample => { started.push(sample); if (sample === 1) await new Promise(resolve => { release = resolve; }); return sample; }, value => received.push(value), error => { throw error; });
  queue.push(1); queue.push(2); queue.push(3); assert.deepEqual(started, [1]);
  release(); await turn(); assert.deepEqual(received, [1, 2, 3]);
});
test('stop discards stale results and pending speech, without sending it to a new voice', async () => {
  const { ConversionQueue } = await modulePromise; let release, received = 0, calls = 0;
  const queue = new ConversionQueue(() => { calls++; return new Promise(resolve => { release = resolve; }); }, () => received++, () => {});
  queue.push(1); queue.push(2); queue.close(); release(1); await turn(); assert.equal(calls, 1); assert.equal(received, 0);
});
test('sustained overload stops with an error instead of deleting syllables forever', async () => {
  const { ConversionQueue } = await modulePromise; let release; const errors = [];
  const queue = new ConversionQueue(() => new Promise(resolve => { release = resolve; }), () => {}, error => errors.push(error.message), 2);
  queue.push(1); queue.push(2); queue.push(3); queue.push(4);
  assert.equal(errors.length, 1); assert.equal(queue.closed, true); assert.equal(queue.pending.length, 0); release(1); await turn();
});
