# Deploy DATZON YouTube Downloader Web

Project ini sudah siap deploy sebagai backend + frontend dalam satu service.
Jangan deploy sebagai static site, karena aplikasi butuh server Node.js yang bisa menjalankan yt-dlp dan FFmpeg.

## File penting deploy

- `Dockerfile` menginstall Node.js runtime, Python, FFmpeg, dan yt-dlp.
- `server.js` memakai `process.env.PORT`, jadi aman untuk Render/Railway/Koyeb/Cloud Run.
- `public/` berisi frontend.
- `downloads/` hanya penyimpanan sementara hasil job download.

## Opsi yang disarankan

### Render / Railway / Koyeb

1. Upload project ke GitHub.
2. Buat Web Service baru.
3. Pilih repo project ini.
4. Pastikan platform memakai Dockerfile.
5. Deploy.
6. Buka domain hasil deploy.

## Catatan produksi

- File download tersimpan sementara di folder `downloads/` server.
- Di hosting gratis, service bisa tidur dan storage bisa hilang saat redeploy.
- Datacenter IP kadang dibatasi oleh YouTube, jadi kalau gagal, coba update yt-dlp atau pindah provider.
- Jangan pakai untuk konten yang tidak kamu miliki atau tidak punya izin download.
