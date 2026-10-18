import { useCallback, useEffect, useRef, useState } from 'react';
import { useStudio } from '../../store';
import { detect, readLink, type Platform } from './platforms';
import { fetchFile, health, HelperOffline, jobStatus, lookUp, startDownload, type Health, type Info, type Job } from './helper';

/* ==========================================================================
   Downloader — paste a link from anywhere, get the file.
   --------------------------------------------------------------------------
   The site is read from the link, the link is looked up as soon as it is
   pasted, and the finished file can be saved or sent straight to the
   Editor. The downloading itself happens in helper/server.mjs on your PC.
   ========================================================================== */

type HelperState = Health | 'idle' | 'checking' | 'offline';

type Lookup =
  | { state: 'idle' }
  | { state: 'loading'; url: string }
  | { state: 'ready'; url: string; info: Info }
  | { state: 'error'; url: string; message: string };

type Download = {
  job: Job;
  url: string;
  platform: Platform;
  title: string;
  thumbnail: string | null;
  kind: 'video' | 'audio';
  file?: { blob: Blob; name: string; href: string };
};

/* Reaching the helper means talking to a program on this computer, which
   browsers now ask permission for. So nothing is tried until someone
   chooses to connect, and a browser that has connected once is remembered
   and reconnects by itself. */
const CONNECTED_KEY = 'irl-studio.helper';

function rememberedHelper() {
  try { return localStorage.getItem(CONNECTED_KEY) === 'on'; } catch { return false; }
}

