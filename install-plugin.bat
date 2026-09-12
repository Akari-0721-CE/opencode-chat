@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

rem ============================================================
rem  install-plugin.bat
rem    Copy repo plugin\base-override.ts into the opencode plugin
rem    directory and verify opencode.jsonc registers it.
rem ============================================================

set "SRC=%ROOT%\plugin\base-override.ts"
set "DESTDIR=%USERPROFILE%\.config\opencode\plugin"
set "DEST=%DESTDIR%\base-override.ts"
set "CONF=%USERPROFILE%\.config\opencode\opencode.jsonc"

if not exist "%SRC%" (
  echo [ERROR] source not found: %SRC%
  goto :end
)

if not exist "%DESTDIR%" mkdir "%DESTDIR%" 2>nul
copy /y "%SRC%" "%DEST%" >nul
if errorlevel 1 (
  echo [ERROR] copy failed: %SRC% -^> %DEST%
  goto :end
)
echo [OK] Installed plugin: %DEST%

if exist "%CONF%" (
  findstr /i /c:"base-override.ts" "%CONF%" >nul
  if errorlevel 1 (
    echo [WARN] "%CONF%" does not register base-override.ts
    echo        Add:  "plugin": ["./plugin/base-override.ts"]
  ) else (
    echo [OK] "%CONF%" registers the plugin.
  )
) else (
  echo [WARN] config not found: %CONF%
  echo        Create it with:  { "plugin": ["./plugin/base-override.ts"] }
)

echo [INFO] Restart opencode to apply.

:end
endlocal
