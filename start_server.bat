@echo off
setlocal
echo ================================================
echo   SHADOW DEPTHS - LAN Test Server
echo ================================================
echo.
set PORT=8080
set HOST=0.0.0.0
set LAN_IP=

for /f "usebackq delims=" %%I in (`powershell -NoProfile -Command "$ip = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.PrefixOrigin -ne 'WellKnown' } | Select-Object -First 1 -ExpandProperty IPAddress; if(-not $ip){ $ip = (Get-CimInstance Win32_NetworkAdapterConfiguration | Where-Object { $_.IPEnabled } | ForEach-Object { $_.IPAddress } | Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+$' -and $_ -notlike '127.*' -and $_ -notlike '169.254.*' } | Select-Object -First 1) }; if($ip){ $ip }"` ) do (
    set LAN_IP=%%I
)

echo Local URL: http://localhost:%PORT%
if defined LAN_IP (
    echo LAN URL:   http://%LAN_IP%:%PORT%
) else (
    echo LAN URL:   http://YOUR_PC_IP:%PORT%
)
echo.
echo Use the LAN URL on phones/other PCs on the same network.
echo If connection fails, allow Python in Windows Firewall.
echo.
echo Google login note:
echo Google Cloud rejects private LAN origins like http://192.168.x.x:8080.
echo For Google login on other devices, use start_public_tunnel.bat and add
echo the generated https://*.trycloudflare.com origin in Google Cloud.
echo Press Ctrl+C to stop the server.
echo ================================================
cd /d "%~dp0"
python shadow_server.py --host %HOST% --port %PORT%
pause
