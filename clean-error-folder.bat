@echo off
chcp 65001 >nul
echo.
echo ========================================
echo   清理 R2 错误文件夹 (package/package/)
echo ========================================
echo.
echo 正在启动清理脚本...
echo.

node clean-package-error.js

echo.
echo 按任意键退出...
pause >nul

