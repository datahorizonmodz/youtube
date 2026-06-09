'use strict';

const $ = (selector) => document.querySelector(selector);

const state = {
  url: '',
  video: null,
  jobId: '',
  poller: null
};

const icons = {
  ok: '<svg viewBox="0 0 24 24" fill="none"><path d="m5 12 4 4L19 6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 8v5m0 4h.01" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M10.3 4.7 2.8 18a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 4.7a2 2 0 0 0-3.4 0Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  server: '<svg viewBox="0 0 24 24" fill="none"><path d="M5 5h14v6H5V5Zm0 8h14v6H5v-6Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8 8h.01M8 16h.01" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
  node: '<svg viewBox="0 0 24 24" fill="none"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 10.2v3.6L12 15l3-1.2v-3.6L12 9l-3 1.2Z" fill="currentColor"/></svg>',
  media: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7Z" stroke="currentColor" stroke-width="2"/><path d="m10 9 5 3-5 3V9Z" fill="currentColor"/></svg>'
};

function toast(message) {
  const box = $('#toast');
  box.textContent = message;
  box.classList.add('show');
  clearTimeout(box.timer);
  box.timer = setTimeout(() => box.classList.remove('show'), 3200);
}

function setBusy(button, busy, text) {
  if (!button) return;
  button.disabled = busy;
  button.dataset.oldText = button.dataset.oldText || button.querySelector('span')?.textContent || button.textContent;
  const span = button.querySelector('span');
  if (span) span.textContent = busy ? text : button.dataset.oldText;
  button.style.opacity = busy ? '.72' : '1';
}

function secondsToTime(seconds) {
  const value = Number(seconds || 0);
  if (!value) return '00:00';
  const h = Math.floor(value / 3600);
  const m = Math.floor((value % 3600) / 60);
  const s = Math.floor(value % 60);
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatViews(value) {
  const number = Number(value || 0);
  if (!number) return '0 views';
  return `${new Intl.NumberFormat('id-ID', { notation: 'compact' }).format(number)} views`;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.message || data.detail || 'Request gagal. Servernya lagi drama.');
  }
  return data;
}

function healthCard(title, subtitle, icon, ok) {
  return `
    <article class="mini-card">
      <span class="mini-icon" style="color:${ok ? 'var(--green)' : 'var(--yellow)'}">${icon}</span>
      <div>
        <b>${title}</b>
        <small>${subtitle}</small>
      </div>
    </article>
  `;
}

async function checkHealth() {
  const target = $('#healthCards');
  try {
    const data = await api('/api/health');
    const ytdlp = data.tools?.ytdlp;
    const ffmpeg = data.tools?.ffmpeg;
    target.innerHTML = [
      healthCard('Backend', data.ok ? 'Server aktif' : 'Server aktif, tool kurang', icons.server, true),
      healthCard('yt-dlp', ytdlp?.ok ? `Versi ${ytdlp.version}` : 'Belum terdeteksi', ytdlp?.ok ? icons.ok : icons.warn, Boolean(ytdlp?.ok)),
      healthCard('FFmpeg', ffmpeg?.ok ? 'Terdeteksi' : 'Belum terdeteksi', ffmpeg?.ok ? icons.media : icons.warn, Boolean(ffmpeg?.ok))
    ].join('');
    if (!ytdlp?.ok) toast('yt-dlp belum terdeteksi. Install dulu biar download bisa jalan.');
  } catch (error) {
    target.innerHTML = healthCard('Backend', 'Tidak bisa konek ke API', icons.warn, false);
    toast(error.message);
  }
}

