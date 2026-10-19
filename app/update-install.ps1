param(
  [Parameter(Mandatory=$true)][string]$Root,
  [Parameter(Mandatory=$true)][string]$Stage,
  [Parameter(Mandatory=$true)][int]$ParentId,
  [Parameter(Mandatory=$true)][string]$Runtime,
  [switch]$NoRelaunch
)
$ErrorActionPreference = 'Stop'
Write-Output 'Voiz installer: validating local folders.'
$rootFull = [IO.Path]::GetFullPath($Root).TrimEnd('\')
$stageFull = [IO.Path]::GetFullPath($Stage).TrimEnd('\')
$updatesFull = [IO.Path]::Combine($rootFull, 'updates')
if ([IO.Path]::GetDirectoryName($stageFull) -ne $updatesFull -or [IO.Path]::GetFileName($stageFull) -notmatch '^[a-f0-9-]{36}$') { throw 'Pasta de atualização inválida.' }
$appFull = [IO.Path]::Combine($rootFull, 'app')
$newApp = [IO.Path]::Combine($stageFull, 'app')
$backup = [IO.Path]::Combine($stageFull, 'previous-app')
foreach ($voizPath in @($rootFull, $updatesFull, $stageFull, $appFull, $newApp)) {
  $item = Get-Item -LiteralPath $voizPath -Force
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'A atualização exige pastas locais.' }
}
if (Get-ChildItem -LiteralPath $newApp -Recurse -Force | Where-Object { ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 }) { throw 'O pacote contém vínculos não permitidos.' }
$oldVersion = (Get-Content -LiteralPath (Join-Path $appFull 'package.json') -Raw | ConvertFrom-Json).version
$newPackage = Get-Content -LiteralPath (Join-Path $newApp 'package.json') -Raw | ConvertFrom-Json
if ($newPackage.name -ne 'voiz' -or $newPackage.main -ne 'main.cjs' -or [version]$newPackage.version -le [version]$oldVersion) { throw 'Versão de atualização inválida.' }
Set-Content -LiteralPath (Join-Path $stageFull 'installer-ready') -Value 'ready' -Encoding ASCII
Write-Output 'Voiz installer: waiting for the app to close.'
if ($ParentId -gt 0) {
  $parentProcess = Get-Process -Id $ParentId -ErrorAction SilentlyContinue
  if ($parentProcess -and -not $parentProcess.WaitForExit(90000)) { throw 'O Voiz não encerrou. Feche o aplicativo e tente novamente.' }
}
$movedOld = $false
$result = [ordered]@{ previousVersion=$oldVersion; version=$newPackage.version; installed=$false; backup=$backup; date=[DateTime]::UtcNow.ToString('o') }
try {
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    try { Move-Item -LiteralPath $appFull -Destination $backup; $movedOld = $true; break }
    catch { if ($attempt -eq 19) { throw }; Start-Sleep -Milliseconds 250 }
  }
  Move-Item -LiteralPath $newApp -Destination $appFull
  $result.installed = $true
} catch {
  $result.error = $_.Exception.Message
  if ($movedOld -and -not (Test-Path -LiteralPath $appFull)) { Move-Item -LiteralPath $backup -Destination $appFull }
  throw
} finally {
  $result | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $updatesFull 'last-result.json') -Encoding UTF8
  if (-not $NoRelaunch -and (Test-Path -LiteralPath (Join-Path $appFull 'main.cjs'))) {
    Remove-Item Env:ELECTRON_RUN_AS_NODE,Env:VOIZ_TEST_DATA -ErrorAction SilentlyContinue
    Start-Process -FilePath $Runtime -ArgumentList ('"' + $appFull + '"') -WorkingDirectory $rootFull -WindowStyle Normal
  }
}
