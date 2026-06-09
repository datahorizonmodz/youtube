@echo off
setlocal
cd /d "%~dp0"
echo.
echo ========================================
echo  DATZON YouTube Downloader Web
echo ========================================
echo.
echo Membuka server di http://localhost:8787
echo Pastikan Node.js, yt-dlp, dan FFmpeg sudah terinstall.
echo.
node server.js
pause
