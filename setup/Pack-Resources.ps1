param([Parameter(Mandatory=$true)][string]$Source,[Parameter(Mandatory=$true)][string]$Output)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$voizSource=[IO.Path]::GetFullPath($Source).TrimEnd('\')
$voizOutput=[IO.File]::Open($Output,[IO.FileMode]::Create)
$voizZip=[IO.Compression.ZipArchive]::new($voizOutput,[IO.Compression.ZipArchiveMode]::Create,$false)
try {
  foreach($voizFile in Get-ChildItem -LiteralPath $voizSource -File -Recurse){
    if($voizFile.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Linked resource file.'}
    $voizName=$voizFile.FullName.Substring($voizSource.Length+1).Replace('\','/')
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($voizZip,$voizFile.FullName,$voizName,[IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally {$voizZip.Dispose();$voizOutput.Dispose()}
