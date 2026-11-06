; Included by the NSIS installer (electron-builder.yml → nsis.include).
;
; The 2.x versions (Tauri) were installed per user by their own installer, in another folder and under another
; uninstall key ("Edukors Graph Editor"). Before this version is installed, that one is removed silently with its own
; uninstaller, so there are not two apps side by side. A silent uninstall closes it if it is still open (as when its
; updater has just started this installer), removes only the shortcuts that point to it, and keeps its data
; (%APPDATA%\org.edukors.grapheditor), which this version migrates on its first start (src/main/legacy.ts).
!include FileFunc.nsh

!macro customInit
  ReadRegStr $R0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Edukors Graph Editor" "UninstallString"
  StrCmp $R0 "" graph_legacy_done
  ; "C:\...\uninstall.exe" → C:\...\uninstall.exe
  StrCpy $R1 $R0 1
  StrCmp $R1 '"' 0 +2
    StrCpy $R0 $R0 -1 1
  IfFileExists $R0 0 graph_legacy_done
  ${GetParent} $R0 $R2
  DetailPrint "Removing Edukors Graph Editor 2.x from $R2"
  ; _?= runs the uninstaller in place, so ExecWait waits for it; it then leaves itself and the folder behind.
  ExecWait '"$R0" /S _?=$R2'
  Delete $R0
  RMDir $R2
  graph_legacy_done:
!macroend
