param([Parameter(Mandatory=$true)][string]$Root)
$ErrorActionPreference='Stop'
$voizRoot=[IO.Path]::GetFullPath($Root)
$voizRuntime=Join-Path $voizRoot 'runtime\electron.exe'
if(-not(Test-Path -LiteralPath $voizRuntime)){throw 'O runtime do Voiz nao foi encontrado.'}
if([IO.DriveInfo]::new([IO.Path]::GetPathRoot($voizRoot)).AvailableFreeSpace -lt 6GB){throw 'A instalacao completa precisa de pelo menos 6 GB livres.'}
$voizInfo=[Diagnostics.ProcessStartInfo]::new()
$voizInfo.FileName=$voizRuntime
$voizInfo.Arguments='"'+(Join-Path $voizRoot 'setup\install-resources.cjs')+'"'
$voizInfo.WorkingDirectory=$voizRoot
$voizInfo.UseShellExecute=$false
$voizInfo.CreateNoWindow=$true
$voizInfo.RedirectStandardOutput=$true
$voizInfo.RedirectStandardError=$true
$voizInfo.StandardOutputEncoding=[Text.UTF8Encoding]::new($false)
$voizInfo.StandardErrorEncoding=[Text.UTF8Encoding]::new($false)
$voizInfo.EnvironmentVariables['ELECTRON_RUN_AS_NODE']='1'
$voizLogDirectory=Join-Path $voizRoot 'logs'
[void][IO.Directory]::CreateDirectory($voizLogDirectory)
$voizLog=[IO.StreamWriter]::new((Join-Path $voizLogDirectory 'setup-resources.log'),$false,[Text.UTF8Encoding]::new($false))
$voizProcess=[Diagnostics.Process]::new();$voizProcess.StartInfo=$voizInfo
try {
  [void]$voizProcess.Start()
  $voizOut=$voizProcess.StandardOutput.ReadLineAsync();$voizErr=$voizProcess.StandardError.ReadLineAsync();$voizOutClosed=$false;$voizErrClosed=$false
  while(-not $voizOutClosed -or -not $voizErrClosed){
    if(-not $voizOutClosed -and $voizOut.IsCompleted){$voizLine=$voizOut.GetAwaiter().GetResult();if($null -eq $voizLine){$voizOutClosed=$true}else{$voizLog.WriteLine($voizLine);$voizLog.Flush();Write-Output ($voizLine.Normalize([Text.NormalizationForm]::FormD) -replace '\p{M}','');$voizOut=$voizProcess.StandardOutput.ReadLineAsync()}}
    if(-not $voizErrClosed -and $voizErr.IsCompleted){$voizLine=$voizErr.GetAwaiter().GetResult();if($null -eq $voizLine){$voizErrClosed=$true}else{$voizLog.WriteLine($voizLine);$voizLog.Flush();Write-Output ($voizLine.Normalize([Text.NormalizationForm]::FormD) -replace '\p{M}','');$voizErr=$voizProcess.StandardError.ReadLineAsync()}}
    if(-not $voizOutClosed -or -not $voizErrClosed){[Threading.Thread]::Sleep(30)}
  }
  $voizProcess.WaitForExit()
  if($voizProcess.ExitCode -ne 0){throw 'Nao foi possivel concluir o motor e as vozes.'}
} finally {$voizProcess.Dispose();$voizLog.Dispose()}
