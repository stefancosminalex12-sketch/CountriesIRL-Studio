/* ==========================================================================
   CountriesIRL Studio — the downloader's helper
   --------------------------------------------------------------------------
   Browsers are not allowed to fetch videos from YouTube, TikTok, Instagram
   and the rest, so the studio's Downloader asks this small program to do it.
   It runs on your PC (npm run helper), hands each link to yt-dlp, and
   passes the finished file back to the studio.

   It answers only on this computer (127.0.0.1), and only to the studio's
   own addresses. Nothing here needs installing from npm — just Node, plus
   yt-dlp and ffmpeg (README.md says how to get them).
   ========================================================================== */

import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, statSync, createReadStream, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT) || 5199;
const HOST = '127.0.0.1';

/* The studio's addresses: the dev server on this PC, and the live site. */
const ALLOWED_ORIGINS = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'https://studio.countriesirl.com'
]);

const JOB_LIFETIME = 60 * 60 * 1000;     // finished files are kept for an hour
const WIN = process.platform === 'win32';
const here = dirname(fileURLToPath(import.meta.url));

/* --------------------------------------------------------------------------
   Finding yt-dlp and ffmpeg
   --------------------------------------------------------------------------
   helper/bin/ first (drop the .exe files there), then winget's own folder,
   then PATH.

   winget adds what it installs to PATH, but a program that was already
   running keeps the PATH it started with. So on Windows the PATH is read
   fresh from the system each time — an install is picked up without a
   restart, and yt-dlp, started from here, can find Deno (which it needs for
   YouTube) and ffmpeg too.
   -------------------------------------------------------------------------- */

function refreshPath() {
  if (!WIN) return;
  const read = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    "[Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')"],
  { encoding: 'utf8', windowsHide: true });
  if (read.status !== 0 || !read.stdout.trim()) return;
  const seen = new Set();
  const merged = [...read.stdout.trim().split(';'), ...(process.env.Path || process.env.PATH || '').split(';')]
    .filter((dir) => dir && !seen.has(dir.toLowerCase()) && seen.add(dir.toLowerCase()));
  process.env.Path = merged.join(';');
}

function findTool(name) {
  const file = WIN ? `${name}.exe` : name;
  const candidates = [join(here, 'bin', file)];
  if (WIN && process.env.LOCALAPPDATA) {
    candidates.push(join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links', file));
  }
  for (const path of candidates) if (existsSync(path)) return path;
  const found = spawnSync(WIN ? 'where' : 'which', [name], { encoding: 'utf8' });
  if (found.status === 0) return found.stdout.split(/\r?\n/)[0].trim() || null;
  return null;
}

function tools() {
  refreshPath();
  const ytdlp = findTool('yt-dlp');
  const ffmpeg = findTool('ffmpeg');
  let version = null;
  if (ytdlp) {
    const run = spawnSync(ytdlp, ['--version'], { encoding: 'utf8' });
    version = run.status === 0 ? run.stdout.trim() : null;
  }
  return { ytdlp, ffmpeg, version };
}

let found = tools();

/* --------------------------------------------------------------------------
   Jobs — one per download, polled by the studio for progress
   -------------------------------------------------------------------------- */

const jobs = new Map();

function sweep() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (job.status !== 'running' && now - job.created > JOB_LIFETIME) {
      rmSync(job.dir, { recursive: true, force: true });
      jobs.delete(id);
    }
  }
}
setInterval(sweep, 10 * 60 * 1000).unref();

function publicJob(job) {
  return {
    id: job.id, status: job.status, progress: job.progress, phase: job.phase,
    name: job.name, size: job.size, error: job.error
  };
}

/* The format choice for yt-dlp. Video prefers H.264 in an MP4, which every
   editor and phone plays; the height cap keeps it to what was picked. */
