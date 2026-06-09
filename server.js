'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 8787);
const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const DOWNLOAD_DIR = path.join(ROOT_DIR, 'downloads');
const MAX_BODY_BYTES = 1024 * 1024;
const JOB_TTL_MS = 1000 * 60 * 60 * 6;

fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

const jobs = new Map();

function json(res, status, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
}

function text(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Body request terlalu besar. Jangan upload gajah lewat lubang jarum.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8') || '{}';
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Body JSON tidak valid.'));
      }
    });

    req.on('error', reject);
  });
}

function isAllowedYoutubeUrl(input) {
  try {
    const url = new URL(String(input || '').trim());
    if (!['http:', 'https:'].includes(url.protocol)) return false;

    const host = url.hostname.toLowerCase();
    return host === 'youtu.be' ||
      host === 'youtube.com' ||
      host === 'www.youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'music.youtube.com';
  } catch {
    return false;
  }
}

function safeJobId() {
  return crypto.randomBytes(10).toString('hex');
}

function resolveBinary(name) {
  const override = process.env[name === 'yt-dlp' ? 'YTDLP_PATH' : 'FFMPEG_PATH'];
  return override && override.trim() ? override.trim() : name;
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: ROOT_DIR,
      shell: false,
      windowsHide: true,
      ...options
    });

    let stdout = '';
    let stderr = '';
    let done = false;
    const timeout = options.timeoutMs ? setTimeout(() => {
      if (!done) {
        child.kill('SIGKILL');
      }
    }, options.timeoutMs) : null;

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      done = true;
      if (timeout) clearTimeout(timeout);
      resolve({ ok: false, code: -1, stdout, stderr: stderr || error.message });
    });

    child.on('close', (code) => {
      done = true;
      if (timeout) clearTimeout(timeout);
      resolve({ ok: code === 0, code, stdout, stderr });
    });
  });
}

async function checkTool(command, versionArgs) {
  const result = await runCommand(command, versionArgs, { timeoutMs: 6000 });
  const firstLine = (result.stdout || result.stderr || '').split(/\r?\n/).find(Boolean) || '';
  return {
    ok: result.ok,
    command,
    version: firstLine.trim(),
    error: result.ok ? '' : (result.stderr || 'Tidak terdeteksi di PATH.')
  };
}

function compactVideoInfo(data) {
  const thumbnails = Array.isArray(data.thumbnails) ? data.thumbnails : [];
  const bestThumb = thumbnails
    .filter((item) => item && item.url)
    .sort((a, b) => Number(b.width || 0) - Number(a.width || 0))[0];

  const formats = Array.isArray(data.formats) ? data.formats : [];
  const heights = [...new Set(
    formats
      .map((item) => Number(item.height || 0))
      .filter((height) => height > 0)
  )].sort((a, b) => b - a);

  return {
    id: data.id || '',
    title: data.title || 'Tanpa judul',
    channel: data.uploader || data.channel || 'Unknown channel',
    duration: Number(data.duration || 0),
    viewCount: Number(data.view_count || 0),
    uploadDate: data.upload_date || '',
    webpageUrl: data.webpage_url || '',
    thumbnail: bestThumb ? bestThumb.url : (data.thumbnail || ''),
    description: data.description ? String(data.description).slice(0, 320) : '',
    qualities: heights.slice(0, 12),
    warning: data.is_live ? 'Video live/streaming tidak selalu bisa didownload normal.' : ''
  };
}

function qualitySelector(mode, quality) {
  if (mode === 'audio') return 'bestaudio/best';

  if (quality === 'best') {
    return 'bv*+ba/best';
  }

  const height = Number(quality || 720);
  if (![2160, 1440, 1080, 720, 480, 360, 240].includes(height)) {
    return 'bv*[height<=720]+ba/b[height<=720]/best';
  }

  return `bv*[height<=${height}]+ba/b[height<=${height}]/best`;
}

function createDownloadJob({ url, mode, quality, subtitle }) {
  const id = safeJobId();
  const createdAt = Date.now();
  const folder = path.join(DOWNLOAD_DIR, id);
  fs.mkdirSync(folder, { recursive: true });

  const job = {
    id,
    createdAt,
    status: 'queued',
    progress: 0,
    speed: '',
    eta: '',
    mode,
    quality,
    subtitle: Boolean(subtitle),
    url,
    logs: [],
    error: '',
    filePath: '',
    fileName: '',
    childPid: null
  };

  jobs.set(id, job);
  startDownload(job, folder);
  return job;
}

