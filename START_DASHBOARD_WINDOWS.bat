@echo off
setlocal EnableExtensions
cd /d "%~dp0"
cls
echo ==========================================
echo  SETS Yard Visibility Dashboard Preview
echo ==========================================
echo.
echo Checking Node.js and npm...
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo ERROR: Node.js was not found.
  echo Install Node.js LTS 20 or 22 from https://nodejs.org/
  echo.
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo.
  echo ERROR: npm was not found.
  echo Reinstall Node.js LTS 20 or 22 from https://nodejs.org/
  echo.
  pause
  exit /b 1
)

echo Node version:
node -v
echo npm version:
call npm -v
if errorlevel 1 (
  echo.
  echo ERROR: npm exists but is not running correctly on this machine.
  echo Try installing Node.js LTS 20 or 22, then run this file again.
  echo.
  echo Opening static preview instead...
  start "" "%~dp0OPEN_STATIC_PREVIEW.html"
  pause
  exit /b 1
)
echo.

echo Cleaning old install files that can break Windows preview...
if exist package-lock.json del /f /q package-lock.json
if exist npm-shrinkwrap.json del /f /q npm-shrinkwrap.json
set NPM_CONFIG_REGISTRY=https://registry.npmjs.org/
set NPM_CONFIG_AUDIT=false
set NPM_CONFIG_FUND=false

echo.
echo Installing packages from public npm registry...
echo This can take a few minutes on first run.
echo.
call npm install --registry=https://registry.npmjs.org/ --no-audit --no-fund --legacy-peer-deps
if errorlevel 1 (
  echo.
  echo First install failed. Cleaning npm cache and retrying once...
  call npm cache clean --force
  call npm install --registry=https://registry.npmjs.org/ --no-audit --no-fund --legacy-peer-deps
)
if errorlevel 1 (
  echo.
  echo npm install is still failing on this Windows/npm installation.
  echo.
  echo Opening static preview instead, so you can still view the app now.
  start "" "%~dp0OPEN_STATIC_PREVIEW.html"
  echo.
  echo To fix live preview later, install Node.js LTS 20 or 22 from https://nodejs.org/
  echo Then run START_DASHBOARD_WINDOWS.bat again.
  echo.
  pause
  exit /b 1
)

echo.
echo Starting local preview...
echo Open the Vite localhost link it shows, usually http://127.0.0.1:5173/
echo Keep this window open while previewing.
echo.
call npm run dev

echo.
echo Preview stopped.
pause
