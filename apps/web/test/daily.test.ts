import { TechniqueBeatSchema } from '@music/contracts';
import { describe, expect, it } from 'vitest';
import { FINGER_PATTERNS, PROGRESSIONS, PROGRESSION_KEYS, boomChickExercise, fingerExercise, jumpExercise, mirrorExercise, notesExercise, progressionExercise, shapeExercise, type Exercise } from '../src/daily/exercises.js';
import { holdProgress, newHold, nextHold, stepHold, type HoldState } from '../src/daily/hold.js';
import { buildPlan, leftShare, stabilityBeats } from '../src/daily/plan.js';
import { evenness, judgeRun, nextTempo, playedBpm, softestFinger, startTempo, timingEvenness } from '../src/daily/score.js';
import { dayKey, dayNumber, easeFactor, emptyData, recordDay, recordRun, recordStiffness, streak } from '../src/daily/storage.js';

function everyExercise(): Exercise[] {
  const list: Exercise[] = [mirrorExercise(), boomChickExercise()];
  for (const hand of ['left', 'right'] as const) {
    for (const p of FINGER_PATTERNS) list.push(fingerExercise(hand, p.id));
    for (const v of ['near', 'far'] as const) list.push(jumpExercise(hand, v));
    for (const k of ['root', 'inversions'] as const) list.push(shapeExercise(hand, k));
    for (const p of PROGRESSIONS) for (const k of PROGRESSION_KEYS) list.push(progressionExercise(hand, p.id, k.id));
    for (let seed = 0; seed < 5; seed++) list.push(notesExercise(hand, seed));
  }
  return list;
}

describe('exercises', () => {
  const all = everyExercise();

  it('are valid beats on keys between C3 and C5 (plus the chord tops)', () => {
    for (const ex of all) {
      expect(ex.beats.length, ex.id).toBeGreaterThanOrEqual(2);
      for (const b of ex.beats) {
        expect(TechniqueBeatSchema.safeParse(b).success, ex.id).toBe(true);
        for (const n of b.notes) {
          expect(n.midi, ex.id).toBeGreaterThanOrEqual(47);
          expect(n.midi, ex.id).toBeLessThanOrEqual(76);
        }
      }
    }
  });

  it('never put one hand on a key another beat note shares, and keep chord keys apart', () => {
    for (const ex of all) {
      for (const b of ex.beats) {
        const keys = b.notes.map((n) => n.midi);
        expect(new Set(keys).size, ex.id).toBe(keys.length);
      }
    }
  });

  it('use the hand they say they use', () => {
    for (const ex of all.filter((x) => x.hand !== 'both')) for (const b of ex.beats) for (const n of b.notes) expect(n.hand, ex.id).toBe(ex.hand);
  });

  it('place the left hand with the little finger lowest and the right with the thumb lowest', () => {
    const left = fingerExercise('left', 'run').hands[0]!.keys;
    const right = fingerExercise('right', 'run').hands[0]!.keys;
    expect(left).toEqual([...left].sort((a, b) => b - a));
    expect(right).toEqual([...right].sort((a, b) => a - b));
    expect(left[4]).toBe(48);
    expect(right[0]).toBe(60);
  });

  it('count fingers 3 and 4 as the weak work', () => {
    expect(fingerExercise('left', 'pair34').weak).toBe(8);
    expect(fingerExercise('left', 'run').weak).toBe(4);
  });

  it('mirror runs press the same finger in both hands, in opposite directions', () => {
    const m = mirrorExercise();
    for (const b of m.beats) {
      const [l, r] = [b.notes.find((n) => n.hand === 'left')!, b.notes.find((n) => n.hand === 'right')!];
      expect(l.finger).toBe(r.finger);
    }
    const first = m.beats[0]!.notes;
    const last = m.beats[4]!.notes;
    expect(last.find((n) => n.hand === 'right')!.midi).toBeGreaterThan(first.find((n) => n.hand === 'right')!.midi);
    expect(last.find((n) => n.hand === 'left')!.midi).toBeLessThan(first.find((n) => n.hand === 'left')!.midi);
  });

  it('progressions are the right chords', () => {
    const ex = progressionExercise('right', 'pop', 'G');
    expect(ex.blurb).toContain('G, D, Em, C');
    const c = progressionExercise('left', 'pop', 'C').beats[0]!.notes.map((n) => n.midi % 12).sort((a, b) => a - b);
    expect(c).toEqual([0, 4, 7]);
  });

  it('note drills never repeat a note back to back and are the same for the same seed', () => {
    const a = notesExercise('left', 7).beats.map((b) => b.notes[0]!.midi);
    expect(a).toEqual(notesExercise('left', 7).beats.map((b) => b.notes[0]!.midi));
    a.slice(1).forEach((m, i) => expect(m).not.toBe(a[i]));
    expect(notesExercise('left', 7).blind).toBe(true);
  });
});

