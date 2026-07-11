@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "PS_SCRIPT=%SCRIPT_DIR%scripts\powershell\create-project.ps1"

if not exist "%PS_SCRIPT%" (
  echo Cannot find "%PS_SCRIPT%".
  pause
  exit /b 1
)

powershell -NoProfile -STA -ExecutionPolicy Bypass -File "%PS_SCRIPT%" %*
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo Project creation failed with exit code %EXIT_CODE%.
  pause
)

exit /b %EXIT_CODE%
