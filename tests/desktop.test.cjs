const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createStartup } = require('../app/startup.cjs');
const { createTray, closeToTray } = require('../app/tray.cjs');

test('closing hides the window while explicit exit allows it to close', () => {
  const window = new EventEmitter(); let hidden=0, prevented=0, exit=false; window.hide=()=>hidden++;
  closeToTray(window,()=>exit);
  window.emit('close',{preventDefault:()=>prevented++});
  assert.equal(hidden,1);assert.equal(prevented,1);
  exit=true;window.emit('close',{preventDefault:()=>prevented++});
  assert.equal(hidden,1);assert.equal(prevented,1);
});
test('tray offers opening, emergency stop, and actual exit', () => {
  class Tray extends EventEmitter {setToolTip(value){this.tip=value;}setContextMenu(menu){this.menu=menu;}}
  const calls=[];const tray=createTray({Tray,Menu:{buildFromTemplate:items=>items}},'icon.ico',{show:()=>calls.push('show'),stop:()=>calls.push('stop'),quit:()=>calls.push('quit')});
  tray.emit('click');tray.menu.find(m=>m.id==='stop').click();tray.menu.find(m=>m.id==='quit').click();
  assert.deepEqual(calls,['show','stop','quit']);assert.equal(tray.menu.find(m=>m.id==='open').label,'Abrir Voiz');
});
test('startup registration names only Voiz and lets Electron quote the app path', {skip:process.platform!=='win32'}, () => {
  let saved;const app={setLoginItemSettings:settings=>{saved=settings;},getLoginItemSettings:options=>({openAtLogin:false,launchItems:saved?.openAtLogin&&options.path===`"${saved.path}"`?[{name:'Voiz',scope:'user',enabled:saved.enabled,args:[saved.args[0]]}]:[]})};
  const startup=createStartup(app,'C:/shared/electron.exe','C:/my apps/Voiz/app');
  assert.equal(startup.set(true).enabled,true);assert.equal(saved.name,'Voiz');assert.equal(saved.args[0],require('node:path').resolve('C:/my apps/Voiz/app'));assert.equal(saved.args[1],'--voiz-background');
  assert.equal(startup.set(false).enabled,false);assert.throws(()=>startup.set('true'));
});
test('startup status excludes another app on the shared runtime and respects Windows disabling Voiz', {skip:process.platform!=='win32'},()=>{
  let items=[{name:'Bubble',scope:'user',enabled:true,args:['C:/Bubble/app']}];
  const app={getLoginItemSettings:()=>({openAtLogin:true,launchItems:items})};
  const startup=createStartup(app,'C:/shared/electron.exe','C:/Voiz/app');
  assert.equal(startup.snapshot().registered,false);
  items=[{name:'Voiz',scope:'user',enabled:false,args:[require('node:path').resolve('C:/Voiz/app')]}];
  assert.deepEqual(startup.snapshot(),{enabled:false,registered:true,supported:true});
});
test('UI test startup operations never change Windows settings', () => {
  const startup=createStartup({setLoginItemSettings:()=>{throw Error('must not run');}},'unused','unused',true);
  assert.equal(startup.set(true).enabled,true);assert.equal(startup.set(false).enabled,false);
});
