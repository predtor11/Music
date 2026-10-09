import { TestItemSchema } from '@music/contracts';
import { chordFromNumeral, mod12, parseKey } from '@music/theory';
import { describe, expect, it } from 'vitest';
import { freshTune, gradeEarChord, pressKey, pressTune, type TuneState } from '../src/ear/grade.js';
import {
  EAR_LEVELS,
  earLevel,
  makeRound,
  seeded,
  stepNote,
  tuneSteps,
  type ChordQuestion,
  type EarQuestion,
  type KeyQuestion,
  type MelodyQuestion,
} from '../src/ear/questions.js';

/** A 25-key board: C3-C5. */
const LOW = 48;
const HIGH = 72;

const round = (id: string, seed = 7): EarQuestion[] => makeRound(earLevel(id)!, seeded(seed));
const chords = (id: string, seed?: number) => round(id, seed) as ChordQuestion[];

describe('ear levels', () => {
  it('every level makes ten questions that fit a 25-key board', () => {
    for (const level of EAR_LEVELS) {
      for (const seed of [1, 2, 3, 42]) {
        const qs = makeRound(level, seeded(seed));
        expect(qs).toHaveLength(10);
        for (const q of qs) {
          if (q.type === 'progression') {
            expect(TestItemSchema.parse(q.item)).toEqual(q.item);
            continue;
          }
          for (const k of q.answerKeys) expect(k, `${level.id} ${q.prompt}`).toBeGreaterThanOrEqual(LOW);
          for (const k of q.answerKeys) expect(k, `${level.id} ${q.prompt}`).toBeLessThanOrEqual(HIGH);
        }
      }
    }
  });

  it('is the same round for the same seed', () => {
    expect(round('chords-in-key', 5)).toEqual(round('chords-in-key', 5));
  });

  it('never asks the same question twice in a row', () => {
    for (const level of EAR_LEVELS) {
      const qs = makeRound(level, seeded(11));
      for (let i = 1; i < qs.length; i++) expect(JSON.stringify(qs[i])).not.toEqual(JSON.stringify({ ...qs[i - 1], id: qs[i]!.id }));
    }
  });

  it('major or minor: plays the chord, then broken up, and names it', () => {
    for (const q of chords('major-minor-root')) {
      expect(['major', 'minor']).toContain(q.quality);
      expect(q.listen).toEqual([
        { kind: 'chord', notes: q.answerKeys },
        { kind: 'sequence', notes: q.answerKeys },
      ]);
      expect(q.answer).toMatch(/ (major|minor)$/);
      // The root is named in the prompt but the colour isn't.
      expect(q.prompt).not.toMatch(/is (major|minor)\b/);
      expect(TestItemSchema.parse(q.item)).toEqual(q.item);
      expect(q.item.byEar).toBe(true);
      expect(q.item.bassPc).toBeNull();
      expect(q.item.pitchClasses).toEqual(q.answerKeys.map(mod12));
    }
  });

  it('spells a minor chord on its own letters', () => {
    const q = chords('major-minor-root', 1).find((x) => x.quality === 'minor' && x.answer.startsWith('E '));
    if (q) expect(q.detail).toBe('Notes: E, G and B.');
    const c = chords('major-minor', 3).find((x) => x.answer === 'E♭ minor');
    if (c) expect(c.detail).toBe('Notes: E♭, G♭ and B♭.');
  });

  it('chords in a key: home first, then a chord of the key', () => {
    for (const q of chords('one-four-five')) {
      const home = chordFromNumeral('1', q.key)!;
      expect(q.listen[0]).toEqual({ kind: 'chord', notes: expect.any(Array) });
      expect((q.listen[0] as { notes: number[] }).notes.map(mod12)).toEqual(home.pitchClasses);
      const number = Number(/The (\d) chord/.exec(q.detail)![1]);
      expect([1, 4, 5]).toContain(number);
      expect(chordFromNumeral(String(number), q.key)!.pitchClasses).toEqual(q.item.pitchClasses);
    }
  });

  it('tunes start on home and move by small steps', () => {
    for (const q of round('melody') as MelodyQuestion[]) {
      expect(q.order[0]).toBe(mod12(q.answerKeys[0]!));
      expect(q.order.length).toBeGreaterThanOrEqual(4);
      for (let i = 1; i < q.answerKeys.length; i++) expect(Math.abs(q.answerKeys[i]! - q.answerKeys[i - 1]!)).toBeLessThanOrEqual(5);
    }
  });

  it('tune steps stay in range and can end on home', () => {
    const rng = seeded(9);
    for (let i = 0; i < 50; i++) {
      const steps = tuneSteps(rng, 7, true);
      expect(steps.at(-1)).toBe(0);
      for (const st of steps) expect(st).toBeGreaterThanOrEqual(-1);
      for (const st of steps) expect(st).toBeLessThanOrEqual(5);
      for (let j = 1; j < steps.length; j++) expect(steps[j]).not.toBe(steps[j - 1]);
    }
    expect([-1, 0, 1, 2, 3, 4, 5].map((st) => stepNote(60, st))).toEqual([59, 60, 62, 64, 65, 67, 69]);
  });

  it('what key: the answer is the scale from home', () => {
    for (const q of round('key-chords') as KeyQuestion[]) {
      expect(mod12(q.answerKeys[0]!)).toBe(q.tonicPc);
      expect(q.answerKeys).toHaveLength(8);
      expect(q.answer).toMatch(/ major$/);
      expect(q.listen.every((x) => x.kind === 'chord')).toBe(true);
    }
    for (const q of round('key-tune') as KeyQuestion[]) {
      const tune = q.listen[0]!.notes;
      expect(mod12(tune.at(-1)!)).toBe(q.tonicPc);
      expect(mod12(tune[0]!)).not.toBe(q.tonicPc);
    }
  });
});

