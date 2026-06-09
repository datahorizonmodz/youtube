# DATZON YouTube Downloader Web

Website lokal untuk mengambil info dan mendownload video/audio YouTube dari URL. Project ini dibuat ulang sebagai web dari konsep aplikasi desktop di ZIP yang kamu kirim: ada frontend, backend, kualitas video, audio MP3, progress download, dan dukungan FFmpeg.

> Catatan waras: gunakan untuk konten milik sendiri, bebas lisensi, atau yang kamu punya izin download.

## Isi project

```txt
public/
  index.html   -> tampilan website
  app.css      -> style UI
  app.js       -> logic frontend
server.js      -> backend Node.js murni, tanpa package eksternal
package.json   -> script start
start-windows.bat
install-tools-windows.bat
start-linux-macos.sh
downloads/     -> hasil download otomatis masuk sini per job
```

## Syarat wajib

Install ini dulu:

1. Node.js
2. yt-dlp
3. FFmpeg

Backend ini memakai `yt-dlp` untuk mengambil info/download media dan FFmpeg untuk merge video+audio atau convert MP3.

## Cara jalan di Windows

1. Extract ZIP.
2. Buka folder project.
3. Kalau belum punya yt-dlp dan FFmpeg, klik dua kali:

```txt
install-tools-windows.bat
```

4. Setelah selesai, klik dua kali:

```txt
start-windows.bat
```

5. Buka browser:

```txt
http://localhost:8787
```

## Cara jalan manual lewat terminal

```bash
node server.js
```

atau:

```bash
npm start
```

Lalu buka:

```txt
http://localhost:8787
```

## Cara install tool manual

### Windows

Pakai winget:

```bash
winget install -e --id yt-dlp.yt-dlp
winget install -e --id Gyan.FFmpeg
```

### Linux Debian/Ubuntu

```bash
sudo apt update
sudo apt install nodejs npm ffmpeg python3-pip
python3 -m pip install -U yt-dlp
```

### macOS

```bash
brew install node yt-dlp ffmpeg
```

## Fitur

- Cek info video dari URL YouTube
- Thumbnail, judul, channel, durasi, views
- Download video MP4
- Pilih kualitas: Best, 1080p, 720p, 480p, 360p
- Download audio MP3
- Progress bar download
- Log proses download
- Tombol download file saat selesai
- Bersihkan job lama
- Backend tanpa dependency npm tambahan

## API

```txt
GET    /api/health
POST   /api/info
POST   /api/jobs
GET    /api/jobs/:id
GET    /api/jobs/:id/file
DELETE /api/jobs
```

## Kalau error

### `yt-dlp belum terdeteksi`

Install yt-dlp, lalu tutup dan buka ulang terminal.

### `FFmpeg belum terdeteksi`

Install FFmpeg dan pastikan masuk PATH.

### Video tidak bisa didownload

Kemungkinan:

- URL private/age restricted
- yt-dlp perlu update
- YouTube sedang mengubah sistem
- video live/premiere belum tersedia
- server tidak punya akses internet stabil

Update yt-dlp:

```bash
yt-dlp -U
```

atau jika install dari pip:

```bash
python3 -m pip install -U yt-dlp
```

## Deploy online

Project ini bisa dideploy ke VPS/Render/Railway/Cloud Run, tapi jangan berharap hosting static seperti Netlify/Vercel static bisa menjalankan download. Ini butuh backend yang bisa menjalankan proses `yt-dlp` dan FFmpeg.

Untuk produksi, tambahkan:

- login/admin limit
- rate limit per IP
- auto hapus file download lebih cepat
- storage eksternal kalau file besar
- validasi lebih ketat
- proxy/CDN kalau trafik besar

## Lisensi

Kode web ini MIT. Tool eksternal seperti yt-dlp dan FFmpeg punya lisensi masing-masing.

## Deploy-ready update

Versi ini sudah ditambah:

```txt
Dockerfile
.dockerignore
render.yaml
railway.json
DEPLOY.md
```

Untuk deploy publik, pakai Web Service berbasis Docker. Jangan pilih Static Site.
