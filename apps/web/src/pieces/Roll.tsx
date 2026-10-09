/**
 * Falling notes above the keyboard: each note is a bar over its key that
 * falls toward the keys and reaches them when it's time to play it. Your hand
 * is bright, the other hand faint; played notes turn green, missed ones red.
 *
 * "Now" comes either as a beat (Wait for me: the notes glide to the next
 * step) or as a clock read every frame (In time and Listen), which moves one
 * transform and never re-renders the notes.
 */

import { isBlackKey } from '@music/theory';
import { useEffect, useMemo, useRef } from 'react';
import { keyCenter, type KeyboardSize } from '../keyboard/layout.js';
import type { PieceNote } from './piece.js';
import s from './pieces.module.css';

export type RollState = 'hit' | 'miss';

export interface RollProps {
  size: KeyboardSize;
  notes: readonly PieceNote[];
  /** True for notes you play; the rest are drawn faint. */
  mine: (n: PieceNote) => boolean;
  state?: ReadonlyMap<number, RollState>;
  /** Wait mode: the beat at the keys. */
  now?: number;
  /** Clock mode: called every frame for the beat at the keys. */
  clock?: () => number;
  /** Bar lines to draw, as beats. */
  barLines?: readonly number[];
  pxPerBeat?: number;
}

export function Roll({ size, notes, mine, state, now = 0, clock, barLines = [], pxPerBeat = 56 }: RollProps) {
  const inner = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!clock) return;
    let frame = 0;
    const tick = () => {
      if (inner.current) inner.current.style.transform = `translateY(${clock() * pxPerBeat}px)`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [clock, pxPerBeat]);

  const placed = useMemo(
    () =>
      notes.map((n) => {
        const x = keyCenter(size, n.midi);
        return x === null ? null : { x, black: isBlackKey(n.midi) };
      }),
    [notes, size],
  );

  return (
    <div className={s.roll} data-testid="roll" aria-hidden="true">
      <div ref={inner} className={s.rollInner} data-smooth={clock ? undefined : true} style={clock ? undefined : { transform: `translateY(${now * pxPerBeat}px)` }}>
        {barLines.map((b) => (
          <div key={b} className={s.barLine} style={{ bottom: b * pxPerBeat }} />
        ))}
        {notes.map((n, i) => {
          const p = placed[i];
          if (!p) return null;
          return (
            <div
              key={i}
              className={s.fall}
              data-hand={n.hand}
              data-mine={mine(n) || undefined}
              data-black={p.black || undefined}
              data-state={state?.get(i)}
              style={{ left: `${p.x * 100}%`, bottom: n.start * pxPerBeat, height: Math.max(6, n.dur * pxPerBeat - 3) }}
            />
          );
        })}
      </div>
      <div className={s.nowLine} />
    </div>
  );
}
