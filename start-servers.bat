@echo off
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
