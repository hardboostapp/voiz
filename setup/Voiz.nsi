Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"
!include "FileFunc.nsh"
!include "StrFunc.nsh"
${UnStrStr}
Var NoIntegration
Name "Voiz"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\Voiz"
RequestExecutionLevel user
SetCompressor /SOLID lzma
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_FUNCTION LaunchVoiz
!define MUI_FINISHPAGE_RUN_TEXT "Abrir o Voiz"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "${SOURCE}\setup\LEIA-ANTES.txt"
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "PortugueseBR"
Function .onInit
  ${GetParameters} $0
  ${GetOptions} $0 "/NOINTEGRATION=" $NoIntegration
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "O Voiz exige Windows de 64 bits."
    Abort
  ${EndIf}
  SetShellVarContext current
  IfFileExists "$INSTDIR\app\main.cjs" 0 new_folder
  IfFileExists "$INSTDIR\setup\install-marker.txt" new_folder
  MessageBox MB_ICONSTOP "Esta pasta já contém outro Voiz. Use Atualizações dentro do aplicativo."
  Abort
  new_folder:
FunctionEnd
Section "Voiz: soundboard e voz natural" Base
  SectionIn RO
  SetOutPath "$INSTDIR\app"
  File /r "${SOURCE}\app\*"
  SetOutPath "$INSTDIR\runtime"
  File /r "${RUNTIME}\*"
  SetOutPath "$INSTDIR\setup"
  File "${SOURCE}\setup\downloads.json"
  File "${SOURCE}\setup\configuration.json"
  File "${SOURCE}\setup\prepare.cjs"
  File "${SOURCE}\setup\Install-AI.ps1"
  File "${SOURCE}\setup\Expand-Zip.ps1"
  File "${SOURCE}\setup\install-resources.cjs"
  File "${SOURCE}\setup\Install-Resources.ps1"
  FileOpen $0 "$INSTDIR\setup\install-marker.txt" w
  FileWrite $0 "voiz-install-v1"
  FileClose $0
  ${If} $NoIntegration == "1"
    FileOpen $0 "$INSTDIR\setup\no-integration" w
    FileWrite $0 "isolated-test"
    FileClose $0
  ${EndIf}
  SetOutPath "$INSTDIR"
  File "${LAUNCHER}"
  File "${SOURCE}\setup\Preparar vozes.cmd"
  File "${SOURCE}\setup\LEIA-ANTES.txt"
  WriteUninstaller "$INSTDIR\Desinstalar Voiz.exe"
  SetOutPath "$INSTDIR\drivers"
  File /r "${CABLE}\*"
  ${If} $NoIntegration != "1"
  CreateShortCut "$DESKTOP\Voiz.lnk" "$INSTDIR\Voiz.exe" "" "$INSTDIR\app\icon.ico"
  CreateDirectory "$SMPROGRAMS\Voiz"
  CreateShortCut "$SMPROGRAMS\Voiz\Voiz.lnk" "$INSTDIR\Voiz.exe" "" "$INSTDIR\app\icon.ico"
  CreateShortCut "$SMPROGRAMS\Voiz\Preparar vozes.lnk" "$INSTDIR\Preparar vozes.cmd"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Voiz" "DisplayName" "Voiz"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Voiz" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Voiz" "UninstallString" '$\"$INSTDIR\Desinstalar Voiz.exe$\"'
  ${EndIf}
SectionEnd
Section "Motor e todas as vozes prontas (download automatico)" Voices
  SectionIn RO
  ${If} $NoIntegration == "1"
    Goto skip_ai
  ${EndIf}
  retry_resources:
  DetailPrint "Instalando motor e vozes prontos. O progresso de cada download aparece abaixo."
  nsExec::ExecToLog 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\setup\Install-Resources.ps1" -Root "$INSTDIR"'
  Pop $0
  ${If} $0 != 0
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "A instalacao das vozes nao terminou. Confira a internet e o espaco livre e tente novamente. Os downloads ja concluidos serao reaproveitados." IDRETRY retry_resources
    SetErrorLevel 1
    Abort
  ${EndIf}
  skip_ai:
SectionEnd
Section "Cabo virtual VB-CABLE (VB-Audio, donationware)" CableSection
  SectionIn RO
  ${If} $NoIntegration == "1"
    Goto skip_cable
  ${EndIf}
  retry_cable:
  DetailPrint "Instalando o cabo virtual da VB-Audio. Autorize a confirmacao do Windows se aparecer."
  nsExec::ExecToLog 'powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\app\install-cable.ps1" -Root "$INSTDIR" -DriverDirectory "$INSTDIR\drivers"'
  Pop $0
  ${If} $0 == 3010
    SetRebootFlag true
  ${ElseIf} $0 != 0
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "O cabo virtual nao terminou a instalacao. Autorize o Windows para concluir o envio de audio a chamada." IDRETRY retry_cable
    SetErrorLevel 1
    Abort
  ${EndIf}
  skip_cable:
SectionEnd
Function LaunchVoiz
  Exec '$\"$INSTDIR\Voiz.exe$\"'
FunctionEnd
Section "Uninstall"
  SetShellVarContext current
  IfFileExists "$INSTDIR\setup\install-marker.txt" 0 invalid_install
  FileOpen $0 "$INSTDIR\setup\install-marker.txt" r
  FileRead $0 $1
  FileClose $0
  StrCmp $1 "voiz-install-v1" 0 invalid_install
  IfFileExists "$INSTDIR\setup\no-integration" skip_unintegration
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Voiz"
  ${UnStrStr} $1 $0 "$INSTDIR\"
  ${If} $1 != ""
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Voiz"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "Voiz"
  ${EndIf}
  Delete "$DESKTOP\Voiz.lnk"
  RMDir /r "$SMPROGRAMS\Voiz"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Voiz"
  skip_unintegration:
  RMDir /r "$INSTDIR\app"
  RMDir /r "$INSTDIR\runtime"
  Delete "$INSTDIR\Voiz.exe"
  RMDir /r "$INSTDIR\setup"
  RMDir /r "$INSTDIR\drivers"
  RMDir /r "$INSTDIR\engine-runtime"
  Delete "$INSTDIR\Preparar vozes.cmd"
  Delete "$INSTDIR\LEIA-ANTES.txt"
  Delete "$INSTDIR\Desinstalar Voiz.exe"
  RMDir "$INSTDIR"
  Goto uninstall_done
  invalid_install:
  MessageBox MB_ICONSTOP "A pasta não contém uma instalação reconhecida do Voiz. Nenhum arquivo foi removido."
  Abort
  uninstall_done:
SectionEnd
