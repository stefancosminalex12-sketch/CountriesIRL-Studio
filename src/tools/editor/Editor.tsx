import { useCallback, useEffect, useRef, useState } from 'react';
import { useStudio, type Clip } from '../../store';
import { drawFrame, FONT, outputSize, placeVideo, showing, textBox, type Fill, type Format, type Framing, type TextItem, type TextStyle } from './render';
import { record, recordingType } from './record';
import { Timeline } from './Timeline';

/* ==========================================================================
   Editor — one clip in, one short out.
   --------------------------------------------------------------------------
   Load a clip (or send one from the Downloader), trim it, frame it for
   9:16, add text, export. Everything runs in the browser; nothing is
   uploaded anywhere.
   ========================================================================== */

type Loaded = { url: string; name: string; duration: number; vw: number; vh: number };

type Exporting =
  | { state: 'idle' }
  | { state: 'running'; progress: number }
  | { state: 'done'; href: string; name: string; size: number }
  | { state: 'error'; message: string };

const FORMATS: { id: Format; label: string }[] = [
  { id: '9:16', label: '9:16' },
  { id: '1:1', label: '1:1' },
  { id: '16:9', label: '16:9' },
  { id: 'original', label: 'Original' }
];

const SWATCHES = ['#ffffff', '#fbfaf8', '#0b1723', '#ffd400', '#f2c14e', '#b3391f', '#22c55e'];

const STYLES: { id: TextStyle; label: string }[] = [
  { id: 'outline', label: 'Outline' },
  { id: 'box', label: 'Box' },
  { id: 'plain', label: 'Shadow' }
];

const START_FRAMING: Framing = { format: '9:16', fill: 'cover', zoom: 1, panX: 0, panY: 0 };

