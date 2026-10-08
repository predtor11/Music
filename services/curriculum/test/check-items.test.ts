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

  it('makes a prompt that points at a lit key light it, so review can show it too', () => {
    const item = { kind: 'find-note' as const, id: 'x', prompt: 'Play the lit key.', midi: 60 };
    expect(checkItem({ ...item, showKeys: true }, 'play-along')).toEqual([]);
    expect(checkItem({ ...item, showKeys: true }, 'quiz')).toEqual([]);
    expect(checkItem(item, 'play-along')).toContain('prompt points at lit keys, so set showKeys: true');
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

  it('checks chords by name, by symbol and by their notes', () => {
    const triad = { kind: 'build-chord' as const, id: 'x', prompt: 'Play an Ab major triad.', bassPc: null };
    expect(checkItem({ ...triad, pitchClasses: [8, 0, 3] })).toEqual([]);
    expect(checkItem({ ...triad, pitchClasses: [8, 11, 3] })).not.toEqual([]);
    const written = { kind: 'build-chord' as const, id: 'x', prompt: 'Play the chord written Dsus4.', bassPc: null };
    expect(checkItem({ ...written, pitchClasses: [2, 7, 9] })).toEqual([]);
    expect(checkItem({ ...written, pitchClasses: [2, 4, 9] })).not.toEqual([]);
    const kind = { kind: 'name-it' as const, id: 'x', prompt: 'What kind of triad is this?', shownMidi: [59, 62, 65], choices: ['minor', 'diminished'] };
    expect(checkItem({ ...kind, answer: 'diminished' })).toEqual([]);
    expect(checkItem({ ...kind, answer: 'minor' })).not.toEqual([]);
    const symbol = { kind: 'name-it' as const, id: 'x', prompt: 'Which chord symbol is this?', shownMidi: [57, 60, 64], choices: ['Am', 'C'] };
    expect(checkItem({ ...symbol, answer: 'Am' })).toEqual([]);
    expect(checkItem({ ...symbol, answer: 'C' })).not.toEqual([]);
    const third = { kind: 'name-it' as const, id: 'x', prompt: 'Which note is the 3rd of this chord?', shownMidi: [67, 71, 74], choices: ['G', 'B', 'D'] };
    expect(checkItem({ ...third, answer: 'B' })).toEqual([]);
    expect(checkItem({ ...third, answer: 'D' })).not.toEqual([]);
  });

  it('checks chords in a key and progressions against the numerals', () => {
    const which = { kind: 'name-it' as const, id: 'x', prompt: 'In G major, which chord is the vi?', shownMidi: [67], choices: ['Em', 'E'] };
    expect(checkItem({ ...which, answer: 'Em' })).toEqual([]);
    expect(checkItem({ ...which, answer: 'E' })).not.toEqual([]);
    const roman = { kind: 'name-it' as const, id: 'x', prompt: 'In C major, which Roman numeral is this chord?', shownMidi: [69, 72, 76], choices: ['vi', 'VI'] };
    expect(checkItem({ ...roman, answer: 'vi' })).toEqual([]);
    expect(checkItem({ ...roman, answer: 'VI' })).not.toEqual([]);
    const chord = { kind: 'build-chord' as const, id: 'x', prompt: 'In F major, play the IV chord.', bassPc: null };
    expect(checkItem({ ...chord, pitchClasses: [10, 2, 5] })).toEqual([]);
    expect(checkItem({ ...chord, pitchClasses: [11, 2, 5] })).not.toEqual([]);
    const prog = { kind: 'play-progression' as const, id: 'x', prompt: 'Play I–V–vi–IV in G.', key: 'G', numerals: ['I', 'V', 'vi', 'IV'] };
    expect(checkItem(prog)).toEqual([]);
    expect(checkItem({ ...prog, key: 'D' })).not.toEqual([]);
    expect(checkItem({ ...prog, numerals: ['I', 'IV', 'vi', 'V'] })).not.toEqual([]);
  });

  it('checks 7th chords and slash chords by their symbols', () => {
    const seventh = { kind: 'build-chord' as const, id: 'x', prompt: 'Play the chord written Bm7b5.', bassPc: null };
    expect(checkItem({ ...seventh, pitchClasses: [11, 2, 5, 9] })).toEqual([]);
    expect(checkItem({ ...seventh, pitchClasses: [11, 2, 5, 8] })).not.toEqual([]);
    const slash = { kind: 'build-chord' as const, id: 'x', prompt: 'Play the chord written C/E.', pitchClasses: [0, 4, 7] };
    expect(checkItem({ ...slash, bassPc: 4 })).toEqual([]);
    expect(checkItem({ ...slash, bassPc: null })).not.toEqual([]);
    const symbol = { kind: 'name-it' as const, id: 'x', prompt: 'Which chord symbol is this?', shownMidi: [60, 64, 67, 69], choices: ['C6', 'Am7'] };
    expect(checkItem({ ...symbol, answer: 'C6' })).toEqual([]);
    expect(checkItem({ ...symbol, answer: 'Am7' })).not.toEqual([]);
  });

  it('checks inversions, bass notes and common tones', () => {
    const inverted = { kind: 'build-chord' as const, id: 'x', prompt: 'Play a C major triad in first inversion.', pitchClasses: [0, 4, 7] };
    expect(checkItem({ ...inverted, bassPc: 4 })).toEqual([]);
    expect(checkItem({ ...inverted, bassPc: 7 })).not.toEqual([]);
    const which = { kind: 'name-it' as const, id: 'x', prompt: 'Which inversion is this chord?', shownMidi: [67, 72, 76], choices: ['root position', 'first inversion', 'second inversion'] };
    expect(checkItem({ ...which, answer: 'second inversion' })).toEqual([]);
    expect(checkItem({ ...which, answer: 'first inversion' })).not.toEqual([]);
    const share = { kind: 'name-it' as const, id: 'x', prompt: 'Which note do C and G share?', shownMidi: [60], choices: ['C', 'G'] };
    expect(checkItem({ ...share, answer: 'G' })).toEqual([]);
    expect(checkItem({ ...share, answer: 'C' })).not.toEqual([]);
  });
});
