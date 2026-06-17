@echo off
echo Starting Device Location Map App...
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install it from https://nodejs.org/en/download then reopen this file.
  pause
  exit /b 1
)
echo Installing dependencies if needed...
call npm install
echo.
echo Opening http://localhost:3000 ...
start http://localhost:3000
call npm start
pause
