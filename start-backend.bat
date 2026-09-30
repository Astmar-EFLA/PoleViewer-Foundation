@echo off
chcp 65001 >nul
setlocal

:: Restarts only the backend with a (re)chosen workspace folder -- for
:: switching between projects (e.g. a line on the O: drive and a local
:: copy on C:) without restarting the frontend. Pick the folder in the
:: window (scripts\choose-workspace.ps1); /nopick reuses the last choice.

set "REPO_ROOT=%~dp0"
set "BACKEND_DIR=%REPO_ROOT%backend"
set "UVICORN=C:\Users\astmar\dev\tools\miniforge3\envs\pole-viewer-backend\Scripts\uvicorn.exe"

if not exist "%UVICORN%" (
    echo Could not find uvicorn at %UVICORN%
    echo Check that the pole-viewer-backend conda environment still exists there.
    pause
    exit /b 1
)

if /i not "%~1"=="/nopick" (
    powershell -NoProfile -STA -ExecutionPolicy Bypass -File "%REPO_ROOT%scripts\choose-workspace.ps1" -RepoRoot "%REPO_ROOT%." >nul
    if errorlevel 1 (
        echo Cancelled -- the running backend was left as it was.
        exit /b 1
    )
)

set "POLE_VIEWER_WORKSPACE_ROOT="
set "WORKSPACE_ROOT_FILE=%REPO_ROOT%workspace-root.local.txt"
if exist "%WORKSPACE_ROOT_FILE%" (
    rem Read through PowerShell with explicit UTF8 -- cmd's own set /p mangles
    rem non-ASCII (Icelandic) characters in the path.
    for /f "usebackq delims=" %%A in (`powershell -NoProfile -Command "(Get-Content -Raw -Encoding UTF8 -LiteralPath '%WORKSPACE_ROOT_FILE%').Trim()"`) do set "POLE_VIEWER_WORKSPACE_ROOT=%%A"
)
if defined POLE_VIEWER_WORKSPACE_ROOT (
    echo Workspace: %POLE_VIEWER_WORKSPACE_ROOT%
) else (
    echo Workspace: default ^(backend\workspace^)
)

:: Stop whatever backend is listening on port 8100 (and its reloader parent) first.
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8100 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { $p = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $_.OwningProcess); if ($p.ParentProcessId) { Stop-Process -Id $p.ParentProcessId -Force -ErrorAction SilentlyContinue }; Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }; Start-Sleep -Milliseconds 700"

echo Starting backend on http://127.0.0.1:8100 ...
start "Pole Viewer - backend" cmd /k "cd /d %BACKEND_DIR% && %UVICORN% app.main:app --port 8100"
echo Done. The frontend (http://localhost:5173) keeps running -- reload its page.
timeout /t 3 /nobreak >nul