describe('scoring', () => {
  const steady = [0, 500, 1000, 1500, 2000, 2500];

  it('rates even gaps 100 and wobbly gaps lower', () => {
    expect(timingEvenness(steady)).toBe(100);
    expect(timingEvenness([0, 300, 1000, 1200, 2300, 2400])!).toBeLessThan(60);
    expect(evenness([1, 2])).toBeNull();
  });

  it('works out the played tempo from the beat times', () => {
    expect(playedBpm(steady)).toBe(120);
    expect(playedBpm([0, 500])).toBeNull();
  });

  const touches = (v: number[]) => v.map((velocity, i) => ({ finger: (i % 5) + 1, hand: 'left' as const, velocity }));

  it('speed needs a clean pass at pace to count', () => {
    const run = { slips: 0, times: steady, touches: touches([70, 70, 70, 70, 70, 70]) };
    expect(judgeRun('speed', run, 110).clean).toBe(true);
    expect(judgeRun('speed', run, 160).clean).toBe(false);
    expect(judgeRun('speed', { ...run, slips: 1 }, 110).clean).toBe(false);
  });

  it('control reads timing and touch, and ignores touch from keys that have none', () => {
    const even = judgeRun('control', { slips: 0, times: steady, touches: touches([60, 62, 59, 61, 60, 62]) }, 60);
    expect(even.clean).toBe(true);
    const uneven = judgeRun('control', { slips: 0, times: steady, touches: touches([30, 100, 40, 90, 35, 95]) }, 60);
    expect(uneven.touch!).toBeLessThan(80);
    expect(uneven.clean).toBe(false);
    const flat = judgeRun('control', { slips: 0, times: steady, touches: touches([90, 90, 90, 90, 90, 90]) }, 60);
    expect(flat.touch).toBeNull();
    expect(flat.clean).toBe(true);
  });

  it('control fails on too many wrong keys', () => {
    expect(judgeRun('control', { slips: 3, times: steady, touches: touches([60, 60, 60, 60, 60, 60]) }, 60).clean).toBe(false);
  });

  it('finds the finger that plays much softer', () => {
    const t = [
      { finger: 1, hand: 'left' as const, velocity: 80 },
      { finger: 4, hand: 'left' as const, velocity: 45 },
      { finger: 1, hand: 'left' as const, velocity: 82 },
      { finger: 4, hand: 'left' as const, velocity: 47 },
      { finger: 2, hand: 'left' as const, velocity: 80 },
      { finger: 2, hand: 'left' as const, velocity: 81 },
    ];
    expect(softestFinger(t)).toMatchObject({ hand: 'left', finger: 4 });
    expect(softestFinger(t.filter((x) => x.finger !== 4))).toBeNull();
  });

  it('raises tempo only after a clean pass, lowers it after two rough ones', () => {
    expect(nextTempo(80, [true])).toBe(84);
    expect(nextTempo(80, [false])).toBe(80);
    expect(nextTempo(80, [true, false])).toBe(80);
    expect(nextTempo(80, [false, false])).toBe(76);
    expect(nextTempo(160, [true])).toBe(160);
    expect(nextTempo(40, [false, false])).toBe(40);
  });

  it('eases the start tempo', () => {
    expect(startTempo(100, 60, 0.85)).toBe(85);
    expect(startTempo(undefined, 60, 1)).toBe(60);
  });
});

