@echo off
setlocal EnableExtensions
cd /d "%~dp0\.."

rem ============================================================
rem  test.bat
rem    node --test  : front-end pure-function unit tests
rem    python       : server smoke tests (unittest)
rem ============================================================

where node >nul 2>&1
if errorlevel 1 (
  echo [WARN] node not found - skip JS tests
) else (
  echo === node pure-function tests ===
  node --test "test\pure.test.js"
  if errorlevel 1 goto :fail
)

where python >nul 2>&1
if errorlevel 1 (
  echo [WARN] python not found - skip server tests
) else (
  echo === server smoke tests ===
  python -m unittest discover -s test -p "test_*.py"
  if errorlevel 1 goto :fail
)

echo [OK] all tests passed
goto :end

:fail
echo [FAIL] tests failed
exit /b 1

:end
endlocal
