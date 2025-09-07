@echo off
REM 部署Cloudflare Worker脚本
echo 🚀 开始部署Century Business System Worker...

REM 检查wrangler是否安装
echo 📋 检查Wrangler CLI...
wrangler --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Wrangler CLI未安装，正在安装...
    npm install -g wrangler
) else (
    echo ✅ Wrangler CLI已安装
)

REM 登录检查
echo 🔐 检查登录状态...
wrangler whoami >nul 2>&1
if %errorlevel% neq 0 (
    echo ⚠️ 需要登录到Cloudflare，请运行: wrangler login
    pause
    exit /b 1
)

echo 🔧 开始部署Worker...
wrangler deploy

if %errorlevel% equ 0 (
    echo ✅ Worker部署成功！
    echo 📋 你的Worker URL应该是: https://century-business-system.anthonin815.workers.dev
    echo 💡 请测试健康检查: https://century-business-system.anthonin815.workers.dev/api/health
) else (
    echo ❌ Worker部署失败，请检查配置
)

pause
