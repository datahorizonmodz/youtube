@echo off
setlocal
echo.
echo ========================================
echo  Install Tools: yt-dlp + FFmpeg
echo ========================================
echo.
echo Script ini pakai winget bawaan Windows modern.
echo Kalau winget tidak ada, install manual dari dokumentasi resmi.
echo.
winget install -e --id yt-dlp.yt-dlp
winget install -e --id Gyan.FFmpeg
echo.
echo Selesai. Tutup terminal ini lalu buka start-windows.bat.
pause
