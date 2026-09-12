@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
set "TOOLS=%~dp0"
if "%TOOLS:~-1%"=="\" set "TOOLS=%TOOLS:~0,-1%"
for %%I in ("%TOOLS%\..") do set "ROOT=%%~fI"

rem ============================================================
rem  release.bat
rem    Read VERSION (single source of truth) and stamp
rem    opencode-chat.exe FileVersion/ProductVersion with rcedit.
rem    rcedit is downloaded on demand; if unavailable, warn+skip.
rem ============================================================

set "EXE=%ROOT%\opencode-chat.exe"
set "VERFILE=%ROOT%\VERSION"
set "RCEDIT=%TOOLS%\rcedit-x64.exe"
set "RCEDIT_URL=https://github.com/electron/rcedit/releases/download/v2.0.0/rcedit-x64.exe"

if not exist "%VERFILE%" (
  echo [ERROR] VERSION not found: %VERFILE%
  goto :end
)
set /p "VER="<"%VERFILE%"
if "%VER%"=="" (
  echo [ERROR] VERSION is empty.
  goto :end
)
echo %VER%| findstr /r "^[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*$" >nul
if errorlevel 1 (
  echo [ERROR] VERSION must be X.Y.Z ^(got: %VER%^)
  goto :end
)
if not exist "%EXE%" (
  echo [ERROR] exe not found: %EXE%
  goto :end
)

echo [INFO] VERSION=%VER%

if exist "%ROOT%\CHANGELOG.md" (
  findstr /c:"v%VER%" "%ROOT%\CHANGELOG.md" >nul
  if errorlevel 1 echo [WARN] CHANGELOG.md has no "v%VER%" entry - version drift?
)

if not exist "%RCEDIT%" (
  echo [INFO] rcedit not found, downloading...
  where powershell >nul 2>&1
  if errorlevel 1 (
    echo [WARN] powershell not found - cannot download rcedit. Skip exe version.
    goto :verify
  )
  powershell -NoProfile -Command "try { Invoke-WebRequest -Uri '%RCEDIT_URL%' -OutFile '%RCEDIT%' -UseBasicParsing -TimeoutSec 120 } catch { exit 1 }"
  if errorlevel 1 (
    echo [WARN] rcedit download failed. Skip exe version.
    if exist "%RCEDIT%" del /q "%RCEDIT%" >nul 2>&1
    goto :verify
  )
)

echo [INFO] Stamping exe version...
"%RCEDIT%" "%EXE%" --set-file-version "%VER%.0" --set-product-version "%VER%.0" --set-version-string "FileVersion" "%VER%.0" --set-version-string "ProductVersion" "%VER%.0"
if errorlevel 1 (
  echo [WARN] rcedit failed. exe version not updated.
  goto :verify
)
echo [OK] exe version updated.

:verify
where powershell >nul 2>&1
if errorlevel 1 goto :end
powershell -NoProfile -Command "$v=(Get-Item -LiteralPath '%EXE%').VersionInfo; Write-Host ('FileVersion=' + $v.FileVersion + '  ProductVersion=' + $v.ProductVersion)"

:end
endlocal
