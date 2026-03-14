@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo 正在关闭占用 3100 端口的旧进程...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3100 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul

echo 启动 Agent Research MCP 服务器 (http://localhost:3100)...
echo 按 Ctrl+C 停止服务器
echo.
npm run start:http
pause
