@echo off
chcp 65001 >nul
title Short Video Factory - 项目打包

echo ========================================
echo   Short Video Factory 项目打包
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

echo [打包] 正在执行项目打包...
echo [提示] 打包过程可能需要几分钟，请耐心等待...
echo.

call pnpm build

if errorlevel 1 (
    echo.
    echo [错误] 打包失败，请检查错误信息
    pause
    exit /b 1
)

echo.
echo ========================================
echo   打包完成！
echo ========================================
echo.
echo 前端资源目录: dist
echo Electron编译目录: dist-electron
echo.
echo ★ 安装包输出目录: release\
echo   (exe安装包在 release\版本号\ 目录下)
echo.

:: 打开 release 目录
explorer release
pause

