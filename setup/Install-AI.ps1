param([Parameter(Mandatory=$true)][string]$Root)
$ErrorActionPreference='Stop'
$voizRoot=[IO.Path]::GetFullPath($Root).TrimEnd('\')
if (-not (Test-Path -LiteralPath (Join-Path $voizRoot 'app\main.cjs'))) { throw 'A pasta do Voiz não foi encontrada.' }
$voizRuntime=Join-Path $voizRoot 'runtime\electron.exe'
if (-not (Test-Path -LiteralPath $voizRuntime)) { throw 'Reinstale o Voiz para recuperar seu runtime.' }
$voizDrive=[IO.DriveInfo]::new([IO.Path]::GetPathRoot($voizRoot))
if ($voizDrive.AvailableFreeSpace -lt 5GB) { throw 'A preparação precisa de 5 GB livres no disco da instalação.' }
Write-Output 'Preparando Lula, Bolsonaro e Mano Brown. Esta etapa baixa os arquivos das origens e pode levar vários minutos.'
Write-Output 'Lula e Bolsonaro: uso não comercial, conforme a licença declarada na origem. Atribuições em LEIA-ANTES.txt.'
Write-Output 'Feche o Voiz pela bandeja durante a preparação. Nenhum microfone será aberto.'
$voizNodeMode=$env:ELECTRON_RUN_AS_NODE
try {
  $env:ELECTRON_RUN_AS_NODE='1'
  & $voizRuntime (Join-Path $voizRoot 'setup\prepare.cjs')
  if ($LASTEXITCODE -ne 0) { throw 'A preparação das vozes não terminou. Execute Preparar vozes.cmd para tentar novamente.' }
} finally {
  if ($null -eq $voizNodeMode) { Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue } else { $env:ELECTRON_RUN_AS_NODE=$voizNodeMode }
}
