@echo off
setlocal

set PORT=8080
set HOST=0.0.0.0
set ROOT=%~dp0
set TOOLS_DIR=%ROOT%tools
set CLOUDFLARED=%TOOLS_DIR%\cloudflared.exe

echo ================================================
echo   SHADOW DEPTHS - PUBLIC HTTPS TUNNEL
echo ================================================
echo.
echo Google will NOT accept private LAN origins like:
echo   http://192.168.x.x:8080
echo.
echo This script creates a public HTTPS URL like:
echo   https://example.trycloudflare.com
echo.
echo Add that exact HTTPS origin to Google Cloud:
echo   Google Auth Platform ^> Clients ^> Authorized JavaScript origins
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "try { $r = Invoke-WebRequest -UseBasicParsing 'http://localhost:%PORT%/index.html' -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } } catch { exit 1 }"

if errorlevel 1 (
    echo Local server is not running. Starting it on http://localhost:%PORT% ...
    start "Shadow Depths Local Server" cmd /k "cd /d "%ROOT%" && python shadow_server.py --host %HOST% --port %PORT%"
    timeout /t 3 /nobreak >nul
) else (
    echo Local server is already running on http://localhost:%PORT%.
)

if not exist "%TOOLS_DIR%" mkdir "%TOOLS_DIR%"

if not exist "%CLOUDFLARED%" (
    echo.
    echo Downloading Cloudflare Tunnel client...
    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
        "$url='https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';" ^
        "$out='%CLOUDFLARED%';" ^
        "Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $out"
    if errorlevel 1 (
        echo Failed to download cloudflared.
        echo Download it manually from:
        echo https://github.com/cloudflare/cloudflared/releases/latest
        pause
        exit /b 1
    )
)

echo.
echo Starting public tunnel...
echo Look for the URL ending in .trycloudflare.com below.
echo Copy ONLY the origin, for example:
echo   https://example.trycloudflare.com
echo.
echo Do not include /index.html or any path.
echo Keep this window open while testing.
echo ================================================
echo.

"%CLOUDFLARED%" tunnel --url http://localhost:%PORT%

pause
