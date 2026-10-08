import { describe, expect, it } from 'vitest';
import { chordKeys, diatonicNumber, gradeProgressionChord, progressionKey, progressionLabel, progressionSteps, type ProgressionItem } from '../src/lesson/kinds/progression.js';

const item = (numerals: string[], key = 'G'): ProgressionItem => ({ kind: 'play-progression', id: 'p', prompt: 'Play it.', key, numerals });

describe('progressionSteps', () => {
  it('reads 1-5-6-4 in G as G D Em C', () => {
    const steps = progressionSteps(item(['1', '5', '6', '4']));
    expect(steps.map((s) => s.chord.symbol)).toEqual(['G', 'D', 'Em', 'C']);
    expect(steps.every((s) => !s.slash)).toBe(true);
  });

  it('reads Roman numerals and slash chords', () => {
    const steps = progressionSteps(item(['I', 'V/7', 'vi', 'IV'], 'C'));
    expect(steps.map((s) => s.chord.symbol)).toEqual(['C', 'G/B', 'Am', 'F']);
    expect(steps[1]!.slash).toBe(true);
  });

  it('labels Nashville numbers with dashes', () => {
    expect(progressionLabel(item(['1', '5', '6', '4']))).toBe('1-5-6-4');
  });
});

describe('chordKeys', () => {
  it('puts the bass low and stacks the rest above, inside a 25-key board', () => {
    const steps = progressionSteps(item(['1', '5', '6', '4']));
    expect(steps.map(chordKeys)).toEqual([
      [55, 59, 62],
      [50, 54, 57],
      [52, 55, 59],
      [60, 64, 67],
    ]);
    for (const keys of steps.map(chordKeys)) for (const k of keys) expect(k).toBeGreaterThanOrEqual(48), expect(k).toBeLessThanOrEqual(72);
  });

  it('puts a slash bass at the bottom', () => {
    const [, gOverB] = progressionSteps(item(['1', '5/7'], 'C'));
    expect(chordKeys(gOverB!)[0]! % 12).toBe(11);
  });
});

describe('gradeProgressionChord', () => {
  const key = progressionKey(item([]));
  const [g, d, em, c] = progressionSteps(item(['1', '5', '6', '4']));

  it('accepts any voicing and inversion', () => {
    expect(gradeProgressionChord(g!, [55, 59, 62], key)?.correct).toBe(true);
    expect(gradeProgressionChord(g!, [59, 62, 67], key)?.correct).toBe(true);
    expect(gradeProgressionChord(c!, [43, 52, 60, 67, 76], key)?.correct).toBe(true);
    expect(gradeProgressionChord(em!, [64, 67, 71], key)?.message).toBe('Yes, Em (6 in G).');
  });

  it('waits while too few notes are down', () => {
    expect(gradeProgressionChord(d!, [62, 66], key)).toBeNull();
  });

  it('explains a wrong chord against the one wanted', () => {
    const v = gradeProgressionChord(c!, [62, 66, 69], key)!;
    expect(v.correct).toBe(false);
    expect(v.playedSymbol).toBe('D');
    expect(v.message).toBe("That's D, the 5 chord. C (4 in G) is C, E and G.");
    expect(v.mistake).toBe('missing-notes');
    expect(v.marks.get(62)).toBe('bad');
    expect([...v.marks.values()].filter((m) => m === 'missed')).toHaveLength(3);
  });

  it('calls out a wrong note in an otherwise close chord', () => {
    // C major (C E G) instead of E minor (E G B): the 4 chord, not the 6.
    const v = gradeProgressionChord(em!, [60, 64, 67], key)!;
    expect(v.message).toContain("That's C, the 4 chord.");
    expect(v.message).toContain('Missing B.');
    expect(v.message).toContain("C isn't in it.");
    expect(v.marks.get(60)).toBe('bad');
    expect(v.marks.get(64)).toBe('good');
    expect(v.marks.get(71)).toBe('missed');
  });

  it('only checks the bass for slash numerals', () => {
    const cKey = progressionKey(item([], 'C'));
    const [, gOverB] = progressionSteps(item(['1', '5/7'], 'C'));
    const wrongBass = gradeProgressionChord(gOverB!, [55, 59, 62], cKey)!;
    expect(wrongBass).toMatchObject({ correct: false, mistake: 'wrong-inversion' });
    expect(wrongBass.message).toContain('needs B at the bottom');
    expect(gradeProgressionChord(gOverB!, [47, 55, 62], cKey)?.correct).toBe(true);
  });
});

describe('diatonicNumber', () => {
  it('names a chord by its number in the key', () => {
    const key = progressionKey(item([]));
    expect(diatonicNumber('D', key)).toBe('5');
    expect(diatonicNumber('Am', key)).toBe('2');
    expect(diatonicNumber('F', key)).toBeNull();
  });
});
