/**
 * What you have done in the daily sessions, kept in this browser (like the
 * ear trainer's scores). Pure helpers over a plain object, plus a thin
 * localStorage wrapper that never throws.
 */

import type { Mode } from './exercises.js';

export type Stiffness = 'loose' | 'tight' | 'stiff' | 'pain';

export interface ExStats {
  runs: number;
  clean: number;
  /** Tempo reached in speed mode, beats per minute. */
  speed?: number;
  /** Click tempo in control mode. */
  control?: number;
  /** Seconds held in stability mode. */
  hold?: number;
  lastScore?: number;
  lastDay?: string;
}

export interface DayLog {
  done: boolean;
  /** Seconds of playing, by hand. */
  leftSec: number;
  rightSec: number;
}

export interface DailyData {
  days: Record<string, DayLog>;
  ex: Record<string, ExStats>;
  stiff: { day: string; level: Stiffness }[];
}

export const emptyData = (): DailyData => ({ days: {}, ex: {}, stiff: [] });

const KEY = 'music.daily.v1';

export function load(): DailyData {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<DailyData> | null;
    return { ...emptyData(), ...(raw ?? {}) };
  } catch {
    return emptyData();
  }
}

export function save(data: DailyData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Private mode or storage full: the session still worked, it just won't be remembered.
  }
}

/** Local date as YYYY-MM-DD. */
export function dayKey(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Whole days since 1970 for a day key, for rotating what comes up. */
export function dayNumber(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Math.floor(Date.UTC(y!, m! - 1, d!) / 86400000);
}

/** Consecutive days with a finished session, counting back from today (or from yesterday if today is not done yet). */
export function streak(days: DailyData['days'], today: string): number {
  let n = 0;
  let at = dayNumber(today);
  if (!days[today]?.done) at -= 1;
  for (;;) {
    const key = new Date(at * 86400000).toISOString().slice(0, 10);
    if (!days[key]?.done) return n;
    n += 1;
    at -= 1;
  }
}

/** Tempo multiplier to start with: easier for a couple of days after a stiff or sore session. */
export function easeFactor(stiff: DailyData['stiff'], today: string): number {
  const last = stiff[stiff.length - 1];
  if (!last) return 1;
  const gap = dayNumber(today) - dayNumber(last.day);
  if (gap > 2) return 1;
  return last.level === 'pain' ? 0.75 : last.level === 'stiff' ? 0.85 : last.level === 'tight' ? 0.95 : 1;
}

export function recordRun(data: DailyData, id: string, mode: Mode, day: string, patch: { clean: boolean; score: number; tempo?: number }): DailyData {
  const prev = data.ex[id] ?? { runs: 0, clean: 0 };
  const next: ExStats = { ...prev, runs: prev.runs + 1, clean: prev.clean + (patch.clean ? 1 : 0), lastScore: patch.score, lastDay: day };
  if (patch.tempo !== undefined) {
    if (mode === 'speed') next.speed = patch.tempo;
    else if (mode === 'control') next.control = patch.tempo;
    else next.hold = patch.tempo;
  }
  return { ...data, ex: { ...data.ex, [id]: next } };
}

export function recordDay(data: DailyData, day: string, add: { leftSec: number; rightSec: number }, done: boolean): DailyData {
  const prev = data.days[day] ?? { done: false, leftSec: 0, rightSec: 0 };
  return { ...data, days: { ...data.days, [day]: { done: prev.done || done, leftSec: prev.leftSec + add.leftSec, rightSec: prev.rightSec + add.rightSec } } };
}

export function recordStiffness(data: DailyData, day: string, level: Stiffness): DailyData {
  return { ...data, stiff: [...data.stiff, { day, level }].slice(-30) };
}
