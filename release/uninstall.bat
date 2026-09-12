@echo off
rem opencode chat uninstaller entry.
rem Copies the PowerShell uninstaller to a temp folder and runs it detached,
rem so the installation directory is free of file handles and can be removed.
setlocal EnableExtensions

set "SRC=%~dp0"
if "%SRC:~-1%"=="\" set "SRC=%SRC:~0,-1%"

if not exist "%SRC%\uninstall.ps1" (
  echo [ERROR] uninstall.ps1 not found next to this script.
  pause
  exit /b 1
)

set "OC_UNINSTALL_DIR=%SRC%"
set "TMPPS=%TEMP%\opencode-chat-uninstall.ps1"
copy /y "%SRC%\uninstall.ps1" "%TMPPS%" >nul 2>nul

start "opencode chat uninstall" /d "%TEMP%" powershell -NoProfile -ExecutionPolicy Bypass -File "%TMPPS%"
exit /b 0
