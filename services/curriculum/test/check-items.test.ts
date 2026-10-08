import { describe, expect, it } from 'vitest';
import { checkItem } from './check-items.js';

// The checker must catch wrong content, not just pass right content.
describe('checkItem', () => {
  it('catches a note that does not match its prompt', () => {
    expect(checkItem({ kind: 'find-note', id: 'x', prompt: 'Play F#.', pc: 5 })).not.toEqual([]);
    expect(checkItem({ kind: 'find-note', id: 'x', prompt: 'Play C5.', midi: 60 })).not.toEqual([]);
    expect(checkItem({ kind: 'find-note', id: 'x', prompt: 'Play middle C.', midi: 60 })).toEqual([]);
  });

  it('catches a wrong sargam note', () => {
    expect(checkItem({ kind: 'find-note', id: 'x', prompt: 'Sa is C. Play Pa.', pc: 5 })).not.toEqual([]);
    expect(checkItem({ kind: 'find-note', id: 'x', prompt: 'Sa is D. Play tivra Ma.', pc: 8 })).toEqual([]);
  });

  it('catches an interval of the wrong size or direction', () => {
    expect(checkItem({ kind: 'play-interval', id: 'x', prompt: 'Play C4, then go up a major 3rd.', startMidi: 60, semitones: 3 })).not.toEqual([]);
    expect(checkItem({ kind: 'play-interval', id: 'x', prompt: 'Play C4, then go up a major 3rd.', startMidi: 60, semitones: -4 })).not.toEqual([]);
    expect(checkItem({ kind: 'play-interval', id: 'x', prompt: 'Play D4, then go up a major 3rd.', startMidi: 60, semitones: 4 })).not.toEqual([]);
  });

  it('catches a wrong or ambiguous answer', () => {
    const base = { kind: 'name-it' as const, id: 'x', prompt: 'Which key is lit?', shownMidi: [61] };
    expect(checkItem({ ...base, choices: ['C#', 'D'], answer: 'D' })).not.toEqual([]);
    expect(checkItem({ ...base, choices: ['C#', 'Db'], answer: 'C#' })).not.toEqual([]);
    expect(checkItem({ ...base, shownMidi: [60, 67], choices: ['perfect 4th', 'perfect 5th'], answer: 'perfect 4th' })).not.toEqual([]);
  });

  it('checks plain-word answers for lessons before note names', () => {
    const higher = { kind: 'name-it' as const, id: 'x', prompt: 'Which one has the higher pitch?', shownMidi: [55, 62], choices: ['the left one', 'the right one'] };
    expect(checkItem({ ...higher, answer: 'the right one' })).toEqual([]);
    expect(checkItem({ ...higher, answer: 'the left one' })).not.toEqual([]);
    const colour = { kind: 'name-it' as const, id: 'x', prompt: 'White or black?', shownMidi: [63], choices: ['white key', 'black key'] };
    expect(checkItem({ ...colour, answer: 'white key' })).not.toEqual([]);
    const count = { kind: 'name-it' as const, id: 'x', prompt: 'How many half steps?', shownMidi: [60, 63], choices: ['2', '3'] };
    expect(checkItem({ ...count, answer: '2' })).not.toEqual([]);
  });

  it('lets only play-along prompts point at a lit key', () => {
    const item = { kind: 'find-note' as const, id: 'x', prompt: 'Play the lit key.', midi: 60 };
    expect(checkItem(item, 'play-along')).toEqual([]);
    expect(checkItem(item, 'quiz')).not.toEqual([]);
  });

  it('checks a spelled-out sequence note by note', () => {
    const item = { kind: 'play-scale' as const, id: 'x', prompt: 'Play C D E going up.', direction: 'up' as const };
    expect(checkItem({ ...item, sequence: [0, 2, 4] })).toEqual([]);
    expect(checkItem({ ...item, sequence: [0, 2, 5] })).not.toEqual([]);
  });

  it('checks named scales, scale degrees and key questions against the theory package', () => {
    const scale = { kind: 'play-scale' as const, id: 'x', prompt: 'Play the G major scale.', direction: 'up' as const };
    expect(checkItem({ ...scale, sequence: [7, 9, 11, 0, 2, 4, 6, 7] })).toEqual([]);
    expect(checkItem({ ...scale, sequence: [7, 9, 11, 0, 2, 4, 5, 7] })).not.toEqual([]);
    const degree = { kind: 'find-note' as const, id: 'x', prompt: 'In D major, play scale degree 3.' };
    expect(checkItem({ ...degree, pc: 6 })).toEqual([]);
    expect(checkItem({ ...degree, pc: 5 })).not.toEqual([]);
    const sharps = { kind: 'name-it' as const, id: 'x', prompt: 'How many sharps are in the key of A major?', shownMidi: [57], choices: ['2', '3', '4'] };
    expect(checkItem({ ...sharps, answer: '3' })).toEqual([]);
    expect(checkItem({ ...sharps, answer: '2' })).not.toEqual([]);
    const relative = { kind: 'name-it' as const, id: 'x', prompt: 'What is the relative minor of G major?', shownMidi: [67], choices: ['E minor', 'A minor'] };
    expect(checkItem({ ...relative, answer: 'E minor' })).toEqual([]);
    expect(checkItem({ ...relative, answer: 'A minor' })).not.toEqual([]);
    const spelling = { kind: 'name-it' as const, id: 'x', prompt: 'In F major, what is this note called?', shownMidi: [70], choices: ['A#', 'Bb'] };
    expect(checkItem({ ...spelling, answer: 'Bb' })).toEqual([]);
    expect(checkItem({ ...spelling, answer: 'A#' })).not.toEqual([]);
  });
});
