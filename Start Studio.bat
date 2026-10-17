@echo off
rem Double-click to open CountriesIRL Studio: starts the Downloader's helper
rem in its own window, starts the studio, and opens it in your browser.
cd /d "%~dp0"
if not exist node_modules (
  echo Installing the studio for the first time...
  call npm install
)
start "CountriesIRL Studio - helper" cmd /k node helper\server.mjs
start "" http://localhost:5173
npm run dev
