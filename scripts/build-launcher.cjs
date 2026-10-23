const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),compiler=path.join(process.env.WINDIR||'C:\\Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe');
function compileLauncher(destination){
  execFileSync(compiler,['/nologo','/target:winexe','/platform:anycpu','/optimize+','/debug-','/win32icon:'+path.join(root,'app/icon.ico'),'/out:'+destination,path.join(root,'setup/VoizLauncher.cs')],{windowsHide:true,stdio:'pipe'});
  return fs.readFileSync(destination);
}
if(require.main===module){
  const stage=fs.mkdtempSync(path.join(os.tmpdir(),'voiz-launcher-build-')),bytes=compileLauncher(path.join(stage,'Voiz.exe'));
  // Git checkouts may use LF or CRLF; source identity must survive either form.
  const source=fs.readFileSync(path.join(root,'setup/VoizLauncher.cs'),'utf8').replace(/\r\n/g,'\n'),icon=fs.readFileSync(path.join(root,'app/icon.ico'));
  const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
  const manifest={schema:1,filename:'Voiz.exe',bytes:bytes.length,sha256:hash(bytes),sourceSha256:hash(source),iconSha256:hash(icon),content:bytes.toString('base64')};
  fs.writeFileSync(path.join(root,'app/launcher.json'),JSON.stringify(manifest,null,2));
  console.log(JSON.stringify({bytes:bytes.length,sha256:manifest.sha256}));
}
module.exports={compileLauncher,compiler};
