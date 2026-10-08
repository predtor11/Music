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
 * count-in), in the same clock as `tapsMs`. A tap can count for an onset only
 * within `toleranceMs` of it. The matching keeps taps and onsets in time order
 * and takes the most matches, then the smallest total offset, so a late tap
 * never steals the next note's onset from the tap that was meant for it.
 */
export function gradeRhythm(
  onsetBeats: readonly number[],
  tapsMs: readonly number[],
  bpm: number,
  startMs: number,
  toleranceMs = 120,
): RhythmGrade {
  const expected = onsetBeats.map((beat) => ({ beat, at: startMs + beat * beatMs(bpm) }));
  const order = expected.map((_, i) => i).sort((a, b) => expected[a]!.at - expected[b]!.at);
  const taps = [...tapsMs].sort((a, b) => a - b);
  const n = order.length;
  const m = taps.length;

  // best[i][j]: the best matching of the first i onsets (in time order) with the first j taps.
  type Score = { matches: number; cost: number };
  const better = (a: Score, b: Score) => a.matches > b.matches || (a.matches === b.matches && a.cost < b.cost);
  const best: Score[][] = Array.from({ length: n + 1 }, () => Array.from({ length: m + 1 }, () => ({ matches: 0, cost: 0 })));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      let pick = better(best[i - 1]![j]!, best[i]![j - 1]!) ? best[i - 1]![j]! : best[i]![j - 1]!;
      const d = Math.abs(taps[j - 1]! - expected[order[i - 1]!]!.at);
      if (d <= toleranceMs) {
        const match = { matches: best[i - 1]![j - 1]!.matches + 1, cost: best[i - 1]![j - 1]!.cost + d };
        if (better(match, pick)) pick = match;
      }
      best[i]![j] = pick;
    }
  }

  // Walk back to find which tap went with which onset.
  const claimed = new Array<number | null>(n).fill(null);
  const used = new Array<boolean>(m).fill(false);
  for (let i = n, j = m; i > 0 && j > 0; ) {
    const here = best[i]![j]!;
    const d = Math.abs(taps[j - 1]! - expected[order[i - 1]!]!.at);
    const diag = best[i - 1]![j - 1]!;
    if (d <= toleranceMs && here.matches === diag.matches + 1 && here.cost === diag.cost + d) {
      claimed[order[i - 1]!] = taps[j - 1]! - expected[order[i - 1]!]!.at;
      used[j - 1] = true;
      i--;
      j--;
    } else if (here.matches === best[i - 1]![j]!.matches && here.cost === best[i - 1]![j]!.cost) i--;
    else j--;
  }
  const extra = taps.filter((_, j) => !used[j]);

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