function formatArgs(kind, height, hasFfmpeg) {
  if (kind === 'audio') {
    return hasFfmpeg ? ['-f', 'ba/b', '-x', '--audio-format', 'mp3', '--audio-quality', '0'] : ['-f', 'ba[ext=m4a]/ba/b'];
  }
  /* Without ffmpeg, separate video and audio streams cannot be joined, so
     only formats that already carry both are any use. */
  if (!hasFfmpeg) return ['-f', 'b[ext=mp4]/b'];
  const res = height ? `res:${height}` : 'res';
  return ['-f', 'bv*+ba/b', '-S', `${res},vcodec:h264,acodec:m4a`, '--merge-output-format', 'mp4'];
}

function startJob(url, kind, height) {
  const id = randomUUID();
  const dir = mkdtempSync(join(tmpdir(), 'irl-studio-'));
  const job = { id, dir, status: 'running', progress: 0, phase: 'Starting', name: null, size: 0, error: null, file: null, created: Date.now() };
  jobs.set(id, job);

  const args = [
    '--no-playlist', '--newline', '--no-warnings', '--no-mtime',
    '--progress-template', 'download:@@%(progress._percent_str)s',
    '-o', join(dir, '%(title).80B [%(id)s].%(ext)s'),
    ...formatArgs(kind, height, !!found.ffmpeg),
    ...(found.ffmpeg ? ['--ffmpeg-location', dirname(found.ffmpeg)] : []),
    '--', url
  ];

  const child = spawn(found.ytdlp, args, { windowsHide: true });
  let errors = '';
  let parts = 0;

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    for (const line of chunk.split(/\r?\n/)) {
      const percent = /^@@\s*([\d.]+)%/.exec(line);
      if (percent) {
        job.progress = Math.min(100, Number(percent[1]));
        job.phase = parts > 1 ? 'Downloading audio' : 'Downloading';
      } else if (line.startsWith('[download] Destination')) {
        parts++;
      } else if (line.startsWith('[Merger]') || line.startsWith('[ExtractAudio]') || line.startsWith('[VideoConvertor]')) {
        job.phase = 'Finishing';
        job.progress = 100;
      }
    }
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { errors = (errors + chunk).slice(-4000); });

  child.on('close', (code) => {
    const files = readdirSync(dir)
      .filter((f) => !/\.(part|ytdl|temp)$/i.test(f))
      .map((f) => ({ f, size: statSync(join(dir, f)).size }))
      .sort((a, b) => b.size - a.size);
    if (code === 0 && files.length) {
      job.status = 'done';
      job.progress = 100;
      job.phase = 'Done';
      job.file = join(dir, files[0].f);
      job.name = files[0].f;
      job.size = files[0].size;
    } else {
      job.status = 'error';
      job.error = cleanError(errors) || 'The download did not finish.';
    }
  });
  child.on('error', (err) => {
    job.status = 'error';
    job.error = `yt-dlp could not start: ${err.message}`;
  });

  return job;
}

/* yt-dlp's last ERROR line, without its prefix, is the useful part. */
function cleanError(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.startsWith('ERROR:'));
  const last = lines[lines.length - 1] || '';
  return last.replace(/^ERROR:\s*(\[[^\]]+\]\s*)?([\w-]+:\s*)?/, '').trim();
}

/* --------------------------------------------------------------------------
   Looking a link up before downloading
   -------------------------------------------------------------------------- */

function lookUp(url) {
  return new Promise((resolve, reject) => {
    const child = spawn(found.ytdlp, ['-J', '--no-playlist', '--no-warnings', '--', url], { windowsHide: true });
    let out = '';
    let errors = '';
    const timer = setTimeout(() => child.kill(), 60000);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (c) => { out += c; });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (c) => { errors = (errors + c).slice(-4000); });
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(cleanError(errors) || 'That link could not be read.'));
      try {
        const info = JSON.parse(out);
        const heights = [...new Set((info.formats || [])
          .filter((f) => f.vcodec && f.vcodec !== 'none' && f.height)
          .map((f) => f.height))].sort((a, b) => b - a);
        resolve({
          title: info.title || info.description?.slice(0, 80) || 'Untitled',
          uploader: info.uploader || info.channel || info.creator || '',
          duration: info.duration || null,
          thumbnail: info.thumbnail || null,
          site: info.extractor_key || info.extractor || '',
          heights,
          hasVideo: heights.length > 0 || (info.vcodec && info.vcodec !== 'none')
        });
      } catch {
        reject(new Error('yt-dlp gave an answer that could not be read.'));
      }
    });
  });
}

