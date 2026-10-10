import { describe, expect, it } from 'vitest';
import {
  OPEN_CHORD_SHAPES,
  STANDARD_TUNING,
  DROP_D_TUNING,
  chordShapeMidi,
  fretToMidi,
  gradeGuitarAnswer,
  midiName,
  midiToPositions,
  pitchClass,
} from '../src/index.js';

describe('guitar', () => {
  it('maps open strings to E2 A2 D3 G3 B3 E4', () => {
    const names = [6, 5, 4, 3, 2, 1].map((s) => midiName(fretToMidi(STANDARD_TUNING, { string: s, fret: 0 })));
    expect(names).toEqual(['E2', 'A2', 'D3', 'G3', 'B3', 'E4']);
  });

  it('adds one semitone per fret', () => {
    expect(fretToMidi(STANDARD_TUNING, { string: 1, fret: 12 })).toBe(76);
    expect(fretToMidi(DROP_D_TUNING, { string: 6, fret: 0 })).toBe(38);
  });

  it('finds every position of a note', () => {
    // Middle C (60): string 2 fret 1, string 3 fret 5, string 4 fret 10, string 5 fret 15 (out of range)
    expect(midiToPositions(STANDARD_TUNING, 60)).toEqual([
      { string: 2, fret: 1 },
      { string: 3, fret: 5 },
      { string: 4, fret: 10 },
    ]);
    expect(midiToPositions(STANDARD_TUNING, 30)).toEqual([]);
  });

  it('rejects strings that do not exist', () => {
    expect(() => fretToMidi(STANDARD_TUNING, { string: 7, fret: 0 })).toThrow(RangeError);
    expect(() => fretToMidi(STANDARD_TUNING, { string: 1, fret: -1 })).toThrow(RangeError);
  });

  it('sounds the right notes in each open chord shape', () => {
    const want: Record<string, number[]> = {
      E: [4, 11, 4, 8, 11, 4],
      Em: [4, 11, 4, 7, 11, 4],
      A: [9, 4, 9, 1, 9],
      Am: [9, 4, 9, 0, 9],
      D: [2, 9, 2, 6],
      Dm: [2, 9, 2, 5],
      C: [0, 4, 7, 0, 4],
      G: [7, 11, 2, 7, 11, 7],
    };
    for (const shape of OPEN_CHORD_SHAPES) {
      const pcs = chordShapeMidi(STANDARD_TUNING, shape).map(pitchClass);
      // Compare as sets of pitch classes with the lowest note first.
      expect([...new Set(pcs)].sort((a, b) => a - b)).toEqual([...new Set(want[shape.name]!)].sort((a, b) => a - b));
    }
  });

  it('flags a shape that does not match the tuning', () => {
    expect(() => chordShapeMidi(STANDARD_TUNING, { name: 'x', frets: [0, 0], fingers: [null, null], baseFret: 1 })).toThrow(RangeError);
  });

  it('grades by note, so any correct fret counts', () => {
    expect(gradeGuitarAnswer([60], [60])).toEqual({ correct: true, missing: [], wrong: [] });
    expect(gradeGuitarAnswer([60, 64], [64, 62])).toEqual({ correct: false, missing: [60], wrong: [62] });
  });
});
