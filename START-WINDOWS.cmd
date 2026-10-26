@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24 LTS from https://nodejs.org/en/download first.
  echo Then reopen this file.
  pause
  exit /b 1
)
node -e "if (Number(process.versions.node.split('.')[0]) < 22) process.exit(1)"
if errorlevel 1 (
  echo This project needs Node.js 22 or later. Install Node.js 24 LTS.
  pause
  exit /b 1
)
if not exist node_modules (
  call npm.cmd ci
  if errorlevel 1 (
    echo Package installation failed. Check the error above and your connection.
    pause
    exit /b 1
  )
)
echo Open the Local address printed below in your browser.
call npm.cmd run dev
pause
