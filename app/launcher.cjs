const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const manifest=require('./launcher.json');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function prepareLauncher(root,runtime){
  const bytes=Buffer.from(manifest.content,'base64');
  if(manifest.schema!==1||manifest.filename!=='Voiz.exe'||bytes.length!==manifest.bytes||hash(bytes)!==manifest.sha256||bytes.toString('ascii',0,2)!=='MZ')throw Error('Iniciador do Voiz invalido.');
  const executable=path.join(root,'Voiz.exe'),settings=path.join(root,'settings');
  fs.mkdirSync(settings,{recursive:true});
  if(fs.lstatSync(settings).isSymbolicLink()||fs.lstatSync(root).isSymbolicLink())throw Error('Pasta do iniciador inesperada.');
  if(fs.existsSync(executable)&&fs.lstatSync(executable).isSymbolicLink())throw Error('Iniciador com vinculo inesperado.');
  if(!fs.existsSync(executable)||hash(fs.readFileSync(executable))!==manifest.sha256){
    const stage=executable+'.'+crypto.randomUUID();fs.writeFileSync(stage,bytes,{flag:'wx'});fs.renameSync(stage,executable);
  }
  const setting=path.join(settings,'launcher-runtime.txt');
  if(fs.existsSync(setting)&&fs.lstatSync(setting).isSymbolicLink())throw Error('Configuracao do iniciador inesperada.');
  const value=path.resolve(runtime)+'\n';
  if(!fs.existsSync(setting)||fs.readFileSync(setting,'utf8')!==value)fs.writeFileSync(setting,value);
  return executable;
}
function repairShortcuts({shell,root,runtime,desktop,appData}){
  const launcher=path.join(root,'Voiz.exe'),appDir=path.join(root,'app');
  const options={target:launcher,cwd:root,args:'',description:'Voiz',icon:path.join(appDir,'icon.ico'),iconIndex:0,appUserModelId:'hardboostapp.voiz'};
  const programs=path.join(appData,'Microsoft/Windows/Start Menu/Programs');
  const candidates=[path.join(desktop,'Voiz.lnk'),path.join(programs,'Voiz.lnk'),path.join(programs,'Voiz/Voiz.lnk')];
  const changed=[];
  const samePath=(a,b)=>typeof a==='string'&&path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase();
  for(const file of candidates){
    if(!fs.existsSync(file)||fs.lstatSync(file).isSymbolicLink())continue;
    const current=shell.readShortcutLink(file);
    const legacy=samePath(current.target,runtime)&&[appDir,`"${appDir}"`].includes(current.args?.trim());
    if(!samePath(current.target,launcher)&&!legacy)continue;
    if(Object.entries(options).every(([key,value])=>current[key]===value))continue;
    if(!shell.writeShortcutLink(file,'update',options))throw Error('Nao foi possivel atualizar o atalho do Voiz.');
    changed.push(file);
  }
  return changed;
}
module.exports={prepareLauncher,repairShortcuts};
