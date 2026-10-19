param([Parameter(Mandatory=$true)][string]$Installer,[Parameter(Mandatory=$true)][string]$TestRoot)
$ErrorActionPreference='Stop'
$voizTemp=[IO.Path]::GetFullPath($TestRoot).TrimEnd('\')
$voizTarget=Join-Path $voizTemp ('voiz-install-'+[guid]::NewGuid().ToString('N'))
if (-not ([IO.Path]::GetFullPath($voizTarget).StartsWith($voizTemp+'\',[StringComparison]::OrdinalIgnoreCase))) { throw 'Unexpected test target.' }
$voizInstall=Start-Process -FilePath (Resolve-Path -LiteralPath $Installer) -ArgumentList "/S /NOINTEGRATION=1 /D=$voizTarget" -WindowStyle Hidden -PassThru -Wait
if ($voizInstall.ExitCode -ne 0) { throw 'Installer failed.' }
foreach ($voizFile in @('setup\no-integration','app\main.cjs','runtime\electron.exe','Preparar vozes.cmd')) {
  if (-not (Test-Path -LiteralPath (Join-Path $voizTarget $voizFile))) { throw "Missing installed file: $voizFile" }
}
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
$voizUninstall=Start-Process -FilePath (Join-Path $voizTarget 'Desinstalar Voiz.exe') -ArgumentList "/S _?=$voizTarget" -WindowStyle Hidden -PassThru -Wait
if ($voizUninstall.ExitCode -ne 0 -or (Test-Path -LiteralPath (Join-Path $voizTarget 'app'))) { throw 'Uninstall failed.' }
foreach ($voizDirectory in @('data','engine')) {
  if ((Get-Content -LiteralPath (Join-Path $voizTarget "$voizDirectory\keep.txt")).Trim() -ne 'preserve') { throw 'User data was not preserved.' }
}
Write-Output 'Standalone installer smoke test passed; no desktop/startup integration or audio capture.'
