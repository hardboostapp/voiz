const { test } = require('node:test'); const assert = require('node:assert/strict'); const vm = require('node:vm'); const fs = require('node:fs'); const path = require('node:path');
function processor() { let Constructor; const context = { Float32Array, AudioWorkletProcessor: class { constructor() { this.port = { postMessage: data => this.sent.push(data) }; this.sent = []; } }, registerProcessor: (_name, ctor) => { Constructor = ctor; } }; vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app/audio-worklet.js'), 'utf8'), context); return new Constructor({ processorOptions: { chunkSamples: 19200 } }); }
test('capture emits complete 400 ms blocks and never leaks dry microphone', () => {
  const p = processor(); for (let i = 0; i < 150; i++) { const output = new Float32Array(128); p.process([[new Float32Array(128).fill(.25)]], [[output]]); assert.ok(output.every(v => v === 0)); }
  assert.equal(p.sent.length, 1); assert.equal(p.sent[0].samples.length, 19200); assert.ok(p.sent[0].samples.every(v => v === .25)); assert.ok(p.sent[0].inputDb < -12 && p.sent[0].inputDb > -13);
});
test('100 ms playback reserve absorbs 80 ms of jitter without gaps or losing samples', () => {
  const p = processor(), output = [];
  for (let frame = 0; frame < 62464; frame += 128) {
    if ([0, 23040, 38400].includes(frame)) p.port.onmessage({ data: { samples: new Float32Array(19200).fill(.5) } });
    const block = new Float32Array(128); p.process([], [[block]]); output.push(...block);
  }
  assert.ok(output.slice(0, 4800).every(v => v === 0)); assert.ok(output.slice(4864, 62400).every(v => v === .5)); assert.equal(p.underruns, 1); assert.equal(p.queued, 0);
  // The one underrun is after all three full blocks finished, not within speech.
  assert.equal(output.filter(v=>v===.5).length,57600-62); // 63-sample fade-in, plus first fade-out sample.
});
test('slow conversions increase reserve to 200 ms without dropping queued speech; reset restores 100 ms',()=>{
  const p=processor();
  for(let cycle=0;cycle<4;cycle++){
    p.port.onmessage({data:{samples:new Float32Array(19200).fill(.5)}});
    let played=0;
    for(let i=0;i<350;i++){const block=new Float32Array(128);p.process([],[[block]]);played+=block.filter(v=>v===.5).length;}
    assert.equal(played,19200-62);assert.equal(p.queued,0);
  }
  assert.equal(p.reserveSamples,9600);assert.equal(p.underruns,4);
  p.port.onmessage({data:{reset:true}});assert.equal(p.reserveSamples,4800);assert.equal(p.underruns,0);
});
test('stop clears queued speech; prolonged output overload reports an error', () => {
  const p = processor(); for (let i = 0; i < 20; i++) p.port.onmessage({ data: { samples: new Float32Array(19200).fill(.5) } });
  assert.ok(p.queued <= 96000); assert.equal(p.sent.filter(s => s.error).length, 1);
  p.port.onmessage({ data: { reset: true } }); const output = new Float32Array(128); p.process([], [[output]]); assert.ok(output.every(v => v === 0)); assert.equal(p.queued, 0); assert.equal(p.fault, false);
});