export function Editor() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [clip, setClip] = useState<Loaded | null>(null);
  const [trim, setTrim] = useState<[number, number]>([0, 0]);
  const [framing, setFraming] = useState<Framing>(START_FRAMING);
  const [texts, setTexts] = useState<TextItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [volume, setVolume] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [exporting, setExporting] = useState<Exporting>({ state: 'idle' });
  const [dragOver, setDragOver] = useState(false);

  /* The render loop reads the latest state through this, not through
     stale closures. */
  const live = useRef({ framing, texts, selected, trim, exporting: false, dirty: true });
  live.current.framing = framing;
  live.current.texts = texts;
  live.current.selected = selected;
  live.current.trim = trim;

  useEffect(() => { live.current.dirty = true; }, [framing, texts, selected, clip]);

  /* --------------------------------------------------------------------
     Sound. The clip's audio runs through a small Web Audio chain so the
     volume can go past 100% and the export can record it. Browsers only
     allow it after a click, so it is built on the first play or export.
     -------------------------------------------------------------------- */
  const sound = useRef<{ ctx: AudioContext; gain: GainNode; out: MediaStreamAudioDestinationNode } | null>(null);

  const ensureSound = useCallback(async () => {
    const video = videoRef.current!;
    if (!sound.current) {
      const ctx = new AudioContext();
      const source = ctx.createMediaElementSource(video);
      const gain = ctx.createGain();
      const out = ctx.createMediaStreamDestination();
      source.connect(gain);
      gain.connect(ctx.destination);
      gain.connect(out);
      sound.current = { ctx, gain, out };
    }
    sound.current.gain.gain.value = volume;
    if (sound.current.ctx.state !== 'running') await sound.current.ctx.resume();
    return sound.current;
  }, [volume]);

  useEffect(() => {
    if (sound.current) sound.current.gain.gain.value = volume;
  }, [volume]);

  /* --------------------------------------------------------------------
     Loading a clip
     -------------------------------------------------------------------- */
  const load = useCallback((file: Clip) => {
    const video = videoRef.current!;
    video.pause();
    setPlaying(false);
    setExporting((e) => {
      if (e.state === 'done') URL.revokeObjectURL(e.href);
      return { state: 'idle' };
    });
    if (clip) URL.revokeObjectURL(clip.url);
    const url = URL.createObjectURL(file.blob);
    video.src = url;
    video.addEventListener('loadedmetadata', async () => {
      const duration = await knownDuration(video);
      const landscape = video.videoWidth > video.videoHeight;
      setClip({ url, name: file.name, duration, vw: video.videoWidth, vh: video.videoHeight });
      setTrim([0, duration]);
      setTime(0);
      /* A wide clip in a tall frame is usually wanted whole, over a blurred
         copy of itself; a tall one fills the frame. */
      setFraming({ ...START_FRAMING, fill: landscape ? 'fit' : 'cover' });
      setTexts([]);
      setSelected(null);
      live.current.dirty = true;
    }, { once: true });
  }, [clip]);

  const pending = useStudio((s) => s.pendingClip);
  const takeClip = useStudio((s) => s.takeClip);
  useEffect(() => {
    if (!pending) return;
    const next = takeClip();
    if (next) load(next);
  }, [pending, takeClip, load]);

  const openFile = (file: File | undefined) => {
    if (file && (file.type.startsWith('video/') || /\.(mp4|webm|mov|mkv|m4v)$/i.test(file.name))) {
      load({ blob: file, name: file.name });
    }
  };

  /* --------------------------------------------------------------------
     The frame size follows the format.
     -------------------------------------------------------------------- */
  const [W, H] = clip ? outputSize(framing.format, clip.vw, clip.vh) : [1080, 1920];
  useEffect(() => {
    const canvas = canvasRef.current!;
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
      live.current.dirty = true;
    }
  }, [W, H]);

  /* --------------------------------------------------------------------
     The render loop: draws while playing or after a change, keeps the
     playback inside the trim, and loops it.
     -------------------------------------------------------------------- */
  useEffect(() => {
    let frame = 0;
    let lastTick = 0;
    document.fonts.load(`800 64px ${FONT}`).then(() => { live.current.dirty = true; });
    const loop = (now: number) => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const state = live.current;
      if (video && canvas && !state.exporting && video.readyState >= 2) {
        const [from, to] = state.trim;
        if (!video.paused && to > from && video.currentTime >= to) video.currentTime = from;
        if (!video.paused || state.dirty) {
          drawFrame(canvas.getContext('2d')!, video, state.framing, state.texts, video.currentTime, state.selected);
          state.dirty = false;
        }
        if (now - lastTick > 80) {
          lastTick = now;
          setTime(video.currentTime);
        }
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  /* --------------------------------------------------------------------
     Playback
     -------------------------------------------------------------------- */
  const seek = useCallback((t: number) => {
    const video = videoRef.current!;
    video.currentTime = t;
    setTime(t);
    video.addEventListener('seeked', () => { live.current.dirty = true; }, { once: true });
  }, []);

  const togglePlay = useCallback(async () => {
    const video = videoRef.current!;
    if (!clip || exporting.state === 'running') return;
    if (video.paused) {
      await ensureSound();
      const [from, to] = trim;
      if (video.currentTime < from || video.currentTime >= to - 0.05) video.currentTime = from;
      await video.play();
      setPlaying(true);
    } else {
      video.pause();
      setPlaying(false);
    }
  }, [clip, exporting.state, ensureSound, trim]);

  /* Space plays and pauses; Delete removes the selected text — unless you
     are typing in a field. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select, [contenteditable]')) return;
      /* Only while the Editor is the open tab. */
      if (document.querySelector('.editor')?.closest('[hidden]')) return;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
        e.preventDefault();
        setTexts((list) => list.filter((t) => t.id !== selected));
        setSelected(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, selected]);

  /* --------------------------------------------------------------------
     Dragging on the preview: a text moves the text, anywhere else pans
     the clip. The wheel zooms.
     -------------------------------------------------------------------- */
  const onCanvasDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!clip || exporting.state === 'running') return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / rect.width;
    const px = (event.clientX - rect.left) * scale;
    const py = (event.clientY - rect.top) * scale;
    const now = videoRef.current!.currentTime;

    const hit = [...texts].reverse().find((t) => {
      if (!showing(t, now)) return false;
      const b = textBox(ctx, t);
      return px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h;
    });

    canvas.setPointerCapture(event.pointerId);
    let lastX = event.clientX;
    let lastY = event.clientY;

    if (hit) {
      setSelected(hit.id);
      const startX = hit.x;
      const startY = hit.y;
      const originX = event.clientX;
      const originY = event.clientY;
      const move = (e: PointerEvent) => {
        const dx = ((e.clientX - originX) * scale) / canvas.width;
        const dy = ((e.clientY - originY) * scale) / canvas.height;
        const x = Math.min(1, Math.max(0, startX + dx));
        const y = Math.min(1, Math.max(0, startY + dy));
        setTexts((list) => list.map((t) => (t.id === hit.id ? { ...t, x, y } : t)));
      };
      follow(canvas, move);
      return;
    }

    setSelected(null);
    const move = (e: PointerEvent) => {
      const dx = (e.clientX - lastX) * scale;
      const dy = (e.clientY - lastY) * scale;
      lastX = e.clientX;
      lastY = e.clientY;
      setFraming((f) => {
        const at = placeVideo(f, canvas.width, canvas.height, clip.vw, clip.vh);
        const panX = at.roomX > 1 ? clamp(f.panX - dx / at.roomX, -1, 1) : 0;
        const panY = at.roomY > 1 ? clamp(f.panY - dy / at.roomY, -1, 1) : 0;
        return { ...f, panX, panY };
      });
    };
    follow(canvas, move);
  };

  const onWheel = (event: React.WheelEvent) => {
    if (!clip) return;
    setFraming((f) => ({ ...f, zoom: clamp(f.zoom * (event.deltaY < 0 ? 1.06 : 1 / 1.06), 0.5, 4) }));
  };

  /* --------------------------------------------------------------------
     Text
     -------------------------------------------------------------------- */
  const addText = () => {
    if (!clip) return;
    const id = crypto.randomUUID();
    const [from, to] = trim;
    setTexts((list) => [...list, {
      id, text: 'Your text', x: 0.5, y: list.length ? Math.min(0.85, 0.2 + list.length * 0.12) : 0.2,
      size: 84, color: '#ffffff', style: 'outline', start: from, end: to
    }]);
    setSelected(id);
  };

  const current = texts.find((t) => t.id === selected) || null;
  const patch = (changes: Partial<TextItem>) => {
    if (!current) return;
    setTexts((list) => list.map((t) => (t.id === current.id ? { ...t, ...changes } : t)));
  };

  /* --------------------------------------------------------------------
     Export
     -------------------------------------------------------------------- */
  const abort = useRef<AbortController | null>(null);

  const runExport = async () => {
    if (!clip) return;
    const video = videoRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    setSelected(null);
    setPlaying(false);
    const audio = await ensureSound();
    /* Recorded, not played out loud, while exporting. */
    audio.gain.disconnect(audio.ctx.destination);
    live.current.exporting = true;
    abort.current = new AbortController();
    setExporting({ state: 'running', progress: 0 });

    const state = live.current;
    try {
      const { blob, ext } = await record({
        video, canvas,
        sound: volume > 0 ? audio.out.stream : null,
        from: trim[0], to: trim[1],
        draw: () => drawFrame(ctx, video, state.framing, state.texts, video.currentTime, null),
        onProgress: (progress) => setExporting({ state: 'running', progress }),
        signal: abort.current.signal
      });
      const base = clip.name.replace(/\.[^.]+$/, '').replace(/\s*\[[^\]]*\]$/, '').slice(0, 60) || 'short';
      setExporting({ state: 'done', href: URL.createObjectURL(blob), name: `${base} - short.${ext}`, size: blob.size });
    } catch (error) {
      setExporting((error as Error).name === 'AbortError'
        ? { state: 'idle' }
        : { state: 'error', message: (error as Error).message || 'The export did not finish.' });
    } finally {
      audio.gain.connect(audio.ctx.destination);
      live.current.exporting = false;
      live.current.dirty = true;
    }
  };

  const length = Math.max(0, trim[1] - trim[0]);
  const busy = exporting.state === 'running';
  const mp4 = recordingType().ext === 'mp4';

  return (
    <div className="tool editor">
      <div
        className={`ed-stage${dragOver ? ' is-drop' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); openFile(e.dataTransfer.files[0]); }}
      >
        <video ref={videoRef} className="ed-video" playsInline preload="auto"
          onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)} />
        <canvas
          ref={canvasRef}
          className="ed-canvas"
          hidden={!clip}
          style={{ aspectRatio: `${W} / ${H}` }}
          onPointerDown={onCanvasDown}
          onWheel={onWheel}
        />
        {!clip && (
          <div className="ed-empty">
            <p className="ed-empty__title">Drop a clip here</p>
            <p>or send one from the Downloader with “Open in Editor”.</p>
            <button type="button" className="btn btn--light" onClick={() => fileRef.current?.click()}>Choose a video</button>
          </div>
        )}
        <input ref={fileRef} type="file" accept="video/*" hidden
          onChange={(e) => { openFile(e.target.files?.[0]); e.target.value = ''; }} />
      </div>

      <aside className="ed-panel" aria-label="Edit">
        <section className="ed-group">
          <div className="ed-group__head">
            <h2>Clip</h2>
            <button type="button" className="link" onClick={() => fileRef.current?.click()} disabled={busy}>
              {clip ? 'Replace' : 'Choose'}
            </button>
          </div>
          <p className="ed-clip">{clip ? clip.name : 'No clip yet'}</p>
        </section>

        <fieldset className="ed-group" disabled={!clip || busy}>
          <h2>Frame</h2>
          <div className="seg seg--full" role="radiogroup" aria-label="Format">
            {FORMATS.map((f) => (
              <button key={f.id} type="button" role="radio" aria-checked={framing.format === f.id}
                onClick={() => setFraming((fr) => ({ ...fr, format: f.id, panX: 0, panY: 0 }))}>{f.label}</button>
            ))}
          </div>
          <div className="seg seg--full" role="radiogroup" aria-label="Fill">
            {(['cover', 'fit'] as Fill[]).map((fill) => (
              <button key={fill} type="button" role="radio" aria-checked={framing.fill === fill}
                onClick={() => setFraming((fr) => ({ ...fr, fill, panX: 0, panY: 0 }))}>
                {fill === 'cover' ? 'Fill frame' : 'Fit + blur'}
              </button>
            ))}
          </div>
          <label className="ed-range">
            <span>Zoom <em>{Math.round(framing.zoom * 100)}%</em></span>
            <input type="range" min={0.5} max={4} step={0.01} value={framing.zoom}
              onChange={(e) => setFraming((fr) => ({ ...fr, zoom: Number(e.target.value) }))} />
          </label>
          <p className="ed-hint">Drag the preview to move the clip, scroll on it to zoom.</p>
          <button type="button" className="link" onClick={() => setFraming((fr) => ({ ...fr, zoom: 1, panX: 0, panY: 0 }))}>
            Reset position
          </button>
        </fieldset>

        <fieldset className="ed-group" disabled={!clip || busy}>
          <div className="ed-group__head">
            <h2>Text</h2>
            <button type="button" className="btn btn--small" onClick={addText}>Add text</button>
          </div>
          {current ? (
            <div className="ed-text">
              <textarea value={current.text} rows={2} onChange={(e) => patch({ text: e.target.value })} aria-label="Text" />
              <div className="seg seg--full" role="radiogroup" aria-label="Text style">
                {STYLES.map((s) => (
                  <button key={s.id} type="button" role="radio" aria-checked={current.style === s.id}
                    onClick={() => patch({ style: s.id })}>{s.label}</button>
                ))}
              </div>
              <label className="ed-range">
                <span>Size <em>{current.size}</em></span>
                <input type="range" min={28} max={220} step={1} value={current.size}
                  onChange={(e) => patch({ size: Number(e.target.value) })} />
              </label>
              <div className="swatches" role="radiogroup" aria-label="Colour">
                {SWATCHES.map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={current.color === c} aria-label={c}
                    style={{ background: c }} onClick={() => patch({ color: c })} />
                ))}
                <input type="color" value={current.color} onChange={(e) => patch({ color: e.target.value })} aria-label="Any colour" />
              </div>
              <div className="ed-when">
                <span>Shows</span>
                <button type="button" className="chip" onClick={() => patch({ start: Math.min(time, current.end) })}
                  title="Start at the playhead">from {clock(current.start)}</button>
                <button type="button" className="chip" onClick={() => patch({ end: Math.max(time, current.start) })}
                  title="End at the playhead">to {clock(current.end)}</button>
              </div>
              <p className="ed-hint">Move the playhead, then click “from” or “to” to set when it shows. Drag the text on the preview to place it.</p>
              <button type="button" className="link link--danger"
                onClick={() => { setTexts((l) => l.filter((t) => t.id !== current.id)); setSelected(null); }}>
                Delete text
              </button>
            </div>
          ) : (
            <p className="ed-hint">{texts.length ? 'Click a text on the preview or the timeline to edit it.' : 'No text yet.'}</p>
          )}
        </fieldset>

        <fieldset className="ed-group" disabled={!clip || busy}>
          <h2>Sound</h2>
          <label className="ed-range">
            <span>Volume <em>{volume === 0 ? 'Muted' : `${Math.round(volume * 100)}%`}</em></span>
            <input type="range" min={0} max={2} step={0.05} value={volume} onChange={(e) => setVolume(Number(e.target.value))} />
          </label>
        </fieldset>

        <section className="ed-group ed-export">
          <h2>Export</h2>
          {exporting.state === 'running' ? (
            <>
              <div className="progress"><span style={{ width: `${exporting.progress * 100}%` }} />
                <em>Recording · {Math.round(exporting.progress * 100)}%</em></div>
              <p className="ed-hint">Exports play in real time — keep this tab open and in front.</p>
              <button type="button" className="link link--danger" onClick={() => abort.current?.abort()}>Cancel</button>
            </>
          ) : (
            <button type="button" className="btn btn--primary btn--wide" onClick={runExport} disabled={!clip || length <= 0}>
              Export {clip ? `${W}×${H}` : ''} {mp4 ? 'MP4' : 'WebM'}
            </button>
          )}
          {exporting.state === 'done' && (
            <a className="btn btn--secondary btn--wide" href={exporting.href} download={exporting.name}>
              Save {exporting.name.endsWith('.mp4') ? 'MP4' : 'video'} · {(exporting.size / 1048576).toFixed(1)} MB
            </a>
          )}
          {exporting.state === 'error' && <p className="dl-error">{exporting.message}</p>}
          {!mp4 && <p className="ed-hint">This browser records WebM. Chrome or Edge export MP4.</p>}
        </section>
      </aside>

      <div className="ed-transport">
        <button type="button" className="play" onClick={togglePlay} disabled={!clip || busy}
          aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <span className="ed-time">{clock(time)} <em>/ {clock(clip?.duration ?? 0)}</em></span>
        {clip && clip.duration > 0 ? (
          <Timeline
            duration={clip.duration}
            trimIn={trim[0]}
            trimOut={trim[1]}
            time={time}
            texts={texts}
            selected={selected}
            onSeek={seek}
            onTrim={(a, b) => setTrim([a, b])}
            onSelect={(id) => { setSelected(id); const t = texts.find((x) => x.id === id); if (t) seek(t.start); }}
          />
        ) : <div className="timeline is-empty" />}
        <span className="ed-length" title="Length after trimming">{clock(length)}</span>
      </div>
    </div>
  );
}

/* WebM files recorded in a browser (OBS-style screen recorders, and our
   own WebM exports) carry no length, so the video reports Infinity. Seeking
   far past the end makes the browser read to the end and learn it. */
function knownDuration(video: HTMLVideoElement): Promise<number> {
  if (Number.isFinite(video.duration)) return Promise.resolve(video.duration);
  return new Promise((resolve) => {
    const settle = () => {
      if (!Number.isFinite(video.duration)) return;
      video.removeEventListener('durationchange', settle);
      video.removeEventListener('timeupdate', settle);
      video.currentTime = 0;
      resolve(video.duration);
    };
    video.addEventListener('durationchange', settle);
    video.addEventListener('timeupdate', settle);
    video.currentTime = 1e9;
  });
}

function follow(target: HTMLElement, move: (e: PointerEvent) => void) {
  const up = () => {
    target.removeEventListener('pointermove', move);
    target.removeEventListener('pointerup', up);
    target.removeEventListener('pointercancel', up);
  };
  target.addEventListener('pointermove', move);
  target.addEventListener('pointerup', up);
  target.addEventListener('pointercancel', up);
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function clock(seconds: number) {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toFixed(1).padStart(4, '0')}`;
}

function PlayIcon() {
  return <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" fill="currentColor" /></svg>;
}

function PauseIcon() {
  return <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M6 4h4.5v16H6zM13.5 4H18v16h-4.5z" fill="currentColor" /></svg>;
}
