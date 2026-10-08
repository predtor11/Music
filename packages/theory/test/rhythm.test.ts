import { describe, expect, it } from 'vitest';
import { beatMs, gradeRhythm } from '../src/index.js';

describe('rhythm', () => {
  it('turns tempo into beat length', () => {
    expect(beatMs(120)).toBe(500);
  });

  it('accepts taps close to the beat', () => {
    const g = gradeRhythm([0, 1, 2, 2.5, 3], [1000, 1510, 1990, 2260, 2480], 120, 1000);
    expect(g.correct).toBe(true);
    expect(g.hits.map((h) => h.offsetMs)).toEqual([0, 10, -10, 10, -20]);
    expect(g.message).toBe('Right on the beat.');
  });

  it('reports missed and extra taps', () => {
    const missed = gradeRhythm([0, 1, 2], [0, 500], 120, 0);
    expect(missed.correct).toBe(false);
    expect(missed.missing).toBe(1);
    expect(missed.message).toBe('You missed 1 note.');

    const extra = gradeRhythm([0, 1], [0, 250, 500], 120, 0);
    expect(extra.extra).toEqual([250]);
    expect(extra.message).toBe('1 extra tap.');
  });

  it('notices rushing', () => {
    const g = gradeRhythm([0, 1, 2, 3], [-90, 410, 910, 1300], 120, 0, 120);
    expect(g.correct).toBe(false);
    expect(g.message).toContain('rushing');
  });
});

describe('rhythm matching', () => {
  it('does not let a late tap steal the next onset', () => {
    // Beats 0 and 0.5 at 120 bpm (0 and 250 ms), tolerance 200: the first tap is late (180 ms),
    // the second lands on 250. Greedy matching gave the first tap to 250 and dropped the second.
    const g = gradeRhythm([0, 0.5], [180, 260], 120, 0, 200);
    expect(g.correct).toBe(true);
    expect(g.hits.map((h) => h.offsetMs)).toEqual([180, 10]);
  });

  it('keeps hits in the order the onsets were given', () => {
    const g = gradeRhythm([1, 0], [0, 500], 120, 0);
    expect(g.hits).toEqual([
      { beat: 1, offsetMs: 0 },
      { beat: 0, offsetMs: 0 },
    ]);
  });
});
