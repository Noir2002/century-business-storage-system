@echo off
echo 🚀 开始部署到 Cloudflare Workers + R2
echo.

echo 📋 检查 Wrangler 登录状态...
wrangler whoami
if %errorlevel% neq 0 (
    echo ❌ 未登录 Cloudflare，正在启动登录流程...
    wrangler login
    if %errorlevel% neq 0 (
        echo ❌ 登录失败，请检查网络连接
        pause
        exit /b 1
    )
)

echo.
echo 🪣 创建 R2 存储桶（如果不存在）...
wrangler r2 bucket create century-business-system
echo 注意：如果存储桶已存在，上面的错误可以忽略

echo.
echo 📦 部署 Worker...
wrangler deploy
if %errorlevel% neq 0 (
    echo ❌ 部署失败
    pause
    exit /b 1
)

echo.
echo ✅ 部署完成！
echo.
echo 📝 下一步操作：
echo 1. 复制上面显示的 Worker URL
echo 2. 在 package-system.html 的 getBaseURL() 函数中更新域名
echo 3. 通过 Worker URL 访问您的系统
echo.
echo 🌐 访问示例：
echo https://your-worker-name.your-subdomain.workers.dev/package-system.html
echo.
pause