function renderVideo(video) {
  state.video = video;
  $('#resultCard').classList.remove('hidden');
  $('#videoThumb').src = video.thumbnail || '';
  $('#videoTitle').textContent = video.title || 'Tanpa judul';
  $('#videoChannel').textContent = video.channel || 'Unknown channel';
  $('#videoDuration').textContent = secondsToTime(video.duration);
  $('#videoViews').textContent = formatViews(video.viewCount);
  $('#videoDesc').textContent = video.description || 'Tidak ada deskripsi singkat.';

  const qualitySelect = $('#qualitySelect');
  const defaultOptions = ['best', '1080', '720', '480', '360'];
  const found = Array.isArray(video.qualities) ? video.qualities.map(String) : [];
  const values = [...new Set([...defaultOptions, ...found])];
  qualitySelect.innerHTML = values.map((value) => {
    const label = value === 'best' ? 'Best Available' : `${value}p`;
    const selected = value === '720' ? ' selected' : '';
    return `<option value="${value}"${selected}>${label}</option>`;
  }).join('');

  $('#resultCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function fetchInfo(event) {
  event.preventDefault();
  const button = event.submitter;
  const url = $('#urlInput').value.trim();
  if (!url) return toast('URL-nya kosong. Tombol ini bukan paranormal.');

  state.url = url;
  setBusy(button, true, 'Mengecek...');
  try {
    const data = await api('/api/info', {
      method: 'POST',
      body: JSON.stringify({ url })
    });
    renderVideo(data.video);
    localStorage.setItem('lastYoutubeUrl', url);
    toast('Info video berhasil diambil.');
  } catch (error) {
    toast(error.message);
  } finally {
    setBusy(button, false);
  }
}

function updateQualityVisibility() {
  const mode = $('#modeSelect').value;
  $('#qualityWrap').classList.toggle('hidden', mode === 'audio');
}

async function startJob(event) {
  event.preventDefault();
  if (!state.url) return toast('Cek video dulu sebelum download. Urutan hidup kadang perlu dipatuhi.');

  const button = event.submitter;
  const mode = $('#modeSelect').value;
  const quality = $('#qualitySelect').value;
  const subtitle = $('#subtitleCheck').checked;

  setBusy(button, true, 'Memulai...');
  try {
    const data = await api('/api/jobs', {
      method: 'POST',
      body: JSON.stringify({ url: state.url, mode, quality, subtitle })
    });
    state.jobId = data.job.id;
    $('#jobCard').classList.remove('hidden');
    $('#fileDownloadBtn').classList.add('hidden');
    renderJob(data.job);
    pollJob();
    $('#jobCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    toast(error.message);
  } finally {
    setBusy(button, false);
  }
}

function renderJob(job) {
  $('#jobStatus').textContent = job.status;
  $('#progressText').textContent = `${job.progress || 0}%`;
  $('#speedText').textContent = [job.speed, job.eta ? `ETA ${job.eta}` : ''].filter(Boolean).join(' | ') || 'Memproses...';
  $('#progressBar').style.width = `${Math.max(0, Math.min(100, job.progress || 0))}%`;
  $('#logBox').textContent = Array.isArray(job.logs) && job.logs.length ? job.logs.join('\n') : 'Belum ada log.';

  if (job.status === 'done' && job.downloadUrl) {
    const btn = $('#fileDownloadBtn');
    btn.href = job.downloadUrl;
    btn.classList.remove('hidden');
    toast('Download selesai. Tombol file sudah muncul.');
  }

  if (job.status === 'error') {
    toast(job.error || 'Download gagal.');
  }
}

async function pollJob() {
  clearInterval(state.poller);
  if (!state.jobId) return;

  state.poller = setInterval(async () => {
    try {
      const data = await api(`/api/jobs/${state.jobId}`);
      renderJob(data.job);
      if (['done', 'error'].includes(data.job.status)) {
        clearInterval(state.poller);
      }
    } catch (error) {
      clearInterval(state.poller);
      toast(error.message);
    }
  }, 1200);
}

async function pasteUrl() {
  try {
    const text = await navigator.clipboard.readText();
    if (!text) return toast('Clipboard kosong. Kosongnya produktif sekali.');
    $('#urlInput').value = text.trim();
    toast('URL ditempel.');
  } catch {
    toast('Browser menolak akses clipboard. Paste manual aja, pejuang.');
  }
}

async function clearJobs() {
  try {
    const data = await api('/api/jobs', { method: 'DELETE' });
    toast(`${data.removed || 0} job lama dibersihkan.`);
  } catch (error) {
    toast(error.message);
  }
}

function init() {
  $('#infoForm').addEventListener('submit', fetchInfo);
  $('#downloadForm').addEventListener('submit', startJob);
  $('#pasteBtn').addEventListener('click', pasteUrl);
  $('#clearBtn').addEventListener('click', clearJobs);
  $('#modeSelect').addEventListener('change', updateQualityVisibility);

  const lastUrl = localStorage.getItem('lastYoutubeUrl');
  if (lastUrl) $('#urlInput').value = lastUrl;

  updateQualityVisibility();
  checkHealth();
}

document.addEventListener('DOMContentLoaded', init);
