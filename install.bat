@echo off
cd /d "%~dp0"
echo ============================================
echo   Agent Research MCP - Install
echo ============================================
echo.

echo [1/4] Installing npm dependencies...
call npm install
if %errorlevel% neq 0 (
    echo Error: npm install failed. Check that Node.js is installed.
    pause
    exit /b 1
)
echo.

echo [2/4] Installing Playwright Chromium browser...
call npx playwright install chromium
if %errorlevel% neq 0 (
    echo Error: Playwright browser install failed.
    pause
    exit /b 1
)
echo.

echo [3/4] Compiling TypeScript...
call npm run build
if %errorlevel% neq 0 (
    echo Error: Build failed.
    pause
    exit /b 1
)
echo.

echo [4/4] Install complete!
echo.
echo You can now double-click start-http.bat to start the server.
echo.
pause