describe('holds', () => {
  const target = [60, 64, 67];
  const run = (events: [string, number, number][]) => {
    let s = newHold();
    for (const [type, note, at] of events) s = stepHold(s, target, { type: type as 'on' | 'off', note, at });
    return s;
  };

  it('starts holding when all the keys are down together', () => {
    const s = run([['on', 60, 0], ['on', 64, 10], ['on', 67, 20]]);
    expect(s.phase).toBe('holding');
    expect(s.since).toBe(20);
    expect(holdProgress(s, 1020, 2000)).toBeCloseTo(0.5);
    expect(holdProgress(s, 99999, 2000)).toBe(1);
  });

  it('fails on a stray key while holding', () => {
    const s = run([['on', 60, 0], ['on', 64, 1], ['on', 67, 2], ['on', 61, 500]]);
    expect(s.phase).toBe('failed');
    expect(s.reason).toBe('stray');
  });

  it('fails when a key is let go early', () => {
    const s = run([['on', 60, 0], ['on', 64, 1], ['on', 67, 2], ['off', 64, 400]]);
    expect(s).toMatchObject({ phase: 'failed', reason: 'early' });
  });

  it('counts a wrong key before the chord is found as a slip, not a failure', () => {
    const s = run([['on', 61, 0], ['on', 60, 5]]);
    expect(s.phase).toBe('waiting');
    expect(s.slips).toBe(1);
  });

  it('waits for old keys to be released before it starts a new hold', () => {
    let s: HoldState = { ...newHold(), down: new Set([48]) };
    s = stepHold(s, target, { type: 'on', note: 60, at: 0 });
    s = stepHold(s, target, { type: 'on', note: 64, at: 1 });
    s = stepHold(s, target, { type: 'on', note: 67, at: 2 });
    expect(s.phase).toBe('waiting');
    s = stepHold(s, target, { type: 'off', note: 48, at: 3 });
    expect(s.phase).toBe('holding');
  });

  it('grows the hold after a clean pass and shrinks it after a rough one', () => {
    expect(nextHold(3, true)).toBe(4);
    expect(nextHold(10, true)).toBe(10);
    expect(nextHold(3, false)).toBe(2);
    expect(nextHold(2, false)).toBe(2);
  });
});

describe('storage', () => {
  it('counts the streak back from today, or from yesterday while today is not done', () => {
    const day = (n: number) => dayKey(new Date(2026, 9, n));
    const days = { [day(7)]: { done: true, leftSec: 0, rightSec: 0 }, [day(8)]: { done: true, leftSec: 0, rightSec: 0 } };
    expect(streak(days, day(8))).toBe(2);
    expect(streak(days, day(9))).toBe(2);
    expect(streak(days, day(10))).toBe(0);
    expect(streak({ ...days, [day(9)]: { done: true, leftSec: 0, rightSec: 0 } }, day(9))).toBe(3);
  });

  it('eases the next days after a stiff session, then goes back to normal', () => {
    const d = recordStiffness(emptyData(), '2026-10-09', 'stiff');
    expect(easeFactor(d.stiff, '2026-10-09')).toBe(0.85);
    expect(easeFactor(d.stiff, '2026-10-11')).toBe(0.85);
    expect(easeFactor(d.stiff, '2026-10-13')).toBe(1);
    expect(easeFactor([], '2026-10-13')).toBe(1);
  });

  it('keeps tempo per mode and adds up the hands', () => {
    let d = recordRun(emptyData(), 'x', 'speed', '2026-10-09', { clean: true, score: 90, tempo: 84 });
    d = recordRun(d, 'x', 'control', '2026-10-09', { clean: false, score: 70, tempo: 50 });
    d = recordRun(d, 'x', 'stability', '2026-10-09', { clean: true, score: 100, tempo: 4 });
    expect(d.ex.x).toMatchObject({ runs: 3, clean: 2, speed: 84, control: 50, hold: 4 });
    d = recordDay(d, '2026-10-09', { leftSec: 60, rightSec: 30 }, false);
    d = recordDay(d, '2026-10-09', { leftSec: 30, rightSec: 30 }, true);
    expect(d.days['2026-10-09']).toEqual({ done: true, leftSec: 90, rightSec: 60 });
  });

  it('day numbers step by one per day', () => {
    expect(dayNumber('2026-10-10') - dayNumber('2026-10-09')).toBe(1);
  });
});

