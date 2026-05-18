@echo off
title Lead Finder - Wigan Barbers & Hairdressers
color 0A

echo.
echo  Checking Python is installed...
python --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo  ERROR: Python is not installed!
    echo  Download it FREE from https://www.python.org/downloads/
    echo  Tick "Add Python to PATH" during install, then run this again.
    echo.
    pause
    exit /b 1
)

echo  Python found. Starting lead finder...
echo.
python find_leads.py
