const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const {prepareLauncher}=require('../app/launcher.cjs'),manifest=require('../app/launcher.json');
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
test('launcher payload matches its reviewed source and icon',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../setup/VoizLauncher.cs'),'utf8').replace(/\r\n/g,'\n');
  assert.equal(manifest.sourceSha256,digest(source));
  assert.equal(manifest.sourceSha256,digest(source.replace(/\n/g,'\r\n').replace(/\r\n/g,'\n')));
  assert.equal(manifest.iconSha256,digest(fs.readFileSync(path.join(__dirname,'../app/icon.ico'))));
  const bytes=Buffer.from(manifest.content,'base64');assert.equal(digest(bytes),manifest.sha256);assert.equal(bytes.length,manifest.bytes);assert.equal(bytes.toString('ascii',0,2),'MZ');assert.ok(bytes.length<100*1024);
});
test('Voiz launcher has Windows identity and forwards quoted background arguments without opening Electron', {skip:process.platform!=='win32',timeout:20000},async()=>{
  const root=fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(),'voiz-launcher-test-'))),app=path.join(root,'app'),receipt=path.join(root,'receipt.txt');fs.mkdirSync(app);fs.writeFileSync(path.join(app,'main.cjs'),'// fixture only');
  const fakeSource=path.join(root,'Fake.cs'),fakeRuntime=path.join(root,'fake-runtime.exe');
  fs.writeFileSync(fakeSource,'using System; using System.IO; using System.Text; class Fake { static int Main(string[] args) { var rows=new string[args.Length+3]; rows[0]=Directory.GetCurrentDirectory(); rows[1]=Environment.GetEnvironmentVariable("ELECTRON_RUN_AS_NODE")??"absent"; rows[2]=Environment.GetEnvironmentVariable("VOIZ_TEST_DATA")??"absent"; for(int i=0;i<args.Length;i++)rows[i+3]=Convert.ToBase64String(Encoding.UTF8.GetBytes(args[i])); File.WriteAllLines(Environment.GetEnvironmentVariable("VOIZ_LAUNCHER_RECEIPT"),rows); return 0; } }');
  execFileSync(path.join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/target:winexe','/out:'+fakeRuntime,fakeSource],{windowsHide:true});
  const exe=prepareLauncher(root,fakeRuntime),mtime=fs.statSync(exe).mtimeMs;assert.equal(prepareLauncher(root,fakeRuntime),exe);assert.equal(fs.statSync(exe).mtimeMs,mtime,'unchanged launcher must be reused');
  const metadata=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command','[Diagnostics.FileVersionInfo]::GetVersionInfo($env:VOIZ_TEST_EXE) | Select-Object FileDescription,ProductName,CompanyName | ConvertTo-Json -Compress'],{windowsHide:true,env:{...process.env,VOIZ_TEST_EXE:exe},encoding:'utf8'}));
  assert.equal(metadata.FileDescription,'Voiz');assert.equal(metadata.ProductName,'Voiz');assert.equal(metadata.CompanyName,'hardboostapp');
  const forwarded=['--voiz-background','with spaces','a "quoted" word','trailing\\',''];
  execFileSync(exe,forwarded,{windowsHide:true,env:{...process.env,ELECTRON_RUN_AS_NODE:'1',VOIZ_TEST_DATA:'must-not-leak',VOIZ_LAUNCHER_RECEIPT:receipt}});
  for(let i=0;!fs.existsSync(receipt)&&i<100;i++)await new Promise(r=>setTimeout(r,30));
  const rows=fs.readFileSync(receipt,'utf8').replace(/^\uFEFF/,'').trimEnd().split(/\r?\n/);
  assert.equal(rows[0],root);assert.equal(rows[1],'absent');assert.equal(rows[2],'absent');
  // Keep the final empty argument, whose base64 is an empty last line.
  const actual=fs.readFileSync(receipt,'utf8').replace(/^\uFEFF/,'').split(/\r?\n/).slice(3,-1).map(v=>Buffer.from(v,'base64').toString());
  assert.deepEqual(actual,[app,...forwarded]);
  fs.writeFileSync(exe,'corrupted local launcher');prepareLauncher(root,fakeRuntime);assert.equal(digest(fs.readFileSync(exe)),manifest.sha256);
});
