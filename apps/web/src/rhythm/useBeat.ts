import { useEffect, useState } from 'react';
import type { MetronomeRun } from './metronome.js';

/**
 * The beat a running metronome is on: negative during the count-in (-4, -3,
 * -2, -1 for one bar of 4/4), then 0, 1, 2 ... and null when it isn't running.
 * Fractional beats are left to CSS; this only changes once per beat.
 */
export function useBeat(run: MetronomeRun | null, countInBeats: number): number | null {
  const [beat, setBeat] = useState<number | null>(null);
  useEffect(() => {
    if (!run) {
      setBeat(null);
      return;
    }
    let frame = 0;
    let last: number | null = null;
    const tick = () => {
      const now = performance.now();
      let b: number | null = null;
      if (now >= run.countInMs && now < run.endMs) {
        b = Math.floor((now - run.startMs) / run.beatMs);
        if (b < -countInBeats) b = -countInBeats;
      }
      if (b !== last) {
        last = b;
        setBeat(b);
      }
      if (now < run.endMs) frame = requestAnimationFrame(tick);
      else setBeat(null);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [run, countInBeats]);
  return beat;
}
