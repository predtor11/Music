/**
 * Rhythm: turning beats into time and checking taps against them. Pure, so the
 * browser grades a tap the moment it lands.
 */

/** Milliseconds per beat at a tempo. */
export function beatMs(bpm: number): number {
  return 60_000 / bpm;
}

export interface RhythmHit {
  /** The beat this note was expected on. */
  beat: number;
  /** How early (negative) or late (positive) the tap was, or null when it was missed. */
  offsetMs: number | null;
}

export interface RhythmGrade {
  correct: boolean;
  hits: RhythmHit[];
  /** Taps that matched no expected note. */
  extra: number[];
  missing: number;
  /** Average distance from the beat over the taps that hit, for "you rush" or "you drag". */
  meanOffsetMs: number | null;
  message: string;
}

/**
 * Match taps to the expected onsets. `startMs` is when beat 0 falls (after the
 * count-in), in the same clock as `tapsMs`. Each tap counts for the nearest
 * unclaimed onset within `toleranceMs`.
 */
export function gradeRhythm(
  onsetBeats: readonly number[],
  tapsMs: readonly number[],
  bpm: number,
  startMs: number,
  toleranceMs = 120,
): RhythmGrade {
  const expected = onsetBeats.map((beat) => ({ beat, at: startMs + beat * beatMs(bpm) }));
  const claimed = new Array<number | null>(expected.length).fill(null);
  const extra: number[] = [];
  for (const tap of [...tapsMs].sort((a, b) => a - b)) {
    let best = -1;
    for (let i = 0; i < expected.length; i++) {
      if (claimed[i] !== null) continue;
      const d = Math.abs(tap - expected[i]!.at);
      if (d <= toleranceMs && (best < 0 || d < Math.abs(tap - expected[best]!.at))) best = i;
    }
    if (best < 0) extra.push(tap);
    else claimed[best] = tap - expected[best]!.at;
  }
  const hits = expected.map((e, i) => ({ beat: e.beat, offsetMs: claimed[i] === null ? null : Math.round(claimed[i]!) }));
  const landed = hits.flatMap((h) => (h.offsetMs === null ? [] : [h.offsetMs]));
  const missing = hits.length - landed.length;
  const meanOffsetMs = landed.length ? Math.round(landed.reduce((a, b) => a + b, 0) / landed.length) : null;
  const correct = missing === 0 && extra.length === 0;
  let message: string;
  if (correct) message = 'Right on the beat.';
  else if (missing > 0 && extra.length > 0) message = `${missing} note${missing > 1 ? 's' : ''} off the beat.`;
  else if (missing > 0) message = `You missed ${missing} note${missing > 1 ? 's' : ''}.`;
  else message = `${extra.length} extra tap${extra.length > 1 ? 's' : ''}.`;
  if (!correct && meanOffsetMs !== null && Math.abs(meanOffsetMs) > toleranceMs / 2) {
    message += meanOffsetMs < 0 ? ' You are rushing a little.' : ' You are dragging a little.';
  }
  return { correct, hits, extra, missing, meanOffsetMs, message };
}
