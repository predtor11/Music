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
});
