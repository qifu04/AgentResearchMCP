@echo off
chcp 65001 >nul
cd /d "%~dp0"

if "%BROWSER_PROXY_MODE%"=="" if "%BROWSER_USE_SYSTEM_PROXY%"=="" set "BROWSER_PROXY_MODE=direct"

echo Closing any previous process that is listening on port 3100...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3100 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul

echo Starting Agent Research MCP on http://localhost:3100
if not "%BROWSER_PROXY_MODE%"=="" (
    echo Browser proxy mode: %BROWSER_PROXY_MODE%
) else (
    echo Browser proxy mode via BROWSER_USE_SYSTEM_PROXY=%BROWSER_USE_SYSTEM_PROXY%
)
echo Startup will block until provider login/export preflight succeeds.
echo Press Ctrl+C to stop.
echo.
npm run start:http
pause
