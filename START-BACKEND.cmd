@echo off
setlocal
cd /d "%~dp0"
if not exist "backend\.venv\Scripts\python.exe" (
  echo Install the backend first. See docs\BACKEND.md.
  pause
  exit /b 1
)
docker compose up -d --wait db
if errorlevel 1 (
  echo Start Docker Desktop and try again.
  pause
  exit /b 1
)
"backend\.venv\Scripts\python.exe" -m backend
pause
