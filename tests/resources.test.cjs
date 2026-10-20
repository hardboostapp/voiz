const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const {Resources,validateManifest}=require('../app/resources.cjs');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function fixture(t,extra=false){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'voiz-resources-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const source=path.join(root,'source'),destination=path.join(root,'installation'),weight='new model fixture';fs.mkdirSync(path.join(source,'engine/model_dir/6'),{recursive:true});fs.mkdirSync(destination);
  const values={'engine/model_dir/6/voice.onnx':weight,'engine/model_dir/6/params.json':'{"is_onnx":true,"model_file":"voice.onnx"}'};
  for(const [name,data]of Object.entries(values))fs.writeFileSync(path.join(source,name),data);
  if(extra){fs.mkdirSync(path.join(source,'data'),{recursive:true});fs.writeFileSync(path.join(source,'data/unexpected.txt'),'blocked');}
  const zip=path.join(root,'fixture.zip');execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.resolve(__dirname,'../setup/Pack-Resources.ps1'),'-Source',source,'-Output',zip],{windowsHide:true});
  const bytes=fs.readFileSync(zip),entry={id:'voice-lula',name:'Lula',url:'https://github.com/hardboostapp/voiz/releases/download/fixture/lula.zip',bytes:bytes.length,sha256:hash(bytes),files:Object.entries(values).map(([name,data])=>({path:name,bytes:Buffer.byteLength(data),sha256:hash(data),...(name.endsWith('.json')?{inline:data}:{})}))};
  return {root,destination,bytes,entry,manifest:{schema:1,revision:1,packages:[entry]}};
}
test('resource catalog rejects outside origins, data paths, duplicate files and false inline hashes',()=>{
  const entry={id:'voice',name:'Voice',url:'https://github.com/hardboostapp/voiz/releases/download/v1/a.zip',sha256:'a'.repeat(64),bytes:1,files:[{path:'engine/model_dir/6/a.onnx',sha256:'b'.repeat(64),bytes:1}]};
  for(const change of [{url:'https://example.com/a.zip'},{files:[{...entry.files[0],path:'data/sounds/mine.wav'}]},{files:[entry.files[0],entry.files[0]]},{files:[{...entry.files[0],inline:'x'}]}])assert.throws(()=>validateManifest({schema:1,packages:[{...entry,...change}]}));
});
test('a ready voice installs without export and preserves sounds, hard-link sources, and custom files',async t=>{
  const f=fixture(t);const original=path.join(f.root,'original.onnx');fs.writeFileSync(original,'old source');fs.mkdirSync(path.join(f.destination,'engine/model_dir/6'),{recursive:true});fs.linkSync(original,path.join(f.destination,'engine/model_dir/6/voice.onnx'));
  fs.mkdirSync(path.join(f.destination,'data/sounds'),{recursive:true});fs.writeFileSync(path.join(f.destination,'data/sounds/own.wav'),'my sound');fs.writeFileSync(path.join(f.destination,'engine/model_dir/6/custom.onnx'),'custom');
  const oldFetch=global.fetch;t.after(()=>global.fetch=oldFetch);let downloads=0;global.fetch=async()=>{downloads++;return new Response(f.bytes);};
  const manager=new Resources(f.destination,()=>{},f.manifest);await manager.sync();assert.equal(manager.status.state,'ready');assert.equal(downloads,1);
  assert.equal(fs.readFileSync(original,'utf8'),'old source');assert.equal(fs.readFileSync(path.join(f.destination,'data/sounds/own.wav'),'utf8'),'my sound');assert.equal(fs.readFileSync(path.join(f.destination,'engine/model_dir/6/custom.onnx'),'utf8'),'custom');
  await manager.sync();assert.equal(downloads,1);
  const updated=structuredClone(f.manifest),file=updated.packages[0].files.find(x=>x.inline);file.inline+=' ';file.bytes++;file.sha256=hash(file.inline);updated.packages[0].sha256='c'.repeat(64);
  await new Resources(f.destination,()=>{},updated).sync();assert.equal(downloads,1,'verified weights must not download again for an inline configuration change');
});
test('a changed download cannot replace an existing model',async t=>{
  const f=fixture(t);fs.mkdirSync(path.join(f.destination,'engine/model_dir/6'),{recursive:true});const target=path.join(f.destination,'engine/model_dir/6/voice.onnx');fs.writeFileSync(target,'preserve');
  const oldFetch=global.fetch;t.after(()=>global.fetch=oldFetch);global.fetch=async()=>new Response(Buffer.alloc(f.bytes.length));
  await assert.rejects(new Resources(f.destination,()=>{},f.manifest).sync(),/alterado/);assert.equal(fs.readFileSync(target,'utf8'),'preserve');
});

test('legacy shared module junctions migrate without changing or removing the source',async t=>{
  const f=fixture(t),legacy=path.join(f.root,'VCClient-Gratuito/dist/modules');fs.mkdirSync(legacy,{recursive:true});fs.writeFileSync(path.join(legacy,'feature.bin'),'original');
  fs.mkdirSync(path.join(f.destination,'engine'),{recursive:true});fs.symlinkSync(legacy,path.join(f.destination,'engine/modules'),'junction');
  const entry={id:'modules',name:'Modules',url:'https://github.com/hardboostapp/voiz/releases/download/test/modules.zip',bytes:1,sha256:'a'.repeat(64),files:[{path:'engine/modules/feature.bin',bytes:8,sha256:hash('original'),inline:'original'}]};
  await new Resources(f.destination,()=>{},{schema:1,packages:[entry]}).sync();assert.equal(fs.lstatSync(path.join(f.destination,'engine/modules')).isSymbolicLink(),false);
  const backupRoot=path.join(f.destination,'updates/resources-links-previous'),backup=path.join(backupRoot,fs.readdirSync(backupRoot)[0],'modules');assert.equal(fs.lstatSync(backup).isSymbolicLink(),true);
  const changed=structuredClone(entry);changed.sha256='b'.repeat(64);changed.files[0]={...changed.files[0],inline:'new',bytes:3,sha256:hash('new')};
  await new Resources(f.destination,()=>{},{schema:1,packages:[changed]}).sync();assert.equal(fs.readFileSync(path.join(legacy,'feature.bin'),'utf8'),'original');assert.equal(fs.readFileSync(path.join(f.destination,'engine/modules/feature.bin'),'utf8'),'new');
});
test('even a matching archive hash cannot install files outside its reviewed manifest',async t=>{
  const f=fixture(t,true),oldFetch=global.fetch;t.after(()=>global.fetch=oldFetch);global.fetch=async()=>new Response(f.bytes);
  await assert.rejects(new Resources(f.destination,()=>{},f.manifest).sync());assert.equal(fs.existsSync(path.join(f.destination,'data/unexpected.txt')),false);assert.equal(fs.existsSync(path.join(f.destination,'engine/model_dir/6/voice.onnx')),false);
});
