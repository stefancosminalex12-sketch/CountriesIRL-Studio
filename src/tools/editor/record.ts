/* ==========================================================================
   Exporting: play the trimmed part through the canvas and record it.
   --------------------------------------------------------------------------
   The browser records the canvas and the sound as the clip plays, so an
   export takes as long as the clip. MP4 where the browser can record it
   (Chrome and Edge can), WebM otherwise.
   ========================================================================== */

const TYPES = [
  'video/mp4;codecs=avc1.640028,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm'
];

export function recordingType() {
  const type = TYPES.find((t) => MediaRecorder.isTypeSupported(t)) || '';
  return { type, ext: type.startsWith('video/mp4') ? 'mp4' : 'webm' };
}

function seek(video: HTMLVideoElement, time: number) {
  return new Promise<void>((resolve) => {
    if (Math.abs(video.currentTime - time) < 0.001) return resolve();
    video.addEventListener('seeked', () => resolve(), { once: true });
    video.currentTime = time;
  });
}

type Options = {
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  sound: MediaStream | null;
  from: number;
  to: number;
  draw: () => void;
  onProgress: (fraction: number) => void;
  signal: AbortSignal;
};

export async function record({ video, canvas, sound, from, to, draw, onProgress, signal }: Options) {
  const { type, ext } = recordingType();
  const stream = canvas.captureStream(30);
  sound?.getAudioTracks().forEach((track) => stream.addTrack(track));

  const recorder = new MediaRecorder(stream, {
    mimeType: type || undefined,
    videoBitsPerSecond: 12_000_000,
    audioBitsPerSecond: 192_000
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });

  video.pause();
  video.loop = false;
  await seek(video, from);
  draw();

  recorder.start(500);
  await video.play();

  /* Driven by a timer, not animation frames: those stop altogether when
     the window is covered, which would freeze an export halfway. */
  await new Promise<void>((resolve) => {
    const tick = () => {
      if (signal.aborted || video.ended || video.currentTime >= to) return resolve();
      draw();
      onProgress(Math.min(1, (video.currentTime - from) / Math.max(0.001, to - from)));
      window.setTimeout(tick, 1000 / 60);
    };
    tick();
  });

  video.pause();
  draw();
  recorder.stop();
  await stopped;
  stream.getVideoTracks().forEach((track) => track.stop());

  if (signal.aborted) throw new DOMException('Export cancelled', 'AbortError');
  onProgress(1);
  return { blob: new Blob(chunks, { type: (type || 'video/webm').split(';')[0] }), ext };
}
