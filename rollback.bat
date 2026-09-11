@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

rem ============================================================
rem  opencode-chat version manager
rem    rollback.bat                roll back to newest snapshot
rem    rollback.bat rollback       same
rem    rollback.bat backup [label] create a snapshot (default: stable)
rem    rollback.bat list           list snapshots
rem    rollback.bat <name>         roll back to a specific snapshot
rem  Snapshot files: server.py, static\ (whole dir),
rem                  plugin base-override.ts, CHANGELOG.md
rem ============================================================

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "BK=%ROOT%\backups"
set "PLUGIN=%USERPROFILE%\.config\opencode\plugin\base-override.ts"

if not exist "%BK%" mkdir "%BK%" 2>nul

set "ARG=%~1"

if /I "%ARG%"=="backup" goto :backup
if /I "%ARG%"=="list" goto :list
if /I "%ARG%"=="rollback" goto :rollback
if "%ARG%"=="" goto :rollback

if exist "%BK%\%ARG%\server.py" (
  set "FORCE=%ARG%"
  goto :rollback
)

echo Usage:
echo   rollback.bat                  Roll back to newest snapshot
echo   rollback.bat rollback         Same
echo   rollback.bat backup [label]   Create snapshot (default label: stable)
echo   rollback.bat list             List snapshots
echo   rollback.bat ^<name^>         Roll back to a specific snapshot
goto :end


:backup
set "LABEL=%~2"
if "%LABEL%"=="" set "LABEL=stable"
call :mksnap "%LABEL%"
echo [OK] Snapshot created: !DEST!
goto :end


:list
echo Snapshots in "%BK%":
for /f "delims=" %%d in ('dir /b /ad /o-d "%BK%" 2^>nul') do echo   %%d
goto :end


:rollback
set "SNAP="
if defined FORCE set "SNAP=%FORCE%"
if not defined SNAP (
  for /f "delims=" %%d in ('dir /b /ad /o-d "%BK%" 2^>nul') do (
    set "NAME=%%d"
    if "!NAME:pre-rollback-=!"=="!NAME!" (
      if not defined SNAP set "SNAP=%%d"
    )
  )
)
if not defined SNAP (
  echo [ERROR] No snapshot found. Run: rollback.bat backup
  goto :end
)
set "SRC=%BK%\%SNAP%"
if not exist "%SRC%\server.py" (
  echo [ERROR] Snapshot "%SNAP%" is invalid ^(missing server.py^).
  goto :end
)

echo Rolling back to snapshot: %SNAP%
set /p "OK=Confirm? [Y/N] "
if /I not "%OK%"=="Y" (
  echo Cancelled.
  goto :end
)

call :mksnap "pre-rollback"
echo Safety snapshot of current state: !DEST!

if exist "%SRC%\server.py"     copy /y "%SRC%\server.py"     "%ROOT%\server.py" >nul
set "RESTORED_STATIC="
if exist "%SRC%\static\" (
  if exist "%ROOT%\static\js" rmdir /s /q "%ROOT%\static\js"
  if exist "%ROOT%\static\css" rmdir /s /q "%ROOT%\static\css"
  xcopy /e /i /y "%SRC%\static" "%ROOT%\static" >nul
  set "RESTORED_STATIC=1"
)
if not defined RESTORED_STATIC if exist "%SRC%\index.html" copy /y "%SRC%\index.html" "%ROOT%\static\index.html" >nul
if exist "%SRC%\base-override.ts" copy /y "%SRC%\base-override.ts" "%PLUGIN%" >nul
if exist "%SRC%\CHANGELOG.md"  copy /y "%SRC%\CHANGELOG.md"  "%ROOT%\CHANGELOG.md" >nul

echo.
echo [OK] Restored: %SNAP%
echo Next: 1^) restart server.py  2^) restart opencode  3^) refresh app ^(Ctrl+F5^)
goto :end


:mksnap
set "SLABEL=%~1"
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "STS=%%i"
set "DEST=%BK%\%SLABEL%-%STS%"
mkdir "%DEST%" 2>nul
if exist "%ROOT%\server.py"          copy /y "%ROOT%\server.py"          "%DEST%\server.py" >nul
if exist "%ROOT%\static"             xcopy /e /i /y "%ROOT%\static"      "%DEST%\static" >nul
if exist "%PLUGIN%"                  copy /y "%PLUGIN%"                  "%DEST%\base-override.ts" >nul
if exist "%ROOT%\CHANGELOG.md"       copy /y "%ROOT%\CHANGELOG.md"       "%DEST%\CHANGELOG.md" >nul
> "%DEST%\MANIFEST.txt" echo label=%SLABEL%
>>"%DEST%\MANIFEST.txt" echo date=%DATE% %TIME%
exit /b 0


:end
endlocal
