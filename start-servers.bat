@echo off
chcp 65001 >nul
setlocal

set "REPO_ROOT=%~dp0"
set "BACKEND_DIR=%REPO_ROOT%backend"
set "FRONTEND_DIR=%REPO_ROOT%frontend"
set "UVICORN=C:\Users\astmar\dev\tools\miniforge3\envs\pole-viewer-backend\Scripts\uvicorn.exe"
set "NODE_DIR=C:\Users\astmar\dev\tools\node-v24.19.0-win-x64"

if not exist "%UVICORN%" (
    echo Could not find uvicorn at %UVICORN%
    echo Check that the pole-viewer-backend conda environment still exists there.
    pause
    exit /b 1
)

if not exist "%NODE_DIR%\npm.cmd" (
    echo Could not find npm at %NODE_DIR%
    echo Check that the portable Node install is still at that path.
    pause
    exit /b 1
)

:: Choose the backend's file workspace (the folder the line CSV's .pol /
:: .las paths must be inside) in a small window listing recently used
:: folders -- scripts\choose-workspace.ps1. It writes the choice to
:: workspace-root.local.txt next to this script (gitignored: it names a
:: real folder on this machine); "Default" removes it, so the backend uses
:: backend\workspace. Run with /nopick to skip the window and reuse the
:: last choice.
if /i not "%~1"=="/nopick" (
    powershell -NoProfile -STA -ExecutionPolicy Bypass -File "%REPO_ROOT%scripts\choose-workspace.ps1" -RepoRoot "%REPO_ROOT%." >nul
    if errorlevel 1 (
        echo Cancelled -- nothing started.
        exit /b 1
    )
)
set "WORKSPACE_ROOT_FILE=%REPO_ROOT%workspace-root.local.txt"
if exist "%WORKSPACE_ROOT_FILE%" (
    :: cmd's own `set /p` reads through the console's ANSI code page and
    :: mangles non-ASCII characters (this file's path has Icelandic
    :: letters) -- delegating the read to PowerShell with an explicit
    :: UTF8 encoding is what actually round-trips correctly.
    for /f "usebackq delims=" %%A in (`powershell -NoProfile -Command "(Get-Content -Raw -Encoding UTF8 -LiteralPath '%WORKSPACE_ROOT_FILE%').Trim()"`) do set "POLE_VIEWER_WORKSPACE_ROOT=%%A"
    echo Using workspace root from workspace-root.local.txt:
    echo   %POLE_VIEWER_WORKSPACE_ROOT%
)

echo Starting backend (FastAPI/uvicorn) on http://127.0.0.1:8100 ...
start "Pole Viewer - backend" cmd /k "cd /d %BACKEND_DIR% && %UVICORN% app.main:app --port 8100"

echo Starting frontend (Vite) on http://localhost:5173 ...
start "Pole Viewer - frontend" cmd /k "cd /d %FRONTEND_DIR% && set PATH=%NODE_DIR%;%PATH% && npm run dev"

echo.
echo Both servers are starting, each in its own window:
echo   Backend:  http://127.0.0.1:8100
echo   Frontend: http://localhost:5173
echo.
echo Close a server's window (or press Ctrl+C inside it) to stop it.
echo This launcher window can be closed any time -- it does not need to stay open.

timeout /t 4 /nobreak >nul
start "" http://localhost:5173

pause
