param([Parameter(Mandatory=$true)][string]$Root,[Parameter(Mandatory=$true)][string]$DriverDirectory,[switch]$DryRun)
$ErrorActionPreference='Stop'
# A launcher using PowerShell 7 may pass its module path to Windows PowerShell 5.1.
foreach($voizModule in @('Microsoft.PowerShell.Utility','Microsoft.PowerShell.Security','CimCmdlets')){Import-Module (Join-Path $PSHOME ('Modules\'+$voizModule)) -ErrorAction Stop}
$voizRoot=[IO.Path]::GetFullPath($Root)
$voizDriverDirectory=[IO.Path]::GetFullPath($DriverDirectory)
$voizInstaller=Join-Path $voizDriverDirectory 'VBCABLE_Setup_x64.exe'
$voizManifest=Get-Content -LiteralPath (Join-Path $voizRoot 'app\resources.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$voizPackage=$voizManifest.packages | Where-Object { $_.id -eq 'virtual-cable' }
$voizExpected=$voizPackage.files | Where-Object { $_.path -eq 'drivers/VBCABLE_Setup_x64.exe' }
if(-not $voizExpected -or -not (Test-Path -LiteralPath $voizInstaller) -or (Get-FileHash -LiteralPath $voizInstaller -Algorithm SHA256).Hash -ne $voizExpected.sha256){throw 'O instalador do cabo nao confere. Reinstale o Voiz.'}
$voizSignature=Get-AuthenticodeSignature -LiteralPath $voizInstaller
if($voizSignature.Status -ne 'Valid' -or $voizSignature.SignerCertificate.Subject -notlike '*BUREL VINCENT*'){throw 'A assinatura do instalador VB-Audio nao confere.'}
$voizResult=@{state='planned';requiresReboot=$false;message='Instalacao do VB-CABLE preparada. VB-Audio, donationware: https://vb-audio.com/Cable/'}
if($DryRun){$voizResult | ConvertTo-Json -Compress;exit 0}
try {
  $voizExisting=Get-CimInstance Win32_PnPEntity -Filter "Name LIKE '%VB-Audio Virtual Cable%'" | Where-Object {$_.ConfigManagerErrorCode -eq 0}
  if($voizExisting){
    $voizResult.state='already-installed';$voizResult.message='O cabo virtual ja esta instalado. Atualize os dispositivos no Voiz. Se ainda nao aparecer, reinicie o PC.'
  } else {
    Write-Output 'Instalando VB-CABLE, da VB-Audio. Autorize a confirmacao do Windows.'
    $voizChild=Start-Process -FilePath $voizInstaller -ArgumentList '-i -h' -WorkingDirectory $voizDriverDirectory -Verb RunAs -WindowStyle Hidden -PassThru -Wait
    if($voizChild.ExitCode -notin @(0,3010,1641)){throw ('O instalador VB-CABLE retornou '+$voizChild.ExitCode+'.')}
    $voizResult.state='reboot-required';$voizResult.requiresReboot=$true;$voizResult.message='O cabo virtual foi instalado. Reinicie o PC para concluir; depois abra o Voiz.'
  }
} catch {
  $voizResult.state='error';$voizResult.message='Nao foi possivel instalar o cabo virtual: '+$_.Exception.Message
}
$voizData=Join-Path $voizRoot 'data';[IO.Directory]::CreateDirectory($voizData) | Out-Null
$voizResult | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $voizData 'cable-install-result.json') -Encoding UTF8
Write-Output $voizResult.message
if($voizResult.state -eq 'error'){exit 1}
if($voizResult.requiresReboot){exit 3010}
exit 0
