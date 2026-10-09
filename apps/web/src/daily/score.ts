/**
 * Scoring for the daily session, from what a MIDI keyboard can tell us: when
 * each key went down, how hard (velocity) and which keys were wrong. It cannot
 * see fingers, so nothing here claims to. Pure functions, unit tested.
 */

import type { TechniqueBeat } from '@music/contracts';
import type { Mode } from './exercises.js';

/** One finished pass through a drill. */
export interface RunData {
  /** Wrong or stray keys pressed during the pass. */
  slips: number;
  /** performance.now() when each beat was completed. */
  times: number[];
  /** Key-down velocity of each correct note, with the finger it belonged to. */
  touches: { finger: number; hand: 'left' | 'right'; velocity: number }[];
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** 100 when all values are equal, lower as they spread out (100 minus the spread as a percent of the mean). */
export function evenness(values: readonly number[]): number | null {
  if (values.length < 3) return null;
  const m = mean(values);
  if (m <= 0) return null;
  const sd = Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
  return clamp(Math.round(100 - (sd / m) * 100));
}

/** How even the gaps between beats were: steady timing. */
export function timingEvenness(times: readonly number[]): number | null {
  return evenness(times.slice(1).map((t, i) => t - times[i]!));
}

/** How even the touch was across the pass. */
export function touchEvenness(touches: RunData['touches']): number | null {
  return evenness(touches.map((t) => t.velocity));
}

/** Beats per minute the pass was actually played at (one beat = one step of the drill). */
export function playedBpm(times: readonly number[]): number | null {
  if (times.length < 3) return null;
  const gap = (times[times.length - 1]! - times[0]!) / (times.length - 1);
  return gap > 0 ? Math.round(60000 / gap) : null;
}

/**
 * The finger that pressed noticeably softer than the rest, when there is one
 * (more than 15% under the hand's average). Needs at least two presses of it.
 * Velocity is the closest thing a keyboard gives us to finger strength.
 */
export function softestFinger(touches: RunData['touches']): { hand: 'left' | 'right'; finger: number; percentBelow: number } | null {
  const groups = new Map<string, number[]>();
  for (const t of touches) groups.set(`${t.hand}-${t.finger}`, [...(groups.get(`${t.hand}-${t.finger}`) ?? []), t.velocity]);
  let worst: { hand: 'left' | 'right'; finger: number; percentBelow: number } | null = null;
  for (const hand of ['left', 'right'] as const) {
    const all = touches.filter((t) => t.hand === hand).map((t) => t.velocity);
    if (all.length < 4) continue;
    const avg = mean(all);
    for (const [key, vs] of groups) {
      if (!key.startsWith(hand) || vs.length < 2) continue;
      const below = Math.round((1 - mean(vs) / avg) * 100);
      if (below > 15 && (!worst || below > worst.percentBelow)) worst = { hand, finger: Number(key.split('-')[1]), percentBelow: below };
    }
  }
  return worst;
}

/** Whether the pass used a touch-sensitive source. Computer keys and clicks all give the same velocity. */
export function hasTouch(touches: RunData['touches']): boolean {
  return new Set(touches.map((t) => t.velocity)).size > 1;
}

export interface Verdict {
  mode: Mode;
  /** 0-100. */
  score: number;
  /** The pass counts toward the step. */
  clean: boolean;
  /** One plain sentence on what to do next. */
  advice: string;
  timing: number | null;
  touch: number | null;
  bpm: number | null;
}

export const SLIPS_OK = 1;
export const CONTROL_PASS = 80;

/** Judge a speed or control pass. Stability is judged hold by hold (see hold.ts). */
export function judgeRun(mode: Exclude<Mode, 'stability'>, run: RunData, targetBpm: number): Verdict {
  const timing = timingEvenness(run.times);
  const touch = hasTouch(run.touches) ? touchEvenness(run.touches) : null;
  const bpm = playedBpm(run.times);
  const slipsOk = run.slips <= SLIPS_OK;

  if (mode === 'speed') {
    const fast = bpm !== null && bpm >= targetBpm * 0.9;
    const clean = run.slips === 0 && fast;
    const score = clamp(Math.round(((bpm ?? 0) / targetBpm) * 100) - run.slips * 15);
    const advice = run.slips > 0 ? 'Wrong keys at that speed. Stay here until a pass is clean; speed comes from clean passes.' : !fast ? 'Clean, but under the target. One more at the same speed.' : 'Clean and on pace. The target goes up a little.';
    return { mode, score, clean, advice, timing, touch, bpm };
  }

  const parts = [timing, touch].filter((x): x is number => x !== null);
  const base = parts.length ? Math.round(mean(parts)) : 0;
  const score = clamp(base - run.slips * 10);
  const clean = slipsOk && score >= CONTROL_PASS;
  const advice = run.slips > SLIPS_OK ? 'A few wrong keys. Slow right down and aim for even, light, equal notes.' : timing !== null && timing < CONTROL_PASS ? 'The beats drifted. Follow the click and let each note land on it.' : touch !== null && touch < CONTROL_PASS ? 'The notes were uneven in loudness. Aim to play every finger at the same weight.' : 'Even and controlled. That is the goal.';
  return { mode, score, clean, advice, timing, touch, bpm };
}

/**
 * The target tempo for next time. Up about 5% after a clean pass on pace, a
 * little down after two unclean passes in a row, otherwise unchanged.
 * `recent` is newest last: true for each clean pass.
 */
export function nextTempo(current: number, recent: readonly boolean[], limits = { min: 40, max: 160 }): number {
  const step = Math.max(2, Math.round(current * 0.05));
  const last = recent[recent.length - 1];
  const prev = recent[recent.length - 2];
  if (last) return Math.min(limits.max, current + step);
  if (last === false && prev === false) return Math.max(limits.min, current - step);
  return current;
}

/** Tempo to start a drill at: what you reached last time, eased when your hands felt stiff. */
export function startTempo(last: number | undefined, fallback: number, ease: number): number {
  return Math.max(40, Math.round((last ?? fallback) * ease));
}

/** Rough run length in seconds at a tempo. */
export const runSeconds = (beats: readonly TechniqueBeat[], bpm: number) => (beats.length * 60) / bpm;
