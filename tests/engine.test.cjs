const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Engine } = require('../app/engine.cjs');
const { voiceCatalog } = require('../app/voices.cjs');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'voiz-engine-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const slot of [6, 8, 10]) {
    const dir = path.join(root, 'engine/model_dir', String(slot)); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'params.json'), JSON.stringify({ is_onnx: true, model_file: 'voice.onnx' }));
    fs.writeFileSync(path.join(dir, 'voice.onnx'), 'fixture');
  }
  return root;
}
class SimulatedEngine extends Engine {
  constructor(root) { super(root); this.slots = []; this.flushes = 0; this.params = {}; this.restarts = 0; }
  async start() {}
  async restart(epoch) { this.assertCurrent(epoch); this.loaded = null; this.restarts++; }
  async json(route, options) {
    if (options?.method === 'PUT') {
      if (route.endsWith('/configuration')) { this.slot = JSON.parse(options.body).current_slot_index; this.slots.push(this.slot); }
      else this.params[route.split('/').at(-1)] = JSON.parse(options.body);
      return {};
    }
    if (route.endsWith('/information')) {
      // Model switches rebuild the pipeline; tuning the same slot does not.
      if (!this.loaded || this.loaded.slot !== this.slot) this.loaded = { slot: this.slot, params: { ...this.params[this.slot] } };
      return { local_voice_changer_interface_active: false, voice_changer_information: { slot_index: this.slot, chunk_sec: .4, pipeline_info: { slot_info: this.loaded.params } } };
    }
    return {};
  }
  async _convert(samples) { this.flushes++; return { samples, ms: 1 }; }
}
test('rapid model changes stay serialized and stale voice packets are rejected', async t => {
  const engine = new SimulatedEngine(fixture(t));
  await Promise.all([engine.prepare('lula'), engine.prepare('bolsonaro'), engine.prepare('mano-brown')]);
  assert.deepEqual(engine.slots, [6, 8, 10]); assert.equal(engine.voiceId, 'mano-brown');
  await assert.rejects(engine.convert(new Float32Array(9600), 'bolsonaro'), /voz mudou/);
  assert.equal((await engine.convert(new Float32Array(9600), 'mano-brown')).samples.length, 9600);
  const before = engine.flushes; await engine.prepare('mano-brown');
  assert.equal(engine.flushes - before, 6, 'reactivation clears earlier speech');
});

test('changed tuning reloads a cached pipeline and unchanged tuning does not restart it', async t => {
  const engine = new SimulatedEngine(fixture(t));
  await engine.prepare('lula', { pitchShift: 0, indexRatio: .65 });
  assert.equal(engine.restarts, 0);
  await engine.prepare('lula', { pitchShift: -2, indexRatio: .3 });
  assert.equal(engine.restarts, 1); assert.equal(engine.loaded.params.pitch_shift, -2); assert.equal(engine.loaded.params.index_ratio, .3);
  const before = engine.flushes;
  await engine.prepare('lula', { pitchShift: -2, indexRatio: .3 });
  assert.equal(engine.restarts, 1); assert.equal(engine.flushes - before, 0, 'an unused prepared model is clean');
  await engine.convert(new Float32Array(19200), 'lula');
  const used = engine.flushes; await engine.prepare('lula', { pitchShift: -2, indexRatio: .3 });
  assert.equal(engine.flushes - used, 6, 'earlier speech must be flushed');
});

test('activation reuses preparation in flight and a clean warmed model', async t => {
  const engine = new SimulatedEngine(fixture(t)); let release, starts = 0;
  engine.start = () => { starts++; return new Promise(resolve => { release = resolve; }); };
  const warm = engine.warm('lula');
  const activate = engine.prepare('lula'); assert.equal(warm, activate);
  while (!release) await new Promise(resolve => setImmediate(resolve)); release(); await Promise.all([warm, activate]);
  assert.equal(starts, 1); const conversions = engine.flushes;
  await engine.warm('lula'); assert.equal(engine.flushes, conversions);
  engine.start = async () => { starts++; }; await engine.prepare('lula');
  assert.equal(engine.flushes, conversions, 'activation must not convert silent blocks again');
});

test('a pipeline that ignores tuning after reload cannot report ready or accept speech', async t => {
  const engine = new SimulatedEngine(fixture(t)); await engine.prepare('lula');
  engine.restart = async () => { engine.restarts++; };
  await assert.rejects(engine.prepare('lula', { pitchShift: 4 }), /não aplicou/);
  assert.equal(engine.restarts, 1); assert.equal(engine.ready, false);
  await assert.rejects(engine.convert(new Float32Array(19200), 'lula'), /Prepare o motor/);
});
test('stop during preparation cannot announce readiness or switch a queued model', async t => {
  const engine = new SimulatedEngine(fixture(t)); let release;
  engine.start = () => new Promise(resolve => { release = resolve; });
  const first = engine.prepare('lula'), queued = engine.prepare('bolsonaro');
  const all = Promise.allSettled([first, queued]);
  while (!release) await new Promise(resolve => setImmediate(resolve));
  engine.stop(); release();
  assert.ok((await all).every(r => r.status === 'rejected'));
  assert.equal(engine.ready, false); assert.deepEqual(engine.slots, []);
});
test('missing models remain unavailable and do not replace a ready voice', async t => {
  const root = fixture(t), engine = new SimulatedEngine(root); await engine.prepare('lula');
  fs.unlinkSync(path.join(root, 'engine/model_dir/8/voice.onnx'));
  assert.equal(voiceCatalog(root).find(v => v.id === 'bolsonaro').available, false);
  await assert.rejects(engine.prepare('bolsonaro'), /não está instalado/);
  assert.equal(engine.voiceId, 'lula'); assert.equal(engine.ready, true);
});
