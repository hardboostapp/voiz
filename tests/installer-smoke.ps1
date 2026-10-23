param([Parameter(Mandatory=$true)][string]$Installer,[Parameter(Mandatory=$true)][string]$TestRoot)
$ErrorActionPreference='Stop'
$voizTemp=[IO.Path]::GetFullPath($TestRoot).TrimEnd('\')
$voizTarget=Join-Path $voizTemp ('voiz-install-'+[guid]::NewGuid().ToString('N'))
if (-not ([IO.Path]::GetFullPath($voizTarget).StartsWith($voizTemp+'\',[StringComparison]::OrdinalIgnoreCase))) { throw 'Unexpected test target.' }
$voizInstall=Start-Process -FilePath (Resolve-Path -LiteralPath $Installer) -ArgumentList "/S /NOINTEGRATION=1 /D=$voizTarget" -WindowStyle Hidden -PassThru -Wait
if ($voizInstall.ExitCode -ne 0) { throw 'Installer failed.' }
foreach ($voizFile in @('setup\no-integration','app\main.cjs','runtime\electron.exe','Voiz.exe','Preparar vozes.cmd')) {
  if (-not (Test-Path -LiteralPath (Join-Path $voizTarget $voizFile))) { throw "Missing installed file: $voizFile" }
}
$voizIdentity=[Diagnostics.FileVersionInfo]::GetVersionInfo((Join-Path $voizTarget 'Voiz.exe'))
if($voizIdentity.FileDescription -ne 'Voiz' -or $voizIdentity.ProductName -ne 'Voiz'){throw 'Launcher lost the Voiz Windows identity.'}
$voizNodeMode=$env:ELECTRON_RUN_AS_NODE
try {
  $env:ELECTRON_RUN_AS_NODE='1'
  & (Join-Path $voizTarget 'runtime\electron.exe') -e "if (process.versions.electron !== '44.0.0') process.exit(1);" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Standalone runtime failed.' }
} finally {
  if ($null -eq $voizNodeMode) { Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue } else { $env:ELECTRON_RUN_AS_NODE=$voizNodeMode }
}
foreach ($voizDirectory in @('data','engine')) {
  New-Item -ItemType Directory -Path (Join-Path $voizTarget $voizDirectory) -Force | Out-Null
  Set-Content -LiteralPath (Join-Path $voizTarget "$voizDirectory\keep.txt") -Value 'preserve'
}
# Seed completed-model placeholders to exercise the real PowerShell wrapper without downloads or inference.
Set-Content -LiteralPath (Join-Path $voizTarget 'engine\main.exe') -Value 'must not execute: all models are already prepared'
foreach ($voizSlot in @(6,8,10)) {
  $voizModel=Join-Path $voizTarget "engine\model_dir\$voizSlot"
  New-Item -ItemType Directory -Path $voizModel -Force | Out-Null
  Set-Content -LiteralPath (Join-Path $voizModel 'params.json') -Value '{"is_onnx":true,"model_file":"fixture.onnx"}'
  Set-Content -LiteralPath (Join-Path $voizModel 'fixture.onnx') -Value 'placeholder: no inference'
}
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $voizTarget 'setup\Install-AI.ps1') -Root ($voizTarget+'\.')
if ($LASTEXITCODE -ne 0) { throw 'Voice preparation wrapper failed.' }
if (-not (Select-String -LiteralPath (Join-Path $voizTarget 'logs\setup-ai.log') -Pattern 'Vozes preparadas' -Quiet)) { throw 'Voice preparation returned before its worker completed.' }
# Exercise the new GUI-runtime wrapper: wait for asynchronous work, decode UTF-8 and propagate failure.
$voizWorker=Join-Path $voizTarget 'setup\install-resources.cjs'
@'
const fs=require('node:fs'),path=require('node:path');
setTimeout(()=>{fs.writeFileSync(path.join(__dirname,'completed.txt'),'done');console.log('Prepara\u00e7\u00e3o conclu\u00edda');console.error('Diagn\u00f3stico conclu\u00eddo');process.exit(0);},400);
'@ | Set-Content -LiteralPath $voizWorker -Encoding UTF8
& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $voizTarget 'setup\Install-Resources.ps1') -Root ($voizTarget+'\.')
if($LASTEXITCODE -ne 0 -or -not(Test-Path -LiteralPath (Join-Path $voizTarget 'setup\completed.txt'))){throw 'Resource wrapper returned before its asynchronous worker.'}
$voizExpected='Prepara'+[char]0xe7+[char]0xe3+'o conclu'+[char]0xed+'da'
if(-not((Get-Content -LiteralPath (Join-Path $voizTarget 'logs\setup-resources.log') -Encoding UTF8 -Raw).Contains($voizExpected))){throw 'Resource log lost UTF-8 output.'}
Set-Content -LiteralPath $voizWorker -Value 'setTimeout(()=>{console.error("Expected fixture failure");process.exit(7);},100);' -Encoding UTF8
$voizFailureInfo=[Diagnostics.ProcessStartInfo]::new()
$voizFailureInfo.FileName='powershell.exe'
$voizFailureInfo.Arguments='-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+(Join-Path $voizTarget 'setup\Install-Resources.ps1')+'" -Root "'+$voizTarget+'\."'
$voizFailureInfo.UseShellExecute=$false;$voizFailureInfo.CreateNoWindow=$true;$voizFailureInfo.RedirectStandardOutput=$true;$voizFailureInfo.RedirectStandardError=$true
$voizFailure=[Diagnostics.Process]::Start($voizFailureInfo)
$voizFailureOut=$voizFailure.StandardOutput.ReadToEndAsync();$voizFailureErr=$voizFailure.StandardError.ReadToEndAsync()
$voizFailure.WaitForExit();[void]$voizFailureOut.GetAwaiter().GetResult();[void]$voizFailureErr.GetAwaiter().GetResult()
if($voizFailure.ExitCode -eq 0){throw 'Resource wrapper concealed a worker failure.'}
$voizFailure.Dispose()
$voizUninstall=Start-Process -FilePath (Join-Path $voizTarget 'Desinstalar Voiz.exe') -ArgumentList "/S _?=$voizTarget" -WindowStyle Hidden -PassThru -Wait
if ($voizUninstall.ExitCode -ne 0 -or (Test-Path -LiteralPath (Join-Path $voizTarget 'app'))) { throw 'Uninstall failed.' }
foreach ($voizDirectory in @('data','engine')) {
  if ((Get-Content -LiteralPath (Join-Path $voizTarget "$voizDirectory\keep.txt")).Trim() -ne 'preserve') { throw 'User data was not preserved.' }
}
Write-Output 'Standalone installer smoke test passed; no desktop/startup integration or audio capture.'
