const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {pipeline}=require('node:stream/promises'),{Readable,Transform}=require('node:stream'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
const root=path.resolve(__dirname,'..'),manifest=require('./downloads.json');
const {Engine}=require('../app/engine.cjs'),{modelReady,voiceById}=require('../app/voices.cjs');
const {engineExecutable}=require('../app/installation.cjs');
const run=promisify(execFile),cache=path.join(__dirname,'downloads');
const digest=file=>new Promise((resolve,reject)=>{const hash=crypto.createHash('sha256'),stream=fs.createReadStream(file);stream.on('data',chunk=>hash.update(chunk));stream.on('end',()=>resolve(hash.digest('hex')));stream.on('error',reject);});
async function download(entry,name,folder=cache){
  fs.mkdirSync(folder,{recursive:true});const target=path.join(folder,name);
  if(fs.existsSync(target)&&await digest(target)===entry.sha256)return target;
  console.log('Baixando '+name+' da origem…');
  const response=await fetch(entry.url,{signal:AbortSignal.timeout(1800000)});if(!response.ok)throw Error('Falha ao baixar '+name+': HTTP '+response.status);
  let size=0;const hash=crypto.createHash('sha256');const guard=new Transform({transform(chunk,_encoding,callback){size+=chunk.length;if(size>2*1024**3)return callback(Error('Download excedeu o limite.'));hash.update(chunk);callback(null,chunk);}});
  await pipeline(Readable.fromWeb(response.body),guard,fs.createWriteStream(target+'.part'));
  if(hash.digest('hex')!==entry.sha256)throw Error('A integridade de '+name+' não confere. Tente novamente.');
  fs.renameSync(target+'.part',target);return target;
}
async function extract(archive,name){const dir=path.join(cache,name);await run('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'Expand-Zip.ps1'),'-Archive',archive,'-Destination',dir],{windowsHide:true,maxBuffer:1024**2});return dir;}
function files(dir,extension){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{if(entry.isSymbolicLink())throw Error('Vínculos não permitidos na preparação.');const file=path.join(dir,entry.name);return entry.isDirectory()?files(file,extension):entry.name.toLowerCase().endsWith(extension)?[file]:[];});}
async function post(engine,route,body){return engine.json(route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)},300000);}
async function prepare(){
  const target=path.join(root,'engine');fs.mkdirSync(target,{recursive:true});
  if(!fs.existsSync(engineExecutable(root))){
    const dir=await extract(await download(manifest.engine,'vcclient.zip'),'vcclient');
    const executables=files(dir,'main.exe');if(executables.length!==1)throw Error('O pacote do motor não contém um executável único.');
    const source=path.dirname(executables[0]);
    fs.copyFileSync(executables[0],path.join(target,'main.exe'));
    const web=path.join(source,'web_front');if(fs.existsSync(web))fs.cpSync(web,path.join(target,'web_front'),{recursive:true});
  }
  for(const dir of ['settings','upload_dir','model_dir','static_model_dir','tmp_dir','modules'])fs.mkdirSync(path.join(target,dir),{recursive:true});
  const configuration=path.join(target,'settings/vc_conf.json');
  if(!fs.existsSync(configuration))fs.copyFileSync(path.join(__dirname,'configuration.json'),configuration);
  const config=JSON.parse(fs.readFileSync(configuration,'utf8'));
  if(config.voice_changer_input_mode!=='client'||config.recording_started||config.audio_input_device_index!==-1||config.audio_output_device_index!==-1)throw Error('O motor precisa estar parado e no modo client antes da preparação.');
  const pending=[];
  for(const voice of manifest.voices){
    if(modelReady(root,voiceById(voice.id))){console.log(voice.name+' já está preparado.');continue;}
    const dir=await extract(await download(voice,voice.id+'.zip'),voice.id);
    const models=files(dir,'.pth'),indexes=files(dir,'.index');if(models.length!==1)throw Error('Modelo PTH inválido para '+voice.name);
    for(const file of [models[0],...indexes])fs.copyFileSync(file,path.join(target,'upload_dir',path.basename(file)));
    pending.push({...voice,model:path.basename(models[0]),index:indexes[0]?path.basename(indexes[0]):null});
  }
  const engine=new Engine(root,event=>console.log(event.message));
  try{
    if(pending.length){console.log('Iniciando o motor local e seus módulos…');await engine.start(engine.epoch);}
    for(const voice of pending){
      console.log('Convertendo '+voice.name+' para ONNX…');
      const params=path.join(target,'model_dir',String(voice.sourceSlot),'params.json');
      if(!fs.existsSync(params))await post(engine,'/api/slot-manager/slots',{voice_changer_type:'RVC',slot_index:voice.sourceSlot,name:voice.name,model_file:voice.model,index_file:voice.index,embedder:'hubert_base_l12'});
      else if(JSON.parse(fs.readFileSync(params,'utf8')).model_file!==voice.model)throw Error('O slot de importação de '+voice.name+' está ocupado. Os modelos existentes foram preservados.');
      await post(engine,'/api/slot-manager/slots/operation/export_onnx',{slot_index:voice.sourceSlot});
      await post(engine,'/api/slot-manager/slots/operation/move_exported_onnx_model',{dst:voice.slot});
      if(!modelReady(root,voiceById(voice.id)))throw Error('O modelo convertido de '+voice.name+' não foi encontrado.');
      fs.writeFileSync(path.join(target,'model_dir',String(voice.slot),'FONTE.txt'),voice.credit+'\n'+voice.source+'\nModelo de imitação por IA, sem vínculo oficial.\n');
    }
  }finally{await engine.stop();}
  // Delete only the disposable download directory belonging to this installation.
  if(fs.existsSync(cache)){
    const resolved=fs.realpathSync(cache),expected=path.resolve(__dirname,'downloads');
    if(resolved.toLowerCase()!==expected.toLowerCase()||fs.lstatSync(cache).isSymbolicLink())throw Error('Pasta de downloads inesperada; arquivos foram mantidos.');
    fs.rmSync(resolved,{recursive:true,force:true});
  }
  console.log('Vozes preparadas. Abra o Voiz e escolha seu microfone e sua saída.');
}
if(require.main===module)prepare().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={download,prepare};
