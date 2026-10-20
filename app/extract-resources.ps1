param([Parameter(Mandatory=$true)][string]$Archive,[Parameter(Mandatory=$true)][string]$Destination,[Parameter(Mandatory=$true)][string]$Manifest)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$voizPackage=Get-Content -LiteralPath $Manifest -Raw -Encoding UTF8 | ConvertFrom-Json
$voizAllowed=@{}
foreach($voizFile in $voizPackage.files){$voizAllowed[$voizFile.path]=$voizFile}
$voizDestination=[IO.Path]::GetFullPath($Destination).TrimEnd('\')
$voizSeen=@{}
$voizZip=[IO.Compression.ZipFile]::OpenRead($Archive)
try {
  foreach($voizEntry in $voizZip.Entries){
    if($voizEntry.FullName.EndsWith('/')){continue}
    $voizName=$voizEntry.FullName.Replace('\','/')
    if(-not $voizAllowed.ContainsKey($voizName) -or $voizSeen.ContainsKey($voizName) -or $voizEntry.Length -ne $voizAllowed[$voizName].bytes){throw 'Arquivo inesperado no pacote de vozes.'}
    $voizTarget=[IO.Path]::GetFullPath((Join-Path $voizDestination $voizName))
    if(-not $voizTarget.StartsWith($voizDestination+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Caminho fora da pasta de preparacao.'}
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($voizTarget)) | Out-Null
    [IO.Compression.ZipFileExtensions]::ExtractToFile($voizEntry,$voizTarget,$false)
    $voizSeen[$voizName]=$true
  }
  if($voizSeen.Count -ne $voizAllowed.Count){throw 'Pacote de vozes incompleto.'}
} finally {$voizZip.Dispose()}
