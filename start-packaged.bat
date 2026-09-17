@echo off
chcp 65001 >nul
setlocal

set "REPO_ROOT=%~dp0"
set "BACKEND_DIR=%REPO_ROOT%backend"
set "FRONTEND_DIR=%REPO_ROOT%frontend"
set "UVICORN=C:\Users\astmar\dev\tools\miniforge3\envs\pole-viewer-backend\Scripts\uvicorn.exe"
set "NODE_DIR=C:\Users\astmar\dev\tools\node-v24.19.0-win-x64"

:: Single-process ("packaged") mode -- see docs/architecture/ADR-011-packaging-strategy.md.
:: Builds the frontend once, then runs only the backend, which serves the
:: build directly at "/". One process, one port, no CORS -- closer to what
:: someone just opening the tool (not developing it) should have to deal with.

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

set "WORKSPACE_ROOT_FILE=%REPO_ROOT%workspace-root.local.txt"
if exist "%WORKSPACE_ROOT_FILE%" (
    for /f "usebackq delims=" %%A in (`powershell -NoProfile -Command "(Get-Content -Raw -Encoding UTF8 -LiteralPath '%WORKSPACE_ROOT_FILE%').Trim()"`) do set "POLE_VIEWER_WORKSPACE_ROOT=%%A"
    echo Using workspace root from workspace-root.local.txt:
    echo   %POLE_VIEWER_WORKSPACE_ROOT%
)

echo Building frontend (this can take a moment)...
pushd "%FRONTEND_DIR%"
set "PATH=%NODE_DIR%;%PATH%"
call npm run build
if errorlevel 1 (
    echo Frontend build failed -- see errors above.
    popd
    pause
    exit /b 1
)
popd

echo.
echo Starting backend (serving the built frontend) on http://127.0.0.1:8100 ...
start "Pole Viewer (packaged)" cmd /k "cd /d %BACKEND_DIR% && %UVICORN% app.main:app --port 8100"

timeout /t 3 /nobreak >nul
start "" http://127.0.0.1:8100

echo.
echo One process, one port: http://127.0.0.1:8100
echo Close its window (or press Ctrl+C inside it) to stop it.
echo This launcher window can be closed any time -- it does not need to stay open.

pause