describe('daily plan', () => {
  const days = Array.from({ length: 14 }, (_, i) => dayKey(new Date(2026, 9, 1 + i)));

  it('is the same on the same day', () => {
    expect(buildPlan(days[0]!, emptyData())).toEqual(buildPlan(days[0]!, emptyData()));
  });

  it('has five work blocks and two rests with a stiffness check', () => {
    const p = buildPlan(days[0]!, emptyData());
    expect(p.items.filter((i) => i.type === 'work')).toHaveLength(5);
    const rests = p.items.filter((i) => i.type === 'rest');
    expect(rests).toHaveLength(2);
    expect(rests.every((r) => r.type === 'rest' && r.check)).toBe(true);
  });

  it('leans on the left hand, 60/40 over two weeks and never below half', () => {
    const shares = days.map((d) => buildPlan(d, emptyData()).leftShare);
    for (const s of shares) {
      expect(s).toBeGreaterThanOrEqual(0.5);
      expect(s).toBeLessThanOrEqual(0.7);
    }
    const mean = shares.reduce((a, b) => a + b, 0) / shares.length;
    expect(mean).toBeGreaterThan(0.57);
    expect(mean).toBeLessThan(0.66);
  });

  it('gives the left hand fingers 3 and 4 work every day', () => {
    for (const d of days) {
      const work = buildPlan(d, emptyData()).items.flatMap((i) => (i.type === 'work' ? [i] : []));
      expect(work.some((w) => w.exercise.focus === 'finger' && w.exercise.hand === 'left' && w.exercise.weak >= 3)).toBe(true);
    }
  });

  it('covers every kind of practice across two weeks, in all three modes', () => {
    const work = days.flatMap((d) => buildPlan(d, emptyData()).items.flatMap((i) => (i.type === 'work' ? [i] : [])));
    for (const f of ['finger', 'move', 'shape', 'progression', 'notes', 'mirror']) expect(work.some((w) => w.exercise.focus === f), f).toBe(true);
    for (const m of ['speed', 'control', 'stability']) expect(work.some((w) => w.mode === m), m).toBe(true);
  });

  it('fits about the minutes asked and has playable reps', () => {
    for (const minutes of [10, 12, 15]) {
      const p = buildPlan(days[3]!, emptyData(), minutes);
      for (const it of p.items) if (it.type === 'work') expect(it.reps).toBeGreaterThanOrEqual(2);
    }
  });

  it('starts easier after a stiff session and picks up where you left off', () => {
    const base = buildPlan(days[0]!, emptyData());
    const first = base.items[0]!;
    if (first.type !== 'work') throw new Error('expected work');
    const stiff = recordStiffness(emptyData(), days[0]!, 'stiff');
    const easier = buildPlan(days[1]!, stiff).items[0]!;
    const same = buildPlan(days[1]!, emptyData()).items[0]!;
    if (easier.type !== 'work' || same.type !== 'work') throw new Error('expected work');
    expect(easier.tempo).toBeLessThan(same.tempo);
    const progressed = recordRun(emptyData(), first.exercise.id, first.mode, days[0]!, { clean: true, score: 95, tempo: 77 });
    const again = buildPlan(days[0]!, progressed).items[0]!;
    if (again.type !== 'work') throw new Error('expected work');
    expect(again.tempo).toBe(77);
  });

  it('holds only a short run in stability blocks', () => {
    for (const d of days) for (const it of buildPlan(d, emptyData()).items) if (it.type === 'work' && it.mode === 'stability') expect(stabilityBeats(it.exercise).length).toBeLessThanOrEqual(5);
  });

  it('leftShare counts a both-hands block as half each', () => {
    const p = buildPlan(days.find((d) => buildPlan(d, emptyData()).items.some((i) => i.type === 'work' && i.exercise.hand === 'both'))!, emptyData());
    expect(leftShare(p.items)).toBe(p.leftShare);
  });
});