function pushLog(job, line) {
  const clean = String(line || '').replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '').trim();
  if (!clean) return;

  if (clean.includes('[download]') || clean.includes('[Merger]') || clean.includes('[ExtractAudio]') || clean.includes('[Metadata]') || clean.includes('[VideoConvertor]')) {
    job.logs.push(clean);
    if (job.logs.length > 80) job.logs.shift();
  }

  const percentMatch = clean.match(/(\d{1,3}(?:\.\d+)?)%/);
  if (percentMatch) {
    const value = Math.max(0, Math.min(100, Number(percentMatch[1])));
    if (!Number.isNaN(value)) job.progress = value;
  }

  const speedMatch = clean.match(/at\s+([^\s]+\/s)/i);
  if (speedMatch) job.speed = speedMatch[1];

  const etaMatch = clean.match(/ETA\s+([^\s]+)/i);
  if (etaMatch) job.eta = etaMatch[1];
}

function findOutputFile(folder) {
  if (!fs.existsSync(folder)) return '';
  const files = fs.readdirSync(folder)
    .map((name) => path.join(folder, name))
    .filter((file) => fs.statSync(file).isFile())
    .filter((file) => !file.endsWith('.part') && !file.endsWith('.ytdl'))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  return files[0] || '';
}

function startDownload(job, folder) {
  const ytdlp = resolveBinary('yt-dlp');
  const output = path.join(folder, '%(title).80s-%(id)s.%(ext)s');
  const args = [
    '--newline',
    '--no-playlist',
    '--windows-filenames',
    '--restrict-filenames',
    '--output', output,
    '--format', qualitySelector(job.mode, job.quality)
  ];

  if (job.mode === 'audio') {
    args.push('--extract-audio', '--audio-format', 'mp3', '--audio-quality', '0');
  } else {
    args.push('--merge-output-format', 'mp4');
  }

  if (job.subtitle) {
    args.push('--write-subs', '--write-auto-subs', '--sub-langs', 'id,en', '--convert-subs', 'srt');
  }

  args.push(job.url);

  job.status = 'running';
  job.logs.push('Job dimulai. Kalau internet lelet, jangan salahkan tombolnya.');

  const child = spawn(ytdlp, args, {
    cwd: ROOT_DIR,
    shell: false,
    windowsHide: true,
    env: process.env
  });

  job.childPid = child.pid;

  child.stdout.on('data', (chunk) => {
    chunk.toString().split(/\r?\n/).forEach((line) => pushLog(job, line));
  });

  child.stderr.on('data', (chunk) => {
    chunk.toString().split(/\r?\n/).forEach((line) => pushLog(job, line));
  });

  child.on('error', (error) => {
    job.status = 'error';
    job.error = `Gagal menjalankan yt-dlp: ${error.message}`;
    job.logs.push(job.error);
  });

  child.on('close', (code) => {
    job.childPid = null;
    const file = findOutputFile(folder);

    if (code === 0 && file) {
      job.status = 'done';
      job.progress = 100;
      job.filePath = file;
      job.fileName = path.basename(file);
      job.logs.push('Selesai. File siap didownload. Akhirnya mesin menang sekali.');
    } else if (job.status !== 'error') {
      job.status = 'error';
      job.error = `yt-dlp berhenti dengan kode ${code}. Coba URL lain, update yt-dlp, atau cek FFmpeg.`;
      job.logs.push(job.error);
    }
  });
}

function publicJob(job) {
  return {
    id: job.id,
    status: job.status,
    progress: Math.round(job.progress * 10) / 10,
    speed: job.speed,
    eta: job.eta,
    mode: job.mode,
    quality: job.quality,
    logs: job.logs.slice(-24),
    error: job.error,
    fileName: job.fileName,
    downloadUrl: job.status === 'done' ? `/api/jobs/${job.id}/file` : ''
  };
}

function cleanupOldJobs() {
  const now = Date.now();
  for (const [id, job] of jobs.entries()) {
    if (now - job.createdAt < JOB_TTL_MS) continue;
    jobs.delete(id);
    const folder = path.join(DOWNLOAD_DIR, id);
    fs.rm(folder, { recursive: true, force: true }, () => {});
  }
}

setInterval(cleanupOldJobs, 1000 * 60 * 30).unref();

function mimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
  }[ext] || 'application/octet-stream';
}

