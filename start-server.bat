@echo off
chcp 65001 >nul
echo.
echo ========================================
echo    数据管理系统 - 服务器启动脚本
echo ========================================
echo.

echo 正在启动服务器...
echo.

REM 检查Node.js是否安装
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ 错误：未检测到Node.js
    echo.
    echo 请先安装Node.js：
    echo 1. 访问 https://nodejs.org
    echo 2. 下载并安装LTS版本
    echo 3. 重新运行此脚本
    echo.
    pause
    exit /b 1
)

echo ✅ Node.js已安装
echo.

REM 检查依赖是否安装
if not exist "node_modules" (
    echo 📦 正在安装依赖包...
    npm install
    echo.
)

REM 获取本机IP地址
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    set "ip=%%a"
    goto :found_ip
)
:found_ip
set "ip=%ip: =%"

echo 🚀 启动服务器...
echo.
echo 📊 服务器信息：
echo   本地访问：http://localhost:3000
echo   局域网访问：http://%ip%:3000
echo.
echo 👥 默认账号：
echo   管理员：admin / 123456
echo   数据分析员：analyst / 123456
echo   编辑员工：editor1 / 123456
echo   查看员工：viewer / 123456
echo.
echo 💡 提示：
echo   - 同事可通过局域网地址访问
echo   - 按 Ctrl+C 停止服务器
echo   - 数据存储在 data/ 目录
echo.
echo ========================================
echo.

REM 启动服务器
node server.js

pause 