describe('ear grading', () => {
  const q = chords('one-four-five', 2).find((x) => x.detail.startsWith('The 4 chord'))!;
  const keyOf = q.key;
  const one = chordFromNumeral('1', keyOf)!;
  const five = chordFromNumeral('5', keyOf)!;
  const voiced = (pcs: number[], from = 60) => pcs.map((pc) => from + mod12(pc - from));

  it('takes the chord in any inversion and octave', () => {
    const [a, b, c] = q.item.pitchClasses;
    const notes = [72 + mod12(b! - 72) - 12, 72 + mod12(c! - 72) - 12, 72 + mod12(a! - 72)].sort((x, y) => x - y);
    expect(gradeEarChord(q, notes)?.correct).toBe(true);
  });

  it('waits until enough notes are down', () => {
    expect(gradeEarChord(q, [60, 64])).toBeNull();
  });

  it('names a wrong chord by its number in the key, without naming the answer', () => {
    const v = gradeEarChord(q, voiced(five.pitchClasses))!;
    expect(v.correct).toBe(false);
    expect(v.message).toMatch(/the 5 chord/);
    expect(v.message).not.toContain(q.answer.split(' ')[0]!);
    expect([...v.marks.values()]).not.toContain('missed');
    expect(gradeEarChord(q, voiced(one.pitchClasses))!.message).toMatch(/the 1 chord/);
  });

  it('says when the root is right but the colour is wrong', () => {
    const mm = chords('major-minor-root', 4)[0]!;
    const other = mm.quality === 'major' ? [mm.rootPc, mm.rootPc + 3, mm.rootPc + 7] : [mm.rootPc, mm.rootPc + 4, mm.rootPc + 7];
    const v = gradeEarChord(mm, other.map((pc) => 60 + mod12(pc - 60)).sort((a, b) => a - b))!;
    expect(v.correct).toBe(false);
    expect(v.message).toMatch(/Right root, wrong colour/);
  });

  it('grades a tune note by note, any octave, and restarts after a miss', () => {
    const tune = (round('melody') as MelodyQuestion[])[0]!;
    const play = (notes: number[]): TuneState => notes.reduce((s, n) => pressTune(tune, s, n), freshTune());
    const up = tune.answerKeys.map((n) => n + 12);
    expect(play(up).verdict?.correct).toBe(true);
    const wrong = play([tune.answerKeys[0]!, tune.answerKeys[1]! + 1]);
    expect(wrong.verdict?.correct).toBe(false);
    expect(wrong.verdict?.message).toMatch(/Note 2/);
    expect([...wrong.marks.values()]).not.toContain('missed');
  });

  it('what key: home is right, other notes get a hint', () => {
    const k = (round('key-chords') as KeyQuestion[])[0]!;
    expect(pressKey(k, k.answerKeys[0]! + 12).correct).toBe(true);
    expect(pressKey(k, k.answerKeys[4]!).message).toMatch(/belongs to the key/);
    expect(pressKey(k, k.answerKeys[0]! + 1).message).toMatch(/isn’t in this key/);
  });

  it('parses every key the levels use', () => {
    for (const level of EAR_LEVELS) for (const x of makeRound(level, seeded(3))) if (x.type === 'progression') expect(parseKey(x.item.key)).not.toBeNull();
  });
});
