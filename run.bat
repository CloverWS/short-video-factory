@echo off
chcp 65001 >nul
title Short Video Factory - 开发服务器

echo ========================================
echo   Short Video Factory 开发服务器启动
echo ========================================
echo.

:: 检查 node_modules 是否存在
if not exist "node_modules\" (
    echo [提示] 未检测到 node_modules，正在安装依赖...
    echo.
    call pnpm install
    if errorlevel 1 (
        echo.
        echo [错误] 依赖安装失败，请检查网络连接或 pnpm 是否正确安装
        pause
        exit /b 1
    )
    echo.
    echo [成功] 依赖安装完成！
    echo.
)

echo [启动] 正在启动开发服务器...
echo.
call pnpm dev

:: 如果服务器意外退出，保持窗口打开
echo.
echo [结束] 开发服务器已停止
pause
