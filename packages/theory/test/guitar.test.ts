import { describe, expect, it } from 'vitest';
import {
  OPEN_CHORD_SHAPES,
  POWER_CHORD_SHAPES,
  BARRE_CHORD_SHAPES,
  GUITAR_CHORD_SHAPES,
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
  it('publishes unique six-string open, power and barre guides', () => {
    expect(new Set(GUITAR_CHORD_SHAPES.map((s) => s.name)).size).toBe(GUITAR_CHORD_SHAPES.length);
    expect(OPEN_CHORD_SHAPES).toHaveLength(8);
    for (const shape of GUITAR_CHORD_SHAPES) {
      expect(shape.frets).toHaveLength(STANDARD_TUNING.strings.length);
      expect(shape.fingers).toHaveLength(shape.frets.length);
    }
  });

  it('moves the complete power shape from G to A without adding a third note name', () => {
    const [g, a] = POWER_CHORD_SHAPES.map((s) => chordShapeMidi(STANDARD_TUNING, s));
    expect(g).toEqual([43, 50, 55]);
    expect(a).toEqual(g!.map((n) => n + 2));
    for (const notes of [g!, a!]) {
      expect(new Set(notes.map(pitchClass)).size).toBe(2);
      expect(notes[1]! - notes[0]!).toBe(7);
      expect(notes[2]! - notes[0]!).toBe(12);
    }
  });

  it('uses absolute frets for major and minor barre shapes, including a raised base fret', () => {
    const expected: Record<string, number[]> = {
      F: [41, 48, 53, 57, 60, 65],
      Fm: [41, 48, 53, 56, 60, 65],
      Bm: [47, 54, 59, 62, 66],
    };
    for (const shape of BARRE_CHORD_SHAPES) expect(chordShapeMidi(STANDARD_TUNING, shape)).toEqual(expected[shape.name]);
  });
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
