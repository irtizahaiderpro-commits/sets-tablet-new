@echo off
setlocal
cd /d "%~dp0"
cls
echo ==========================================
echo  SETS Static Preview - No npm needed
echo ==========================================
echo.
set "PREVIEW_FILE=%~dp0OPEN_STATIC_PREVIEW.html"
set "DIRECT_FILE=%~dp0static-preview\index.html"

echo Opening static preview in your default browser...
echo.
echo Preview file:
echo %DIRECT_FILE%
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%PREVIEW_FILE%'" >nul 2>nul
if errorlevel 1 (
  echo PowerShell browser open failed. Trying Windows Explorer...
  explorer "%PREVIEW_FILE%" >nul 2>nul
)

echo.
echo If the browser did not open, copy this path and paste it into Chrome/Edge:
echo %DIRECT_FILE%
echo.
echo This preview does not need npm install or Node.js.
echo.
pause
