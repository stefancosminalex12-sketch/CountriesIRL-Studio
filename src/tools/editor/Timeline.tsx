import { useRef } from 'react';
import type { TextItem } from './render';

/* The strip under the preview: the whole clip, the trimmed part in the
   middle with a handle at each end, the playhead, and a bar per text.
   Click anywhere to jump there; drag a handle to trim. */

type Props = {
  duration: number;
  trimIn: number;
  trimOut: number;
  time: number;
  texts: TextItem[];
  selected: string | null;
  onSeek: (time: number) => void;
  onTrim: (trimIn: number, trimOut: number) => void;
  onSelect: (id: string) => void;
};

const MIN_LENGTH = 0.2;

export function Timeline({ duration, trimIn, trimOut, time, texts, selected, onSeek, onTrim, onSelect }: Props) {
  const track = useRef<HTMLDivElement>(null);
  const pct = (t: number) => `${(t / duration) * 100}%`;

  const timeAt = (clientX: number) => {
    const rect = track.current!.getBoundingClientRect();
    return Math.min(duration, Math.max(0, ((clientX - rect.left) / rect.width) * duration));
  };

  const drag = (which: 'in' | 'out' | 'head') => (event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    const move = (e: PointerEvent) => {
      const t = timeAt(e.clientX);
      if (which === 'in') {
        const next = Math.min(t, trimOut - MIN_LENGTH);
        onTrim(next, trimOut);
        onSeek(next);
      } else if (which === 'out') {
        const next = Math.max(t, trimIn + MIN_LENGTH);
        onTrim(trimIn, next);
        onSeek(next);
      } else {
        onSeek(t);
      }
    };
    move(event.nativeEvent);
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };

  return (
    <div className="timeline">
      <div className="timeline__track" ref={track} onPointerDown={drag('head')}>
        <div className="timeline__cut" style={{ left: 0, width: pct(trimIn) }} />
        <div className="timeline__cut" style={{ left: pct(trimOut), right: 0 }} />
        <div className="timeline__keep" style={{ left: pct(trimIn), width: pct(trimOut - trimIn) }} />
        <button type="button" className="timeline__handle is-in" style={{ left: pct(trimIn) }}
          onPointerDown={drag('in')} aria-label="Trim start" />
        <button type="button" className="timeline__handle is-out" style={{ left: pct(trimOut) }}
          onPointerDown={drag('out')} aria-label="Trim end" />
        <div className="timeline__head" style={{ left: pct(time) }} />
      </div>
      {texts.length > 0 && (
        <div className="timeline__texts">
          {texts.map((t) => (
            <button
              type="button"
              key={t.id}
              className={`timeline__text${t.id === selected ? ' is-selected' : ''}`}
              style={{ left: pct(t.start), width: pct(Math.max(0, t.end - t.start)) }}
              onClick={() => onSelect(t.id)}
              title={t.text}
            >
              {t.text.split('\n')[0] || 'Text'}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
