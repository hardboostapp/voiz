@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup\Install-Resources.ps1" -Root "%~dp0."
if errorlevel 1 (
  echo Nao foi possivel concluir. Confira os logs na pasta logs.
  pause
  exit /b 1
)
echo Vozes preparadas. Abra o Voiz pelo atalho.
pause
