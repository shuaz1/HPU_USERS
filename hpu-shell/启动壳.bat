@echo off
rem HPU Campus Shell launcher - ASCII only, safe for any cmd codepage
cd /d "%~dp0"

set "ELECTRON=node_modules\electron\dist\electron.exe"
if exist "%ELECTRON%" goto run

echo Electron runtime not found. Installing dependencies, please wait...
call npm install --registry=https://registry.npmmirror.com --no-audit --no-fund
if errorlevel 1 goto fail
if not exist "%ELECTRON%" goto fail

:run
start "" "%ELECTRON%" .
exit /b 0

:fail
echo.
echo Install failed. Open a terminal in this folder and run:
echo     npm install
pause
exit /b 1
