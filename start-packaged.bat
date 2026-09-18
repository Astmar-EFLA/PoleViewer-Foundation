@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

set "REPO_ROOT=%~dp0"
set "BACKEND_DIR=%REPO_ROOT%backend"
set "FRONTEND_DIR=%REPO_ROOT%frontend"
set "CONDA_ENV_NAME=pole-viewer-backend"

:: Single-process ("packaged") mode -- see docs/architecture/ADR-011-packaging-strategy.md.
:: Builds the frontend once, then runs only the backend, which serves the
:: build directly at "/". One process, one port, no CORS -- closer to what
:: someone just opening the tool (not developing it) should have to deal with.
::
:: This script makes no assumption about *where* Node or conda live on this
:: machine -- it looks for them on PATH first (the normal case after
:: following backend/README.md's setup and installing Node normally), and
:: only falls back to NODE_DIR/CONDA_EXE if you've set those yourself
:: (e.g. a portable, not-on-PATH install, same as this machine's own setup).

:: --- Locate npm -------------------------------------------------------
set "NPM_CMD="
where npm >nul 2>nul
if %errorlevel%==0 (
    set "NPM_CMD=npm"
) else if defined NODE_DIR (
    if exist "%NODE_DIR%\npm.cmd" (
        set "PATH=%NODE_DIR%;%PATH%"
        set "NPM_CMD=npm"
    )
)
if not defined NPM_CMD (
    echo Could not find npm on PATH.
    echo Install Node.js from https://nodejs.org, or if you have a portable
    echo install, set NODE_DIR to its folder before running this script, e.g.:
    echo   set NODE_DIR=C:\path\to\node-v24.19.0-win-x64
    pause
    exit /b 1
)

:: --- Locate conda -------------------------------------------------------
set "CONDA_CMD="
where conda >nul 2>nul
if %errorlevel%==0 (
    set "CONDA_CMD=conda"
) else if defined CONDA_EXE (
    if exist "%CONDA_EXE%" (
        set "CONDA_CMD=%CONDA_EXE%"
    )
)
if not defined CONDA_CMD (
    echo Could not find conda on PATH.
    echo Set up the backend per backend/README.md first ^(Miniforge/conda, then
    echo   conda env create -f backend/environment.yml^), or if conda is
    echo installed but not on PATH, set CONDA_EXE to its full path first, e.g.:
    echo   set CONDA_EXE=C:\path\to\miniforge3\Scripts\conda.exe
    pause
    exit /b 1
)

"%CONDA_CMD%" env list | findstr /c:"%CONDA_ENV_NAME%" >nul
if errorlevel 1 (
    echo Could not find a conda environment named "%CONDA_ENV_NAME%".
    echo Run this once first: conda env create -f backend\environment.yml
    pause
    exit /b 1
)

set "WORKSPACE_ROOT_FILE=%REPO_ROOT%workspace-root.local.txt"
if exist "%WORKSPACE_ROOT_FILE%" (
    for /f "usebackq delims=" %%A in (`powershell -NoProfile -Command "(Get-Content -Raw -Encoding UTF8 -LiteralPath '%WORKSPACE_ROOT_FILE%').Trim()"`) do set "POLE_VIEWER_WORKSPACE_ROOT=%%A"
    echo Using workspace root from workspace-root.local.txt:
    echo   !POLE_VIEWER_WORKSPACE_ROOT!
)

echo Building frontend (this can take a moment)...
pushd "%FRONTEND_DIR%"
call %NPM_CMD% run build
if errorlevel 1 (
    echo Frontend build failed -- see errors above.
    popd
    pause
    exit /b 1
)
popd

echo.
echo Starting backend (serving the built frontend) on http://127.0.0.1:8100 ...
start "Pole Viewer (packaged)" cmd /k "cd /d %BACKEND_DIR% && "%CONDA_CMD%" run -n %CONDA_ENV_NAME% --no-capture-output uvicorn app.main:app --port 8100"

timeout /t 3 /nobreak >nul
start "" http://127.0.0.1:8100

echo.
echo One process, one port: http://127.0.0.1:8100
echo Close its window (or press Ctrl+C inside it) to stop it.
echo This launcher window can be closed any time -- it does not need to stay open.

pause
