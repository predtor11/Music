import { describe, expect, it } from 'vitest';
import { gradeInterval, gradeNote, gradePitchClassSet, intervalInfo, sargam } from '../src/index.js';

describe('sargam', () => {
  it('puts Sa on the tonic', () => {
    expect(sargam(0, 0).label).toBe('Sa');
    expect(sargam(7, 0).label).toBe('Pa');
    expect(sargam(2, 2).label).toBe('Sa');
    expect(sargam(9, 2).label).toBe('Pa');
  });

  it('marks komal and tivra notes', () => {
    expect(sargam(1, 0)).toEqual({ syllable: 'Re', variant: 'komal', label: 'komal Re' });
    expect(sargam(6, 0)).toEqual({ syllable: 'Ma', variant: 'tivra', label: 'tivra Ma' });
    expect(sargam(10, 0).label).toBe('komal Ni');
  });
});

describe('intervals', () => {
  it('names intervals', () => {
    expect(intervalInfo(4).name).toBe('major 3rd');
    expect(intervalInfo(7).short).toBe('P5');
    expect(intervalInfo(12).name).toBe('octave');
    expect(intervalInfo(14).name).toBe('major 9th');
    expect(intervalInfo(-3).name).toBe('minor 3rd');
  });
});

describe('graders', () => {
  it('accepts any octave for a pitch class', () => {
    expect(gradeNote({ pc: 6 }, 54).correct).toBe(true);
    expect(gradeNote({ pc: 6 }, 78).correct).toBe(true);
  });

  it('explains a miss', () => {
    const g = gradeNote({ pc: 6 }, 65);
    expect(g.correct).toBe(false);
    expect(g.offset).toBe(1);
    expect(g.message).toBe('You played F. F♯ is one half step higher.');
    expect(gradeNote({ pc: 0 }, 62).message).toBe('You played D. C is one whole step lower.');
  });

  it('checks the octave when an exact key is asked', () => {
    expect(gradeNote({ midi: 60 }, 72).message).toBe('Right note, wrong octave. C4 is one octave lower.');
  });

  it('grades chords in any voicing', () => {
    expect(gradePitchClassSet([2, 6, 9], [50, 57, 66]).correct).toBe(true);
    expect(gradePitchClassSet([2, 6, 9], [50, 57, 65])).toEqual({ correct: false, missing: [6], extra: [5] });
  });

  it('grades intervals', () => {
    expect(gradeInterval(62, 4, 66).message).toBe("Yes, that's a major 3rd.");
    expect(gradeInterval(62, 4, 65).correct).toBe(false);
  });
});
