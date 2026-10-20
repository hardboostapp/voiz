const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),zlib=require('node:zlib');
const {entries,prepareRuntime}=require('../app/engine-runtime.cjs');
function archive(files){
  const header=Buffer.alloc(64),payload=[],table=[];let position=0;
  for(const [name,content]of Object.entries(files)){
    const raw=Buffer.from(content),packed=zlib.deflateSync(raw),row=Buffer.alloc(18+Buffer.byteLength(name)+1);
    row.writeUInt32BE(row.length,0);row.writeUInt32BE(position,4);row.writeUInt32BE(packed.length,8);row.writeUInt32BE(raw.length,12);row[16]=1;row[17]='x'.charCodeAt(0);row.write(name,18);table.push(row);payload.push(packed);position+=packed.length;
  }
  const toc=Buffer.concat(table),cookie=Buffer.alloc(88);Buffer.from([77,69,73,12,11,10,11,14]).copy(cookie);cookie.writeUInt32BE(position+toc.length+88,8);cookie.writeUInt32BE(position,12);cookie.writeUInt32BE(toc.length,16);cookie.writeUInt32BE(310,20);
  return Buffer.concat([header,...payload,toc,cookie]);
}
test('runtime is extracted once, keeps the original engine intact, and skips the demo window under Voiz',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'voiz-runtime-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const bytes=archive({'native_client/resources/app/main.js':'const { app, Menu, BrowserWindow, ipcMain } = require("electron");\napp.whenReady().then(() => new BrowserWindow());','python310.dll':'fixture'}),exe=path.join(root,'main.exe');fs.writeFileSync(exe,bytes);
  const sha=crypto.createHash('sha256').update(bytes).digest('hex');let messages=0;
  const prepared=prepareRuntime(exe,root,()=>messages++,sha),again=prepareRuntime(exe,root,()=>messages++,sha);
  assert.equal(messages,1);assert.equal(prepared.directory,again.directory);assert.equal(prepared.env.VOIZ_HEADLESS,'1');assert.equal(prepared.env._PYI_PARENT_PROCESS_LEVEL,'0');assert.deepEqual(fs.readFileSync(exe),bytes);
  const script=fs.readFileSync(path.join(prepared.directory,'native_client/resources/app/main.js'),'utf8');
  let ready,windows=0;
  new Function('require','process',script)(()=>({app:{whenReady:()=>({then:fn=>{ready=fn;}})},BrowserWindow:class{constructor(){windows++;}}}),{env:{VOIZ_HEADLESS:'1'}});ready();assert.equal(windows,0);
});
test('runtime rejects changed engines, corrupt archives, traversal, and duplicate Windows paths',()=>{
  assert.throws(()=>entries(Buffer.alloc(100)),/inválido/);
  assert.throws(()=>entries(archive({'../outside.dll':'bad'})),/Caminho/);
  assert.throws(()=>entries(archive({'A.dll':'a','a.dll':'b'})),/duplicados/);
});