export function Downloader() {
  const [connect, setConnect] = useState(rememberedHelper);
  const [helper, setHelper] = useState<HelperState>(() => (rememberedHelper() ? 'checking' : 'idle'));
  const [text, setText] = useState('');
  const [lookup, setLookup] = useState<Lookup>({ state: 'idle' });
  const [kind, setKind] = useState<'video' | 'audio'>('video');
  const [height, setHeight] = useState<number | null>(null);
  const [downloads, setDownloads] = useState<Download[]>([]);
  const sendToEditor = useStudio((s) => s.sendToEditor);
  const inputRef = useRef<HTMLInputElement>(null);

  const link = readLink(text);
  const platform = link ? detect(link) : null;

  /* Once connecting is chosen: is the helper running? Checked now, then
     every few seconds while it is not, so starting it is picked up without
     a reload. */
  useEffect(() => {
    if (!connect) return;
    setHelper('checking');
    let stop = false;
    let timer = 0;
    const check = async () => {
      try {
        const h = await health();
        if (!stop) setHelper(h);
      } catch {
        if (!stop) {
          setHelper('offline');
          timer = window.setTimeout(check, 4000);
        }
      }
    };
    check();
    return () => { stop = true; window.clearTimeout(timer); };
  }, [connect]);

  const startConnecting = () => {
    try { localStorage.setItem(CONNECTED_KEY, 'on'); } catch { /* fine: it just won't be remembered */ }
    setConnect(true);
  };

  const run = useCallback(async (raw: string) => {
    const url = readLink(raw);
    if (!url) return;
    setLookup({ state: 'loading', url: url.href });
    try {
      const info = await lookUp(url.href);
      setLookup({ state: 'ready', url: url.href, info });
      setKind(info.hasVideo ? 'video' : 'audio');
      setHeight(null);
    } catch (error) {
      if (error instanceof HelperOffline) setHelper('offline');
      setLookup({ state: 'error', url: url.href, message: (error as Error).message });
    }
  }, []);

  /* Pasting a link is the whole interaction: it is looked up at once. */
  const onPaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData('text');
    if (readLink(pasted)) {
      event.preventDefault();
      setText(pasted.trim());
      run(pasted);
    }
  };

  const download = async () => {
    if (lookup.state !== 'ready') return;
    const { url, info } = lookup;
    try {
      const job = await startDownload(url, kind, kind === 'video' ? height : null);
      setDownloads((list) => [{
        job, url, kind,
        platform: detect(new URL(url)),
        title: info.title,
        thumbnail: info.thumbnail
      }, ...list]);
      setText('');
      setLookup({ state: 'idle' });
      inputRef.current?.focus();
    } catch (error) {
      setLookup({ state: 'error', url, message: (error as Error).message });
    }
  };

  /* Follow every running download until it finishes, then fetch the file. */
  const running = downloads.filter((d) => d.job.status === 'running').map((d) => d.job.id).join(',');
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(async () => {
      for (const id of running.split(',')) {
        try {
          const job = await jobStatus(id);
          let file: Download['file'];
          if (job.status === 'done') {
            const got = await fetchFile(id);
            file = { ...got, href: URL.createObjectURL(got.blob) };
          }
          setDownloads((list) => list.map((d) => (d.job.id === id ? { ...d, job, file: file ?? d.file } : d)));
        } catch (error) {
          setDownloads((list) => list.map((d) => (d.job.id === id
            ? { ...d, job: { ...d.job, status: 'error', error: (error as Error).message } } : d)));
        }
      }
    }, 700);
    return () => window.clearInterval(timer);
  }, [running]);

  const ready = typeof helper === 'object' && !!helper.ytdlp;

  return (
    <div className="tool downloader">
      <div className="tool__head">
        <h1>Downloader</h1>
        <p>Paste a link from YouTube, TikTok, Instagram, Facebook or almost anywhere else. The site is picked up from the link.</p>
      </div>

      <HelperStatus helper={helper} onConnect={startConnecting} />

      <form className="dl-box" onSubmit={(e) => { e.preventDefault(); run(text); }}>
        <div className="dl-input">
          <input
            ref={inputRef}
            type="url"
            inputMode="url"
            placeholder="Paste a link"
            value={text}
            onChange={(e) => { setText(e.target.value); if (lookup.state !== 'loading') setLookup({ state: 'idle' }); }}
            onPaste={onPaste}
            disabled={!ready}
            autoFocus
            spellCheck={false}
            aria-label="Link to download"
          />
          {platform && (
            <span className="platform" style={{ '--platform': platform.color } as React.CSSProperties}>
              {platform.name}
            </span>
          )}
          <button className="btn btn--primary" type="submit" disabled={!ready || !link || lookup.state === 'loading'}>
            {lookup.state === 'loading' ? 'Looking…' : 'Look up'}
          </button>
        </div>

        <p className="dl-fair">
          Download only what you made or have permission to use. <a href="/terms.html">Terms</a>
        </p>

        {lookup.state === 'error' && <p className="dl-error" role="alert">{lookup.message}</p>}

        {lookup.state === 'ready' && (
          <div className="dl-found">
            {lookup.info.thumbnail && (
              <img className="dl-found__thumb" src={lookup.info.thumbnail} alt="" referrerPolicy="no-referrer" />
            )}
            <div className="dl-found__body">
              <p className="dl-found__title">{lookup.info.title}</p>
              <p className="dl-found__meta">
                {[lookup.info.uploader, lookup.info.duration ? clock(lookup.info.duration) : '', lookup.info.site]
                  .filter(Boolean).join(' · ')}
              </p>
              <div className="dl-options">
                <div className="seg" role="radiogroup" aria-label="What to download">
                  <button type="button" role="radio" aria-checked={kind === 'video'} disabled={!lookup.info.hasVideo}
                    onClick={() => setKind('video')}>Video</button>
                  <button type="button" role="radio" aria-checked={kind === 'audio'}
                    onClick={() => setKind('audio')}>Audio only</button>
                </div>
                {kind === 'video' && lookup.info.heights.length > 0 && (
                  <select value={height ?? ''} onChange={(e) => setHeight(e.target.value ? Number(e.target.value) : null)}
                    aria-label="Quality">
                    <option value="">Best quality</option>
                    {lookup.info.heights.map((h) => <option key={h} value={h}>{h}p</option>)}
                  </select>
                )}
                <button type="button" className="btn btn--primary" onClick={download}>Download</button>
              </div>
            </div>
          </div>
        )}
      </form>

      {downloads.length > 0 && (
        <section className="dl-list" aria-label="Downloads">
          <h2>Downloads</h2>
          <ul>
            {downloads.map((d) => (
              <li key={d.job.id} className={`dl-item is-${d.job.status}`}>
                {d.thumbnail ? <img src={d.thumbnail} alt="" referrerPolicy="no-referrer" /> : <span className="dl-item__ph" />}
                <div className="dl-item__body">
                  <p className="dl-item__title">{d.title}</p>
                  <p className="dl-item__meta">
                    {d.platform.name} · {d.kind === 'audio' ? 'Audio' : 'Video'}
                    {d.job.status === 'done' && ` · ${megabytes(d.job.size)}`}
                  </p>
                  {d.job.status === 'running' && (
                    <div className="progress" aria-label={`${d.job.phase} ${Math.round(d.job.progress)}%`}>
                      <span style={{ width: `${d.job.progress}%` }} />
                      <em>{d.job.phase} · {Math.round(d.job.progress)}%</em>
                    </div>
                  )}
                  {d.job.status === 'error' && <p className="dl-error">{d.job.error}</p>}
                </div>
                {d.file && (
                  <div className="dl-item__actions">
                    <a className="btn btn--secondary" href={d.file.href} download={d.file.name}>Save</a>
                    {d.kind === 'video' && (
                      <button type="button" className="btn btn--primary"
                        onClick={() => d.file && sendToEditor({ blob: d.file.blob, name: d.file.name })}>
                        Open in Editor
                      </button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/* One quiet line under the heading. On your PC the Studio connects by
   itself (it remembers), and Windows starts the helper at sign-in, so you
   only ever see "Helper connected". Anyone else sees a single line, with
   the option to connect if they run a helper of their own. */
function HelperStatus({ helper, onConnect }: { helper: HelperState; onConnect: () => void }) {
  if (helper === 'idle') {
    return (
      <p className="helper-status">
        Downloads run through the CountriesIRL helper.{' '}
        <button type="button" className="link" onClick={onConnect}>Connect</button>
      </p>
    );
  }
  if (helper === 'checking') return <p className="helper-status">Connecting to the helper…</p>;
  if (helper === 'offline') {
    return (
      <p className="helper-status is-warn" role="status">
        The helper isn’t running on this computer. It starts with Windows, or run <code>npm run helper</code>; this page notices on its own.
      </p>
    );
  }
  if (!helper.ytdlp) {
    return (
      <p className="helper-status is-warn" role="status">
        The helper is running, but yt-dlp isn’t installed. See “Setting up the Downloader” in README.md.
      </p>
    );
  }
  return (
    <p className="helper-status is-on">
      Helper connected · yt-dlp {helper.ytdlp}
      {!helper.ffmpeg && ' · ffmpeg missing, so quality is limited'}
    </p>
  );
}

function clock(seconds: number) {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${rest}` : `${m}:${rest}`;
}

function megabytes(bytes: number) {
  return `${(bytes / 1048576).toFixed(bytes > 104857600 ? 0 : 1)} MB`;
}
