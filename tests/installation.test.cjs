const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {engineExecutable,driverExecutable}=require('../app/installation.cjs');
test('standalone dependencies take priority; existing shared installation is preserved',t=>{
 const parent=fs.mkdtempSync(path.join(os.tmpdir(),'voiz-paths-')),root=path.join(parent,'Voiz');t.after(()=>fs.rmSync(parent,{recursive:true,force:true}));
 for(const file of ['VCClient-Gratuito/dist/main.exe','VCClient-Gratuito/VB-CABLE/VBCABLE_Setup_x64.exe']){const target=path.join(parent,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,'fixture');}
 assert.equal(engineExecutable(root),path.join(parent,'VCClient-Gratuito/dist/main.exe'));assert.equal(driverExecutable(root),path.join(parent,'VCClient-Gratuito/VB-CABLE/VBCABLE_Setup_x64.exe'));
 for(const file of ['engine/main.exe','drivers/VBCABLE_Setup_x64.exe']){const target=path.join(root,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,'own');}
 assert.equal(engineExecutable(root),path.join(root,'engine/main.exe'));assert.equal(driverExecutable(root),path.join(root,'drivers/VBCABLE_Setup_x64.exe'));
});
test('preparation rejects changed downloads and reuses already verified files without a new download',async t=>{
 const {download}=require('../setup/prepare.cjs'),crypto=require('node:crypto');
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'voiz-download-')),previous=global.fetch; t.after(()=>{global.fetch=previous;fs.rmSync(folder,{recursive:true,force:true});});
 const bytes=Buffer.from('verified voice dependency'),entry={url:'https://example.invalid/fixture.zip',sha256:crypto.createHash('sha256').update(bytes).digest('hex')};let calls=0;
 global.fetch=async()=>{calls++;return new Response('changed bytes');};
 await assert.rejects(download(entry,'fixture.zip',folder),/integridade/);assert.equal(fs.existsSync(path.join(folder,'fixture.zip')),false);
 global.fetch=async()=>{calls++;return new Response(bytes);};
 const file=await download(entry,'fixture.zip',folder);assert.deepEqual(fs.readFileSync(file),bytes);await download(entry,'fixture.zip',folder);assert.equal(calls,2);
});
test('public preparation downloads pinned origins and starts without physical audio devices',()=>{
 const manifest=require('../setup/downloads.json'),config=require('../setup/configuration.json');
 for(const entry of [manifest.electron,manifest.engine,...manifest.voices]){assert.equal(new URL(entry.url).protocol,'https:');assert.match(entry.sha256,/^[a-f0-9]{64}$/);assert.ok(!entry.url.includes('/resolve/main/'));}
 assert.equal(config.voice_changer_input_mode,'client');assert.equal(config.recording_started,false);assert.equal(config.audio_input_device_index,-1);assert.equal(config.audio_output_device_index,-1);assert.equal(config.audio_monitor_device_index,-1);
 assert.deepEqual(manifest.voices.map(v=>v.id),['lula','bolsonaro','mano-brown']);
});
