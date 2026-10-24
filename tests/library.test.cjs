const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Library } = require('../app/library.cjs');
function fixture(t) { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'voiz-test-')); t.after(() => fs.rmSync(root, { recursive: true, force: true })); return { root, library: new Library(path.join(root, 'data')) }; }

test('sound return defaults on, preserves selected headphones, and rejects nonboolean switches', t => {
  const { root, library } = fixture(t);
  assert.equal(library.state.monitorEnabled, true);
  library.settings({ monitorName: 'Fones USB', monitorEnabled: false });
  library.settings({ monitorEnabled: 'true' });
  const restored = new Library(path.join(root, 'data')).state;
  assert.equal(restored.monitorEnabled, false); assert.equal(restored.monitorName, 'Fones USB');
  assert.equal(restored.voiceMonitorEnabled,false);
  library.settings({voiceMonitorEnabled:true}); assert.equal(new Library(path.join(root,'data')).state.voiceMonitorEnabled,true);
});

test('Windows monitor choice survives restart and legacy selected headphones remain selected', t => {
  const {root,library}=fixture(t);
  assert.equal(library.state.monitorMode,'windows');
  library.settings({monitorMode:'device',monitorName:'Fones USB'});
  const legacy={...library.state};delete legacy.monitorMode;fs.writeFileSync(library.file,JSON.stringify(legacy));
  const migrated=new Library(path.join(root,'data'));assert.equal(migrated.state.monitorMode,'device');assert.equal(migrated.state.monitorName,'Fones USB');
  migrated.settings({monitorMode:'windows',monitorName:''});
  const reopened=new Library(path.join(root,'data'));assert.equal(reopened.state.monitorMode,'windows');assert.equal(reopened.state.monitorName,'');
  reopened.settings({monitorMode:'invalid'});assert.equal(reopened.state.monitorMode,'windows');
  reopened.settings({monitorName:'Fone manual'});assert.equal(reopened.state.monitorMode,'device');
});
test('private sound preview persists independently of local return and rejects invalid switches',t=>{
  const {root,library}=fixture(t);assert.equal(library.state.soundSendEnabled,true);
  library.settings({soundSendEnabled:false,monitorEnabled:true});library.settings({soundSendEnabled:'true'});
  const reopened=new Library(path.join(root,'data'));assert.equal(reopened.state.soundSendEnabled,false);assert.equal(reopened.state.monitorEnabled,true);
  reopened.settings({soundSendEnabled:true,monitorEnabled:false});const saved=new Library(path.join(root,'data'));assert.equal(saved.state.soundSendEnabled,true);assert.equal(saved.state.monitorEnabled,false);
});

test('voice tuning persists separately per person and cannot exceed valid ranges', t => {
  const { root, library } = fixture(t);
  library.settings({ voiceTuning: { lula: { pitchShift: -3, inputGain: 1.4 }, bolsonaro: { pitchShift: 999, indexRatio: 8, inputGain: -20 } } });
  const loaded = new Library(path.join(root, 'data')).state.voiceTuning;
  assert.deepEqual(loaded.lula, { pitchShift: -3, indexRatio: .15, inputGain: 1.4 });
  assert.deepEqual(loaded.bolsonaro, { pitchShift: 12, indexRatio: .85, inputGain: .5 });
  assert.deepEqual(loaded['mano-brown'], { pitchShift: 0, indexRatio: .15, inputGain: 1 });
  assert.deepEqual(loaded.feminina, { pitchShift: 8, indexRatio: .15, inputGain: 1 });
});

test('clarity migration backs up earlier defaults once and preserves custom pitch, gain and index', t => {
  const { root, library } = fixture(t);
  const original = { ...library.state, voiceTuningRevision: undefined, voice: 'lula', voiceTuning: {
    lula: { pitchShift: -3, indexRatio: .65, inputGain: 1.4 },
    bolsonaro: { pitchShift: 1, indexRatio: .4, inputGain: 1 },
    feminina: { pitchShift: 8, indexRatio: .55, inputGain: 1 }
  } };
  fs.writeFileSync(library.file, JSON.stringify(original));
  const migrated = new Library(path.join(root, 'data'));
  assert.equal(migrated.state.voiceTuning.lula.indexRatio, .15);
  assert.equal(migrated.state.voiceTuning.lula.pitchShift, -3); assert.equal(migrated.state.voiceTuning.lula.inputGain, 1.4);
  assert.equal(migrated.state.voiceTuning.bolsonaro.indexRatio, .4); assert.equal(migrated.state.voiceTuning.feminina.pitchShift, 8);
  const backup = fs.readFileSync(`${library.file}.before-clarity-v1`, 'utf8'); assert.deepEqual(JSON.parse(backup), JSON.parse(JSON.stringify(original)));
  migrated.settings({ voiceTuning: { lula: { indexRatio: .65 }, feminina: { indexRatio: 0 } } });
  const reopened = new Library(path.join(root, 'data'));
  assert.equal(reopened.state.voiceTuning.lula.indexRatio, .65); assert.equal(reopened.state.voiceTuning.feminina.indexRatio, 0);
  assert.equal(fs.readFileSync(`${library.file}.before-clarity-v1`, 'utf8'), backup);
});
test('import copies audio; metadata survives restart; delete preserves source', t => {
  const { root, library } = fixture(t); const source = path.join(root, 'efeito.wav'); fs.writeFileSync(source, Buffer.alloc(48, 1));
  const result = library.import([source]); assert.equal(result.imported.length, 1); const id = result.imported[0];
  library.updateSound(id, { name: 'Risada', category: 'Memes', favorite: true, volume: .5, shortcut: 'Ctrl+F8' });
  const reopened = new Library(path.join(root, 'data')); assert.equal(reopened.find(id).name, 'Risada'); assert.equal(reopened.find(id).volume, .5);
  reopened.remove(id); assert.equal(fs.existsSync(source), true); assert.equal(reopened.state.sounds.length, 0);
});
test('unsupported files, empty files and unknown ids are rejected', t => {
  const { root, library } = fixture(t); const file = path.join(root, 'bad.txt'); fs.writeFileSync(file, 'hello');
  const empty = path.join(root, 'empty.mp3'); fs.writeFileSync(empty, '');
  assert.equal(library.import([file, empty]).errors.length, 2); assert.throws(() => library.audioPath('../../secret')); assert.equal(library.state.sounds.length, 0);
});
test('duplicate shortcuts cannot replace an existing binding', t => {
  const { root, library } = fixture(t); const source = path.join(root, 'x.wav'); fs.writeFileSync(source, 'audio');
  const { imported: [a, b] } = library.import([source, source]); library.updateSound(a, { shortcut: 'Ctrl+F8' });
  assert.throws(() => library.updateSound(b, { shortcut: 'Ctrl+F8' }), /uso/); assert.equal(library.find(b).shortcut, '');
  assert.throws(() => library.updateSound(b, { shortcut: library.state.stopShortcut }), /uso/);
});
test('broken library is preserved before recovery and volumes are clamped', t => {
  const { root } = fixture(t); const data = path.join(root, 'data'); fs.writeFileSync(path.join(data, 'library.json'), '{broken'); const recovered = new Library(data);
  assert.equal(recovered.snapshot().recovered, true); assert.ok(fs.readdirSync(data).some(f => f.includes('recovery'))); recovered.settings({ masterVolume: 8 }); assert.equal(recovered.state.masterVolume, 1);
});
