@echo off
title Booking System
color 0B

echo ===============================================
echo    Booking System
echo ===============================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed!
    echo.
    echo Please install Node.js first:
    echo   1. Go to https://nodejs.org
    echo   2. Download the LTS version
    echo   3. Run the installer
    echo   4. Restart your computer
    echo   5. Double-click this file again
    echo.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo [First time setup] Installing dependencies...
    echo This will take about 1 minute.
    echo.
    call npm install --production
    if %errorlevel% neq 0 (
        echo.
        echo [ERROR] Installation failed. Check your internet connection.
        pause
        exit /b 1
    )
    echo.
)

echo Starting server...
echo.
node server.js

echo.
pause
