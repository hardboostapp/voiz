// Builds only the fixed public runtime/model allowlist; no library, sounds, or voice references.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const {engineExecutable}=require('../app/installation.cjs'),{voiceById}=require('../app/voices.cjs'),{sha256,validateManifest}=require('../app/resources.cjs');
const root=path.resolve(__dirname,'..'),source=process.env.VOIZ_RESOURCE_SOURCE||root,tag=process.env.VOIZ_RESOURCE_TAG||'resources-2026-10-20-r1';
const output=path.join(root,'release/resource-packs'),staging=path.join(root,'.resource-build');
function copyTree(from,to,items){for(const entry of fs.readdirSync(from,{withFileTypes:true})){const file=path.join(from,entry.name),destination=path.join(to,entry.name);if(entry.isSymbolicLink())throw Error('Resource source contains links');if(entry.isDirectory())copyTree(file,destination,items);else{fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(file,destination);items.push(destination);}}}
(async()=>{
  fs.mkdirSync(output,{recursive:true});fs.mkdirSync(staging,{recursive:true});
  const packages=[];
  async function pack(id,name,prepare){
    const folder=fs.mkdtempSync(path.join(staging,id+'-'));
    const files=[];await prepare(folder,files);
    const manifestFiles=[];
    for(const file of files){const bytes=fs.statSync(file).size,relative=path.relative(folder,file).replaceAll('\\','/'),entry={path:relative,bytes,sha256:await sha256(file)};
      if((/\/(?:params\.json|FONTE\.txt)$/.test(relative)||relative.startsWith('engine/licenses/'))&&bytes<=16384)entry.inline=fs.readFileSync(file,'utf8');manifestFiles.push(entry);
    }
    manifestFiles.sort((a,b)=>a.path.localeCompare(b.path));
    const archive=path.join(output,id+'.zip');
    execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'setup/Pack-Resources.ps1'),'-Source',folder,'-Output',archive],{windowsHide:true,stdio:'inherit'});
    const entry={id,name,url:`https://github.com/hardboostapp/voiz/releases/download/${tag}/${id}.zip`,bytes:fs.statSync(archive).size,sha256:await sha256(archive),files:manifestFiles};packages.push(entry);console.log(JSON.stringify({id,bytes:entry.bytes,files:manifestFiles.length,sha256:entry.sha256}));
    if(!path.resolve(folder).startsWith(path.resolve(staging)+path.sep))throw Error('Unexpected resource staging folder');fs.rmSync(folder,{recursive:true,force:true});
  }
  await pack('engine','Motor de voz',async(folder,files)=>{
    const exe=path.join(folder,'engine/main.exe');fs.mkdirSync(path.dirname(exe),{recursive:true});fs.copyFileSync(engineExecutable(source),exe);files.push(exe);
    if(await sha256(exe)!==require('../app/engine-runtime.cjs').ENGINE_SHA256)throw Error('Engine origin hash mismatch');
    copyTree(path.join(source,'engine/web_front'),path.join(folder,'engine/web_front'),files);
    const license=await fetch('https://raw.githubusercontent.com/w-okada/voice-changer/master/LICENSE').then(r=>{if(!r.ok)throw Error('Missing engine license');return r.text();});
    const licenseFile=path.join(folder,'engine/licenses/VCClient-LICENSE.txt');fs.mkdirSync(path.dirname(licenseFile),{recursive:true});fs.writeFileSync(licenseFile,license);files.push(licenseFile);
  });
  await pack('modules','Bibliotecas de conversão',async(folder,files)=>copyTree(path.join(source,'engine/modules'),path.join(folder,'engine/modules'),files));
  const origins={lula:'Ivan198542 · CC BY-NC 4.0 · https://huggingface.co/Ivan198542/rvcmodels',bolsonaro:'LH6582 / Ivan198542 · CC BY-NC 4.0 na origem usada · https://huggingface.co/Ivan198542/rvcmodels','mano-brown':'vitor007009 · OpenRAIL declarada · https://huggingface.co/vitor007009/Mano_Brown',feminina:'Wismut · Apache-2.0 declarada · https://huggingface.co/Wismut/RVC_US_Female_1'};
  for(const id of ['lula','bolsonaro','mano-brown','feminina'])await pack('voice-'+id,voiceById(id).name,async(folder,files)=>{
    const voice=voiceById(id),slot=path.join(source,'engine/model_dir',String(voice.slot)),original=JSON.parse(fs.readFileSync(path.join(slot,'params.json'),'utf8'));
    const params={slot_index:voice.slot,voice_changer_type:'RVC',name:voice.name,description:'',credit:'',terms_of_use_url:'',icon_file:null,speakers:{},model_file:original.model_file,index_file:original.index_file,is_onnx:true,inferencer_type:original.inferencer_type,sample_rate:original.sample_rate,is_f0:original.is_f0,deprecated:false,embedder:original.embedder,pitch_estimator:'rmvpe_onnx',sample_id:null,version:original.version};
    const target=path.join(folder,'engine/model_dir',String(voice.slot));fs.mkdirSync(target,{recursive:true});
    for(const name of [params.model_file,params.index_file].filter(Boolean)){if(path.basename(name)!==name)throw Error('Invalid model name');const file=path.join(target,name);fs.copyFileSync(path.join(slot,name),file);files.push(file);}
    Object.assign(params,{name:voice.name,pitch_shift:id==='feminina'?8:0,index_ratio:.15,protect_ratio:.1,chunk_sec:.4,pitch_estimator:'rmvpe_onnx'});
    for(const [name,content]of Object.entries({'params.json':JSON.stringify(params,null,2)+'\n','FONTE.txt':origins[id]+'\nConversão local do PTH para ONNX pelo VCClient. Modelo de imitação por IA, sem vínculo oficial.\nLicenças e fontes: https://github.com/hardboostapp/voiz#modelos-e-atribuição\n'})){const file=path.join(target,name);fs.writeFileSync(file,content);files.push(file);}
  });
  await pack('virtual-cable','Cabo virtual VB-CABLE',async(folder,files)=>{
    const cable=process.env.VOIZ_CABLE_SOURCE||path.resolve(root,'../VCClient-Gratuito/VB-CABLE');copyTree(cable,path.join(folder,'drivers'),files);
    const notice=path.join(folder,'drivers/VB-CABLE-NOTICE.txt');fs.writeFileSync(notice,'VB-CABLE é um produto da VB-Audio (Vincent Burel).\nOrigem: https://vb-audio.com/Cable/ (www.vb-cable.com).\nÉ donationware: se você achar útil, pode apoiar o fabricante pelo site oficial. Todas as contribuições são bem-vindas.\nO pacote base está incluído sem modificar seus arquivos, conforme a permissão de integração publicada em https://vb-audio.com/Services/licensing.htm# (VB-CABLE Distribution with other product).\nO driver não é removido com o Voiz, pois pode ser usado por outros aplicativos.\n');files.push(notice);
  });
  packages.sort((a,b)=>(a.id==='virtual-cable'?-1:b.id==='virtual-cable'?1:0));
  const manifest=validateManifest({schema:1,revision:1,packages});fs.writeFileSync(path.join(root,'app/resources.json'),JSON.stringify(manifest,null,2)+'\n');fs.writeFileSync(path.join(output,'resources.json'),JSON.stringify(manifest,null,2));console.log('Resource manifest ready: '+packages.length+' packages');
})().catch(error=>{console.error(error);process.exitCode=1;});
