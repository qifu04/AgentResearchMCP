@echo off
chcp 65001 >nul
echo ============================================
echo   Agent Research MCP - 首次安装
echo ============================================
echo.

cd /d "%~dp0"

echo [1/4] 安装 npm 依赖...
call npm install
if %errorlevel% neq 0 (
    echo 错误: npm install 失败，请检查 Node.js 是否已安装
    pause
    exit /b 1
)
echo.

echo [2/4] 安装 Playwright Chromium 浏览器...
call npx playwright install chromium
if %errorlevel% neq 0 (
    echo 错误: Playwright 浏览器安装失败
    pause
    exit /b 1
)
echo.

echo [3/4] 编译 TypeScript...
call npm run build
if %errorlevel% neq 0 (
    echo 错误: 编译失败
    pause
    exit /b 1
)
echo.

echo [4/4] 安装完成！
echo.
echo 现在可以双击 start-http.bat 启动服务器。
echo.
pause
