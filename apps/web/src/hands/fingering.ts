/**
 * Pure helpers for the hand sessions: where the hands are at a beat, and how
 * steady a run was. Kept apart from the components so they are unit tested.
 */

import type { HandPosition, HandSide, TechniqueBeat } from '@music/contracts';

/** A finger on a hand, as a string key: "right-3". */
export type FingerId = `${HandSide}-${number}`;

export const fingerId = (hand: HandSide, finger: number): FingerId => `${hand}-${finger}`;

/** The hands' positions while beat `index` is played, after every move up to and including it. */
export function handsAt(start: readonly HandPosition[], beats: readonly TechniqueBeat[], index: number): HandPosition[] {
  const at = new Map(start.map((h) => [h.hand, h]));
  for (let i = 0; i <= Math.min(index, beats.length - 1); i++) {
    for (const m of beats[i]?.move ?? []) at.set(m.hand, m);
  }
  // Left hand first, so the hands draw in keyboard order.
  return [...at.values()].sort((a, b) => (a.hand === b.hand ? 0 : a.hand === 'left' ? -1 : 1));
}

/** The fingers that play a beat. */
export const beatFingers = (beat: TechniqueBeat | undefined): Set<FingerId> => new Set((beat?.notes ?? []).map((n) => fingerId(n.hand, n.finger)));

/**
 * Steadiness of a run from the times each beat was played, 0-100: 100 when
 * every gap is the same length, lower as the gaps vary (100 minus the
 * coefficient of variation in percent). Null with fewer than three beats.
 */
export function steadiness(times: readonly number[]): number | null {
  if (times.length < 3) return null;
  const gaps = times.slice(1).map((t, i) => t - times[i]!);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  if (mean <= 0) return null;
  const sd = Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length);
  return Math.max(0, Math.min(100, Math.round(100 - (sd / mean) * 100)));
}

/** A run counts toward the step when it has at most this many wrong keys. */
export const SLIPS_ALLOWED = 1;

/** Sessions finished on this device. Saved locally; nothing is sent to the server. */
const DONE_KEY = 'music.hands.done';

export function doneSessions(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DONE_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

export function markDone(id: string): void {
  try {
    localStorage.setItem(DONE_KEY, JSON.stringify([...doneSessions(), id]));
  } catch {
    // Private mode or storage full: the session still worked, it just won't show a tick.
  }
}
