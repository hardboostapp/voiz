const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),pkg=require('../app/package.json'),manifest=require('../setup/downloads.json');
async function build(){
  let runtime=process.env.VOIZ_ELECTRON_DIR;
  const shared=path.resolve(root,'../Bubble/app/node_modules/electron/dist');
  if(!runtime&&fs.existsSync(path.join(shared,'electron.exe')))runtime=shared;
  if(!runtime){
    const tools=path.join(root,'.tools');fs.mkdirSync(tools,{recursive:true});const archive=path.join(tools,'electron.zip');runtime=path.join(tools,'electron-'+manifest.electron.version);
    if(!fs.existsSync(path.join(runtime,'electron.exe'))){
      if(!fs.existsSync(archive)||crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex')!==manifest.electron.sha256){const r=await fetch(manifest.electron.url,{signal:AbortSignal.timeout(300000)});if(!r.ok)throw Error('Electron download failed');const bytes=Buffer.from(await r.arrayBuffer());if(crypto.createHash('sha256').update(bytes).digest('hex')!==manifest.electron.sha256)throw Error('Electron checksum failed');fs.writeFileSync(archive,bytes);}
      execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(root,'setup/Expand-Zip.ps1'),'-Archive',archive,'-Destination',runtime],{windowsHide:true});
    }
  }
  if(!fs.existsSync(path.join(runtime,'LICENSE'))||!fs.existsSync(path.join(runtime,'LICENSES.chromium.html')))throw Error('Electron license files missing');
  const compiler=process.env.VOIZ_MAKENSIS||path.resolve(root,'../_motores/cache-builder/nsis-3.0.4.1/nsis-3.0.4.1-1mx3n/makensis.exe');
  const output=path.join(root,'release',`Voiz-${pkg.version}-Setup.exe`);fs.mkdirSync(path.dirname(output),{recursive:true});
  execFileSync(compiler,['/V2',`/DSOURCE=${root}`,`/DRUNTIME=${path.resolve(runtime)}`,`/DVERSION=${pkg.version}`,`/DOUTPUT=${output}`,path.join(root,'setup/Voiz.nsi')],{windowsHide:true,stdio:'inherit'});
  const sha256=crypto.createHash('sha256').update(fs.readFileSync(output)).digest('hex');fs.appendFileSync(path.join(root,'release/SHA256SUMS.txt'),sha256+'  '+path.basename(output)+'\n');
  console.log(JSON.stringify({version:pkg.version,installer:output,bytes:fs.statSync(output).size,sha256}));
}
build().catch(error=>{console.error(error.message);process.exitCode=1;});
