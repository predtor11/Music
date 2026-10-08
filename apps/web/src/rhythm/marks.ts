/**
 * What the rhythm timeline draws after a try: each tap at the beat it landed
 * on, how early or late it was against the nearest note, and which notes were
 * missed. Pure, built from gradeRhythm's result.
 */

import type { RhythmGrade } from '@music/theory';

export interface TapMark {
  /** Where the tap landed, in beats from beat 0. */
  beat: number;
  /** Early (negative) or late (positive) against the nearest note, in ms. */
  offsetMs: number;
  /** The note it was nearest to. */
  onset: number;
  good: boolean;
}

export interface TargetMark {
  beat: number;
  hit: boolean;
  offsetMs: number | null;
}

export function rhythmMarks(grade: RhythmGrade, tapsMs: readonly number[], startMs: number, beatMs: number): { taps: TapMark[]; targets: TargetMark[] } {
  const targets = grade.hits.map((h) => ({ beat: h.beat, hit: h.offsetMs !== null, offsetMs: h.offsetMs }));
  const extra = new Set(grade.extra);
  // Matched taps take the offset gradeRhythm gave them; extra ones are measured from the nearest note.
  const claimed = grade.hits.flatMap((h) => (h.offsetMs === null ? [] : [{ at: startMs + h.beat * beatMs + h.offsetMs, beat: h.beat, offsetMs: h.offsetMs }]));
  const taps = [...tapsMs]
    .sort((a, b) => a - b)
    .map((t) => {
      const beat = (t - startMs) / beatMs;
      const hit = extra.has(t) ? undefined : claimed.find((c) => Math.abs(c.at - t) < 1);
      if (hit) return { beat, offsetMs: hit.offsetMs, onset: hit.beat, good: true };
      const nearest = targets.reduce((best, x) => (Math.abs(x.beat - beat) < Math.abs(best.beat - beat) ? x : best), targets[0]!);
      return { beat, offsetMs: Math.round((beat - nearest.beat) * beatMs), onset: nearest.beat, good: false };
    });
  return { taps, targets };
}

/** "On time", "80 ms late", "45 ms early". */
export function offsetText(ms: number): string {
  if (Math.abs(ms) < 15) return 'On time';
  return `${Math.abs(ms)} ms ${ms < 0 ? 'early' : 'late'}`;
}
