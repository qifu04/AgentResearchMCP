@echo off
echo Killing any process on port 3100...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3100 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul
echo Starting HTTP server...
cd /d "%~dp0"
npm run start:http
pause
