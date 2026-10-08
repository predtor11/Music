/**
 * A rhythm as notes and rests VexFlow can draw. Beats follow the time
 * signature (in 6/8 a beat is an eighth note). Notes that cross a bar line,
 * or last a length no single note can show, are split and tied.
 */

export interface RhythmPattern {
  timeSignature: readonly [number, number];
  /** Note starts, in beats from the first downbeat. */
  onsets: readonly number[];
  /** Note lengths in beats; by default each note lasts until the next one (the last one, one beat). */
  durations?: readonly number[];
}

export interface RhythmToken {
  rest: boolean;
  /** VexFlow duration: "w", "h", "q", "8", "16". */
  duration: string;
  dots: number;
  /** Where it starts, in beats. */
  start: number;
  beats: number;
  /** Bar number, from 0. */
  bar: number;
  /** Tied to the next token (one note split in two). */
  tie: boolean;
  /** Which onset this note sounds (only on the first piece of a note). */
  onset: number | null;
}

/** Lengths one written note can show, in quarter notes, longest first. */
const VALUES: ReadonlyArray<[quarters: number, duration: string, dots: number]> = [
  [4, 'w', 0],
  [3, 'h', 1],
  [2, 'h', 0],
  [1.5, 'q', 1],
  [1, 'q', 0],
  [0.75, '8', 1],
  [0.5, '8', 0],
  [0.25, '16', 0],
];

const EPS = 1e-6;

export function beatsPerBar(ts: readonly [number, number]): number {
  return ts[0];
}

/** Note lengths in beats, filled in when the item leaves them out. */
export function noteLengths(p: RhythmPattern): number[] {
  return p.onsets.map((on, i) => {
    const given = p.durations?.[i];
    if (given !== undefined) return given;
    const next = p.onsets[i + 1];
    return next !== undefined ? next - on : 1;
  });
}

/** How many whole bars the pattern fills. */
export function barsFor(p: RhythmPattern): number {
  const lengths = noteLengths(p);
  const end = Math.max(...p.onsets.map((on, i) => on + lengths[i]!));
  return Math.max(1, Math.ceil(end / beatsPerBar(p.timeSignature) - EPS));
}

/** Split a length into written values, longest first. Returns null if it can't be written. */
function split(beats: number, quarterPerBeat: number): Array<[string, number, number]> | null {
  const out: Array<[string, number, number]> = [];
  let left = beats * quarterPerBeat;
  while (left > EPS) {
    const v = VALUES.find(([q]) => q <= left + EPS);
    if (!v) return null;
    out.push([v[1], v[2], v[0] / quarterPerBeat]);
    left -= v[0];
  }
  return out;
}

/** Notes and rests in order, or null when the rhythm uses lengths shorter than a sixteenth. */
export function rhythmTokens(p: RhythmPattern): RhythmToken[] | null {
  const perBar = beatsPerBar(p.timeSignature);
  const quarterPerBeat = 4 / p.timeSignature[1];
  const total = barsFor(p) * perBar;
  const lengths = noteLengths(p);

  // Notes and the rests between them, as [start, length, onset index or null].
  const spans: Array<[number, number, number | null]> = [];
  let at = 0;
  const order = p.onsets.map((on, i) => [on, i] as const).sort((a, b) => a[0] - b[0]);
  for (const [on, i] of order) {
    if (on > at + EPS) spans.push([at, on - at, null]);
    const end = Math.min(on + lengths[i]!, order.find(([o]) => o > on + EPS)?.[0] ?? total);
    spans.push([on, end - on, i]);
    at = end;
  }
  if (total > at + EPS) spans.push([at, total - at, null]);

  const tokens: RhythmToken[] = [];
  for (const [start, len, onset] of spans) {
    // Cut at bar lines, then into writable values.
    let s = start;
    const end = start + len;
    let first = true;
    while (s < end - EPS) {
      const barEnd = (Math.floor(s / perBar + EPS) + 1) * perBar;
      const pieceEnd = Math.min(end, barEnd);
      const parts = split(pieceEnd - s, quarterPerBeat);
      if (!parts) return null;
      for (const [duration, dots, beats] of parts) {
        tokens.push({ rest: onset === null, duration, dots, start: s, beats, bar: Math.floor(s / perBar + EPS), tie: false, onset: first ? onset : null });
        first = false;
        s += beats;
      }
    }
    if (onset !== null) for (let k = tokens.length - 1; k >= 0 && tokens[k]!.onset !== onset; k--) tokens[k - 1]!.tie = true;
  }
  return tokens;
}