/* --------------------------------------------------------------------------
   The web side
   -------------------------------------------------------------------------- */

const TYPES = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.mkv': 'video/x-matroska', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.jpg': 'image/jpeg', '.png': 'image/png' };

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Expose-Headers', 'X-Filename, Content-Length');
  }
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (c) => {
      body += c;
      if (body.length > 10000) { reject(new Error('Too large')); req.destroy(); }
    });
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('Not JSON')); } });
  });
}

function validUrl(text) {
  try {
    const url = new URL(String(text).trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.has(origin)) return send(res, 403, { ok: false, error: 'Not allowed from this site.' });
  cors(req, res);

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    /* Lets the live studio (a public https site) talk to this program on
       your own computer — Chrome asks for this permission explicitly. */
    if (req.headers['access-control-request-private-network']) {
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
    }
    res.writeHead(204);
    return res.end();
  }

  const path = new URL(req.url, `http://${HOST}`).pathname;

  try {
    if (req.method === 'GET' && path === '/health') {
      found = tools();
      return send(res, 200, { ok: true, ytdlp: found.version, ffmpeg: !!found.ffmpeg });
    }

    if (!found.ytdlp) {
      found = tools();
      if (!found.ytdlp) return send(res, 503, { ok: false, error: 'yt-dlp is not installed on this PC yet.' });
    }

    if (req.method === 'POST' && path === '/info') {
      const { url } = await readJson(req);
      const clean = validUrl(url);
      if (!clean) return send(res, 400, { ok: false, error: 'That is not a web link.' });
      return send(res, 200, { ok: true, info: await lookUp(clean) });
    }

    if (req.method === 'POST' && path === '/download') {
      const { url, kind, height } = await readJson(req);
      const clean = validUrl(url);
      if (!clean) return send(res, 400, { ok: false, error: 'That is not a web link.' });
      const h = Number.isInteger(height) && height > 0 && height <= 4320 ? height : null;
      const job = startJob(clean, kind === 'audio' ? 'audio' : 'video', h);
      return send(res, 200, { ok: true, job: publicJob(job) });
    }

    const jobMatch = /^\/jobs\/([\w-]+)(\/file)?$/.exec(path);
    if (req.method === 'GET' && jobMatch) {
      const job = jobs.get(jobMatch[1]);
      if (!job) return send(res, 404, { ok: false, error: 'That download is gone — they are kept for an hour.' });
      if (!jobMatch[2]) return send(res, 200, { ok: true, job: publicJob(job) });
      if (job.status !== 'done') return send(res, 409, { ok: false, error: 'Not finished yet.' });
      res.writeHead(200, {
        'Content-Type': TYPES[extname(job.file).toLowerCase()] || 'application/octet-stream',
        'Content-Length': job.size,
        'X-Filename': encodeURIComponent(job.name),
        'Cache-Control': 'no-store'
      });
      return createReadStream(job.file).pipe(res);
    }

    send(res, 404, { ok: false, error: 'Nothing here.' });
  } catch (error) {
    send(res, 500, { ok: false, error: error.message || 'Something went wrong.' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n  CountriesIRL Studio helper — listening on http://${HOST}:${PORT}`);
  console.log(`  yt-dlp: ${found.version ? `${found.version} (${found.ytdlp})` : 'NOT FOUND — see README.md'}`);
  console.log(`  ffmpeg: ${found.ffmpeg || 'NOT FOUND — downloads still work, but in lower quality'}`);
  console.log(`  Downloads land in the studio; temporary copies live in ${tmpdir()}`);
  console.log(`  Leave this window open while you use the Downloader. Ctrl+C stops it.\n`);
});

process.on('SIGINT', () => {
  for (const job of jobs.values()) rmSync(job.dir, { recursive: true, force: true });
  process.exit(0);
});