function serveStatic(req, res) {
  const parsed = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const requested = decodeURIComponent(parsed.pathname === '/' ? '/index.html' : parsed.pathname);
  const normalized = path.normalize(requested).replace(/^([.][.][\/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, normalized);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    text(res, 403, 'Forbidden');
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      text(res, 404, 'File tidak ditemukan. Bahkan servernya ikut bingung.');
      return;
    }

    res.writeHead(200, {
      'Content-Type': mimeType(filePath),
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff'
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

async function handleApi(req, res) {
  const parsed = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsed.pathname;

  try {
    if (req.method === 'GET' && pathname === '/api/health') {
      const [ytdlp, ffmpeg] = await Promise.all([
        checkTool(resolveBinary('yt-dlp'), ['--version']),
        checkTool(resolveBinary('ffmpeg'), ['-version'])
      ]);
      json(res, 200, {
        ok: ytdlp.ok,
        node: process.version,
        port: PORT,
        tools: { ytdlp, ffmpeg },
        note: ytdlp.ok ? 'Backend siap.' : 'yt-dlp belum terdeteksi. Install dulu, boss kecil.'
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/info') {
      const body = await readBody(req);
      const url = String(body.url || '').trim();

      if (!isAllowedYoutubeUrl(url)) {
        json(res, 400, { ok: false, message: 'Masukkan URL YouTube yang valid.' });
        return;
      }

      const result = await runCommand(resolveBinary('yt-dlp'), [
        '--dump-single-json',
        '--no-warnings',
        '--skip-download',
        '--no-playlist',
        url
      ], { timeoutMs: 30000 });

      if (!result.ok) {
        json(res, 500, {
          ok: false,
          message: 'Gagal mengambil info video. Update yt-dlp atau cek URL-nya.',
          detail: result.stderr.slice(-1200)
        });
        return;
      }

      const data = JSON.parse(result.stdout);
      json(res, 200, { ok: true, video: compactVideoInfo(data) });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/jobs') {
      const body = await readBody(req);
      const url = String(body.url || '').trim();
      const mode = body.mode === 'audio' ? 'audio' : 'video';
      const quality = String(body.quality || '720');
      const subtitle = Boolean(body.subtitle);

      if (!isAllowedYoutubeUrl(url)) {
        json(res, 400, { ok: false, message: 'Masukkan URL YouTube yang valid.' });
        return;
      }

      const activeJobs = [...jobs.values()].filter((job) => ['queued', 'running'].includes(job.status)).length;
      if (activeJobs >= 3) {
        json(res, 429, { ok: false, message: 'Terlalu banyak download aktif. Server kecil ini bukan pabrik baja.' });
        return;
      }

      const job = createDownloadJob({ url, mode, quality, subtitle });
      json(res, 201, { ok: true, job: publicJob(job) });
      return;
    }

    const jobMatch = pathname.match(/^\/api\/jobs\/([a-f0-9]{20})$/);
    if (req.method === 'GET' && jobMatch) {
      const job = jobs.get(jobMatch[1]);
      if (!job) {
        json(res, 404, { ok: false, message: 'Job tidak ditemukan atau sudah dibersihkan.' });
        return;
      }
      json(res, 200, { ok: true, job: publicJob(job) });
      return;
    }

    const fileMatch = pathname.match(/^\/api\/jobs\/([a-f0-9]{20})\/file$/);
    if (req.method === 'GET' && fileMatch) {
      const job = jobs.get(fileMatch[1]);
      if (!job || job.status !== 'done' || !job.filePath || !fs.existsSync(job.filePath)) {
        json(res, 404, { ok: false, message: 'File belum siap atau sudah hilang.' });
        return;
      }

      const stat = fs.statSync(job.filePath);
      const encoded = encodeURIComponent(job.fileName).replace(/['()]/g, escape).replace(/\*/g, '%2A');
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': stat.size,
        'Content-Disposition': `attachment; filename="${job.fileName.replace(/["\\]/g, '_')}"; filename*=UTF-8''${encoded}`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      });
      fs.createReadStream(job.filePath).pipe(res);
      return;
    }

    if (req.method === 'DELETE' && pathname === '/api/jobs') {
      let removed = 0;
      for (const [id, job] of jobs.entries()) {
        if (job.childPid) continue;
        jobs.delete(id);
        fs.rm(path.join(DOWNLOAD_DIR, id), { recursive: true, force: true }, () => {});
        removed += 1;
      }
      json(res, 200, { ok: true, removed });
      return;
    }

    json(res, 404, { ok: false, message: 'API tidak ditemukan.' });
  } catch (error) {
    json(res, 500, { ok: false, message: error.message || 'Server error.' });
  }
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    handleApi(req, res);
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`DATZON YouTube Web jalan di http://localhost:${PORT}`);
  console.log('Butuh yt-dlp dan FFmpeg di PATH. Jangan lupa, mesin bukan dukun.');
});
