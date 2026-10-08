import type { TestItem } from '@music/contracts';
import { describe, expect, it } from 'vitest';
import { answerKeys, chooseAnswer, expectedFor, freshState, gradeChord, hintMarks, placeUpward, pressNote, skillFor, type ItemState } from '../src/lesson/grade.js';

const play = (item: TestItem, ...notes: number[]): ItemState => notes.reduce((s, n) => pressNote(item, s, n), freshState());

describe('find-note', () => {
  const anyE: TestItem = { kind: 'find-note', id: 'e', prompt: 'Play any E.', pc: 4 };
  const middleC: TestItem = { kind: 'find-note', id: 'c', prompt: 'Play middle C.', midi: 60 };

  it('accepts any octave for a pitch class', () => {
    const s = play(anyE, 76);
    expect(s.verdict?.correct).toBe(true);
    expect(s.marks.get(76)).toBe('good');
  });

  it('marks a wrong key and shows the right one', () => {
    const s = play(anyE, 65);
    expect(s.verdict).toMatchObject({ correct: false, mistake: 'wrong-note' });
    expect(s.verdict?.message).toBe('You played F. E is one half step lower.');
    expect(s.marks.get(65)).toBe('bad');
    expect(s.marks.get(64)).toBe('missed');
  });

  it('calls out the wrong octave', () => {
    const s = play(middleC, 72);
    expect(s.verdict).toMatchObject({ correct: false, mistake: 'wrong-octave' });
    expect(s.verdict?.message).toContain('wrong octave');
  });

  it('only decides once', () => {
    const s = play(middleC, 60, 61);
    expect(s.played).toEqual([60]);
  });
});

describe('play-interval', () => {
  const wholeUp: TestItem = { kind: 'play-interval', id: 'i', prompt: 'C then a whole step up.', startMidi: 60, semitones: 2 };

  it('waits for the second note, then grades it', () => {
    const first = play(wholeUp, 60);
    expect(first.verdict).toBeNull();
    expect(first.hint).toContain('major 2nd up');
    expect(play(wholeUp, 60, 62).verdict?.correct).toBe(true);
    const wrong = play(wholeUp, 60, 61);
    expect(wrong.verdict?.correct).toBe(false);
    expect(wrong.marks.get(62)).toBe('missed');
  });

  it('wants the given starting note', () => {
    expect(play(wholeUp, 62).verdict?.message).toBe('Start on C4. You played D4.');
  });

  it('lets you pick the start when none is given', () => {
    const free: TestItem = { ...wholeUp, startMidi: null, semitones: 7 };
    expect(play(free, 65, 72).verdict?.correct).toBe(true);
  });

  it('hints only the next key in play-along', () => {
    expect([...hintMarks(wholeUp, freshState(), true)]).toEqual([[60, 'target']]);
    expect([...hintMarks(wholeUp, freshState(), false)]).toEqual([]);
  });
});

describe('play-scale', () => {
  const cMajor: TestItem = { kind: 'play-scale', id: 's', prompt: 'C major up.', sequence: [0, 2, 4, 5, 7, 9, 11, 0], direction: 'up' };

  it('accepts the scale in order', () => {
    expect(play(cMajor, 60, 62, 64, 65, 67, 69, 71, 72).verdict?.correct).toBe(true);
  });

  it('flags a note out of order', () => {
    const s = play(cMajor, 60, 64);
    expect(s.verdict).toMatchObject({ correct: false, mistake: 'wrong-order' });
    expect(s.verdict?.message).toBe('Note 2 should be D. E comes later.');
  });

  it('lays the scale out on the keyboard', () => {
    expect(answerKeys(cMajor)).toEqual([60, 62, 64, 65, 67, 69, 71, 72]);
    expect(placeUpward([9, 11, 0])).toEqual([69, 71, 72]);
  });
});

describe('build-chord', () => {
  const cOverE: Extract<TestItem, { kind: 'build-chord' }> = { kind: 'build-chord', id: 'b', prompt: 'C/E', pitchClasses: [0, 4, 7], bassPc: 4 };

  it('waits for enough notes', () => {
    expect(gradeChord(cOverE, [64, 67])).toBeNull();
  });

  it('accepts the right notes with the right bass', () => {
    expect(gradeChord(cOverE, [52, 55, 60])?.verdict?.correct).toBe(true);
  });

  it('explains a wrong inversion', () => {
    const s = gradeChord(cOverE, [60, 64, 67])!;
    expect(s.verdict?.mistake).toBe('wrong-inversion');
    expect(s.verdict?.message).toContain('E should be the lowest');
  });

  it('names missing and extra notes', () => {
    const s = gradeChord({ ...cOverE, bassPc: null }, [60, 63, 67])!;
    expect(s.verdict?.message).toBe("Missing E. E♭ isn't in this chord.");
    expect(s.marks.get(63)).toBe('bad');
    expect(s.marks.get(64)).toBe('missed');
  });
});

describe('name-it', () => {
  const item: Extract<TestItem, { kind: 'name-it' }> = { kind: 'name-it', id: 'n', prompt: 'Which key?', shownMidi: [62], choices: ['C', 'D'], answer: 'D' };
  it('grades a choice', () => {
    expect(chooseAnswer(item, 'D').verdict?.correct).toBe(true);
    expect(chooseAnswer(item, 'C').verdict).toMatchObject({ correct: false, mistake: 'wrong-choice' });
  });
  it('hides the keys for ear training', () => {
    expect(hintMarks({ ...item, audioOnly: true }, freshState(), false).size).toBe(0);
  });
  it('tags skills', () => {
    expect(skillFor(item)).toBe('name-it:D');
  });
});

describe('play-progression', () => {
  const item: TestItem = { kind: 'play-progression', id: 'p', prompt: 'Play 1-5-6-4 in G.', key: 'G', numerals: ['1', '5', '6', '4'] };

  it('reports every chord as expected, in order', () => {
    expect(expectedFor(item)).toEqual([7, 11, 2, 2, 6, 9, 4, 7, 11, 0, 4, 7]);
  });

  it('tags the skill by its numerals', () => {
    expect(skillFor(item)).toBe('progression:1-5-6-4');
  });
});
