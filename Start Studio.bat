@echo off
rem Double-click to open CountriesIRL Studio on this PC: starts the
rem Downloader's helper (unless it is already running, which it is once
rem Windows has started it), starts the studio, and opens it in the browser.
cd /d "%~dp0"
if not exist node_modules (
  echo Installing the studio for the first time...
  call npm install
)
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 5199 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if errorlevel 1 start "CountriesIRL Studio - helper" cmd /k node helper\server.mjs
start "" http://localhost:5173
npm run dev
