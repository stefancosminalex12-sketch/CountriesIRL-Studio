/* ==========================================================================
   Drawing one frame of the short.
   --------------------------------------------------------------------------
   The preview and the export both draw through here, so what you see while
   editing is exactly what gets exported.
   ========================================================================== */

export type Format = '9:16' | '1:1' | '16:9' | 'original';
export type Fill = 'cover' | 'fit';
export type TextStyle = 'outline' | 'box' | 'plain';

/* How the clip sits in the frame. zoom 1 is the plain fit; pan runs from
   -1 to 1 across whatever room the zoom leaves. */
export type Framing = { format: Format; fill: Fill; zoom: number; panX: number; panY: number };

/* x and y are the centre, as fractions of the frame; size is in pixels on
   a 1080-wide frame, so it scales with the format. start and end are
   seconds on the clip's own clock. */
export type TextItem = {
  id: string;
  text: string;
  x: number;
  y: number;
  size: number;
  color: string;
  style: TextStyle;
  start: number;
  end: number;
};

export type Box = { x: number; y: number; w: number; h: number };

export const FONT = '"Inter Variable", Inter, system-ui, sans-serif';

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

export function outputSize(format: Format, vw: number, vh: number): [number, number] {
  if (format === '9:16') return [1080, 1920];
  if (format === '1:1') return [1080, 1080];
  if (format === '16:9') return [1920, 1080];
  const scale = Math.min(1, 1920 / Math.max(vw, vh, 1));
  return [even(vw * scale), even(vh * scale)];
}

/* Where the clip lands in a W×H frame, and how far it can be panned. */
export function placeVideo(fr: Framing, W: number, H: number, vw: number, vh: number) {
  const base = fr.fill === 'cover' ? Math.max(W / vw, H / vh) : Math.min(W / vw, H / vh);
  const w = vw * base * fr.zoom;
  const h = vh * base * fr.zoom;
  const roomX = Math.abs(w - W) / 2;
  const roomY = Math.abs(h - H) / 2;
  return { x: (W - w) / 2 - fr.panX * roomX, y: (H - h) / 2 - fr.panY * roomY, w, h, roomX, roomY };
}

/* "Fit" puts a soft, darkened copy of the clip behind it instead of black
   bars. Drawn tiny and stretched back up, which blurs it for almost nothing
   — fast enough to run every frame of an export. */
const haze = document.createElement('canvas');
haze.width = 36;
haze.height = 64;

function drawHaze(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, W: number, H: number) {
  const hctx = haze.getContext('2d')!;
  const hh = Math.max(8, Math.round(36 * (H / W)));
  if (haze.height !== hh) haze.height = hh;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const s = Math.max(haze.width / vw, haze.height / vh);
  hctx.drawImage(video, (haze.width - vw * s) / 2, (haze.height - vh * s) / 2, vw * s, vh * s);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(haze, -W * 0.05, -H * 0.05, W * 1.1, H * 1.1);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  fr: Framing,
  texts: TextItem[],
  time: number,
  selected: string | null
) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return;

  if (fr.fill === 'fit') drawHaze(ctx, video, W, H);
  const at = placeVideo(fr, W, H, vw, vh);
  ctx.drawImage(video, at.x, at.y, at.w, at.h);

  for (const t of texts) {
    if (!showing(t, time)) continue;
    const box = drawText(ctx, t);
    if (t.id === selected) {
      ctx.save();
      ctx.strokeStyle = '#f2c14e';
      ctx.lineWidth = Math.max(3, W / 360);
      ctx.setLineDash([W / 60, W / 90]);
      ctx.strokeRect(box.x, box.y, box.w, box.h);
      ctx.restore();
    }
  }
}

export function showing(t: TextItem, time: number) {
  return t.text.trim() !== '' && time >= t.start && time <= t.end;
}

function layout(ctx: CanvasRenderingContext2D, t: TextItem) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const size = t.size * (W / 1080);
  ctx.font = `800 ${size}px ${FONT}`;
  const lines = t.text.split('\n');
  const lineH = size * 1.18;
  const widest = Math.max(0, ...lines.map((l) => ctx.measureText(l).width));
  const padX = t.style === 'box' ? size * 0.38 : size * 0.14;
  const padY = t.style === 'box' ? size * 0.22 : size * 0.1;
  const cx = t.x * W;
  const cy = t.y * H;
  const total = lineH * lines.length;
  const box: Box = { x: cx - widest / 2 - padX, y: cy - total / 2 - padY, w: widest + padX * 2, h: total + padY * 2 };
  return { size, lines, lineH, cx, cy, total, box };
}

/* The text's outline on the frame, for picking it up with the pointer. */
export function textBox(ctx: CanvasRenderingContext2D, t: TextItem): Box {
  ctx.save();
  const { box } = layout(ctx, t);
  ctx.restore();
  return box;
}

/* Light text gets a navy box, dark text an off-white one. */
function boxColour(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const lum = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 140 ? 'rgba(11, 23, 35, 0.88)' : 'rgba(251, 250, 248, 0.92)';
}

function drawText(ctx: CanvasRenderingContext2D, t: TextItem): Box {
  ctx.save();
  const { size, lines, lineH, cx, cy, total, box } = layout(ctx, t);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';

  if (t.style === 'box') {
    ctx.fillStyle = boxColour(t.color);
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, size * 0.24);
    ctx.fill();
  }
  if (t.style === 'plain') {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = size * 0.18;
    ctx.shadowOffsetY = size * 0.05;
  }

  lines.forEach((line, i) => {
    const y = cy - total / 2 + lineH * (i + 0.5);
    if (t.style === 'outline') {
      ctx.lineWidth = size * 0.2;
      ctx.strokeStyle = '#000';
      ctx.strokeText(line, cx, y);
    }
    ctx.fillStyle = t.color;
    ctx.fillText(line, cx, y);
  });
  ctx.restore();
  return box;
}
