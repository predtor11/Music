import type { StoredAttempt } from '@music/contracts';
import { randomUUID } from 'node:crypto';

export const USER = '7b0f8a8e-4c1e-4a65-9a52-2f6a3c1d9e10';
/** India, where Jayesh plays. */
export const IST = 330;
/** Sunday 11 Oct 2026, 23:30 in India: the end of the report week. */
export const WEEK_END = new Date('2026-10-11T18:00:00.000Z');

type Spec = Pick<StoredAttempt, 'skill' | 'itemKind' | 'expected' | 'played' | 'correct'> & Partial<StoredAttempt>;

const C = 60;
const items = {
  m3: (ok = true): Spec => ({ skill: 'interval:m3', itemKind: 'play-interval', expected: [C, C + 3], played: [C, ok ? C + 3 : C + 4], correct: ok }),
  M3: (ok = true): Spec => ({ skill: 'interval:M3', itemKind: 'play-interval', expected: [C + 2, C + 6], played: [C + 2, ok ? C + 6 : C + 5], correct: ok }),
  P5: (ok = true): Spec => ({ skill: 'interval:P5', itemKind: 'play-interval', expected: [C, C + 7], played: [C, ok ? C + 7 : C + 6], correct: ok }),
  major: (ok = true): Spec => ({ skill: 'chord:major', itemKind: 'build-chord', expected: [C, C + 4, C + 7], played: ok ? [C, C + 4, C + 7] : [C, C + 3, C + 7], correct: ok }),
  minor: (ok = true): Spec => ({ skill: 'chord:minor', itemKind: 'build-chord', expected: [C + 9, C + 12, C + 16], played: [C + 9, C + 12, C + 16], correct: ok }),
  gMajor: (ok = true): Spec => {
    const scale = [67, 69, 71, 72, 74, 76, 78, 79];
    return { skill: 'scale:G-major', itemKind: 'play-scale', expected: scale, played: ok ? scale : scale.map((n) => (n === 78 ? 77 : n)), correct: ok };
  },
  fSharp: (ok = true): Spec => ({ skill: 'note:F#', itemKind: 'find-note', expected: [66], played: [ok ? 66 : 78], correct: ok, mistake: ok ? null : 'wrong-octave' }),
};

/**
 * One practice session: attempts spaced `gapS` seconds apart from `start`,
 * each taking `timeMs` (slower by `slow`), with retries where asked.
 */
function session(start: string, specs: Spec[], opts: { slow?: number; gapS?: number } = {}): StoredAttempt[] {
  const sessionId = randomUUID();
  const t0 = Date.parse(start);
  return specs.map((spec, i) => {
    const base = spec.itemKind === 'play-scale' ? 6000 : spec.itemKind === 'build-chord' ? 3500 : 2200;
    return {
      id: randomUUID(),
      userId: USER,
      sessionId,
      itemId: `${spec.skill}#${i}`,
      retried: false,
      mistake: spec.correct ? null : 'wrong-note',
      timeMs: Math.round(base * (opts.slow ?? 1) + (i % 5) * 150),
      playedAt: new Date(t0 + i * (opts.gapS ?? 30) * 1000).toISOString(),
      ...spec,
    } as StoredAttempt;
  });
}

const { m3, M3, P5, major, minor, gMajor, fSharp } = items;
const retried = (s: Spec): Spec => ({ ...s, retried: true, mistake: 'wrong-note' });

/**
 * A realistic week. Evenings in India, 6 days of 7 (none on Thursday 8th).
 * Planted problems: major/minor 3rds mixed up 6 times, a minor 3rd played in
 * major chords 3 times, F# left out of G major twice, one wrong-octave F#.
 * Answers are about 20% faster than the week before.
 */
export function realisticWeek(): StoredAttempt[] {
  return [
    // Monday 5 Oct, 19:30 IST: intervals.
    ...session('2026-10-05T14:00:00Z', [m3(), M3(false), m3(), M3(), P5(), M3(false), m3(), P5(), M3(), m3(false), P5(), M3()]),
    // Tuesday 6 Oct: intervals and first chords.
    ...session('2026-10-06T14:10:00Z', [M3(), m3(), M3(false), P5(), major(), major(false), minor(), major(), M3(), m3(), retried(minor()), major()]),
    // Wednesday 7 Oct: chords, a short session.
    ...session('2026-10-07T15:00:00Z', [major(), minor(), major(false), minor(), major(), P5(false), m3(), M3()]),
    // Friday 9 Oct: scales and note finding.
    ...session('2026-10-09T13:45:00Z', [gMajor(), gMajor(false), gMajor(), fSharp(), fSharp(false), fSharp(), m3(false), M3(), major(), gMajor()]),
    // Saturday 10 Oct: two sittings.
    ...session('2026-10-10T04:30:00Z', [gMajor(false), gMajor(), fSharp(), M3(false), m3(), P5()]),
    ...session('2026-10-10T14:30:00Z', [major(), minor(), major(false), retried(major()), minor(), M3(), m3(), P5(), gMajor()]),
    // Sunday 11 Oct, late evening.
    ...session('2026-10-11T16:00:00Z', [m3(), M3(), P5(), major(), minor(), gMajor(), fSharp(), M3(), m3(), major()]),
  ];
}

/** The week before: fewer, slower sessions, used as the speed baseline. */
export function weekBefore(): StoredAttempt[] {
  return [
    ...session('2026-09-28T14:00:00Z', [m3(), M3(), P5(), m3(), M3(), P5()], { slow: 1.25 }),
    ...session('2026-09-30T14:00:00Z', [major(), minor(), major(), m3(), M3()], { slow: 1.25 }),
    ...session('2026-10-02T14:00:00Z', [gMajor(), fSharp(), M3(), P5(), major()], { slow: 1.25 }),
  ];
}

export { items, session };
