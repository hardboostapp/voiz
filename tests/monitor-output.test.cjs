const {test}=require('node:test'),assert=require('node:assert/strict');
test('Windows output resolves by group without using the communications default or a virtual return',async()=>{
  const {windowsMonitor}=await import('../app/monitor-output.mjs');
  const list=[{kind:'audiooutput',deviceId:'default',groupId:'usb',label:'Padrão - Fones USB'},{kind:'audiooutput',deviceId:'communications',groupId:'cable',label:'CABLE Input'},{kind:'audiooutput',deviceId:'usb-output',groupId:'usb',label:'Fones USB'},{kind:'audiooutput',deviceId:'cable-output',groupId:'cable',label:'CABLE Input (VB-Audio Virtual Cable)'}];
  assert.deepEqual(windowsMonitor(list),{deviceId:'usb-output',blocked:false});
  list[0]={...list[0],groupId:'cable',label:'Padrão - CABLE Input (VB-Audio Virtual Cable)'};
  assert.deepEqual(windowsMonitor(list),{deviceId:'cable-output',blocked:true});
  assert.deepEqual(windowsMonitor([]),{deviceId:'',blocked:false});
});
test('Windows return uses native default sink and follows endpoint changes without stopping the call',async t=>{
  const {AudioMixer}=await import('../app/audio.js');const created=[];
  class Context {
    constructor(options){this.sinkId=options.sinkId;this.state='suspended';this.destination={};created.push(this);}
    node(){return {gain:{},threshold:{},knee:{},ratio:{},attack:{},release:{},connect(){}};}
    createGain(){return this.node();} createDynamicsCompressor(){return this.node();}
    async resume(){this.state='running';} async close(){this.state='closed';} addEventListener(){}
  }
  const before=globalThis.AudioContext;globalThis.AudioContext=Context;t.after(()=>{if(before)globalThis.AudioContext=before;else delete globalThis.AudioContext;});
  const mixer=new AudioMixer({},()=>{});mixer.outputId='call';mixer.active=true;
  await mixer.setMonitor({enabled:true,outputId:'default',resolvedOutputId:'usb'});
  assert.equal(created[0].sinkId,'');assert.equal(mixer.active,true);
  await mixer.setMonitor({enabled:true,outputId:'default',resolvedOutputId:'bluetooth'});
  assert.equal(created[0].state,'closed');assert.equal(created[1].sinkId,'');assert.equal(mixer.active,true);
  await mixer.setMonitor({enabled:true,outputId:'default',resolvedOutputId:'call'});
  assert.equal(mixer.monitorContext,null);assert.equal(created.length,2);assert.equal(mixer.active,true);
  await mixer.setMonitor({enabled:false,outputId:'default',resolvedOutputId:'usb'});
  assert.equal(mixer.monitorContext,null);assert.equal(mixer.active,true);
});
