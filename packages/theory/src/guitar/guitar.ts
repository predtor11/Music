/**
 * Guitar maths: tunings, fret positions and chord shapes.
 *
 * String 1 is the thinnest string, fret 0 is open. A tuning lists the MIDI
 * note of each string, thickest first, so string n is `strings[strings.length - n]`.
 */

import type { MidiNote } from '../notes.js';

export interface FretPosition {
  string: number;
  fret: number;
}

export interface GuitarTuning {
  id: string;
  name: string;
  strings: MidiNote[];
}

export interface ChordShape {
  name: string;
  /** Thickest string first; null = muted. Frets are absolute (not relative to baseFret). */
  frets: (number | null)[];
  fingers: (number | null)[];
  baseFret: number;
}

export const STANDARD_TUNING: GuitarTuning = {
  id: 'standard',
  name: 'Standard (E A D G B e)',
  strings: [40, 45, 50, 55, 59, 64],
};

export const DROP_D_TUNING: GuitarTuning = {
  id: 'drop-d',
  name: 'Drop D (D A D G B e)',
  strings: [38, 45, 50, 55, 59, 64],
};

/** MIDI note of the open string number `string` (1 = thinnest). */
export function openStringMidi(tuning: GuitarTuning, string: number): MidiNote {
  const midi = Number.isInteger(string) && string >= 1 ? tuning.strings[tuning.strings.length - string] : undefined;
  if (midi === undefined) throw new RangeError(`string ${string} is not on this guitar`);
  return midi;
}

export function fretToMidi(tuning: GuitarTuning, pos: FretPosition): MidiNote {
  if (!Number.isInteger(pos.fret) || pos.fret < 0) throw new RangeError(`fret ${pos.fret} is not valid`);
  return openStringMidi(tuning, pos.string) + pos.fret;
}

/** Every place a note can be played, thinnest string first, up to `maxFret`. */
export function midiToPositions(tuning: GuitarTuning, midi: MidiNote, maxFret = 12): FretPosition[] {
  const out: FretPosition[] = [];
  for (let string = 1; string <= tuning.strings.length; string++) {
    const fret = midi - openStringMidi(tuning, string);
    if (fret >= 0 && fret <= maxFret) out.push({ string, fret });
  }
  return out;
}

/** The MIDI notes a chord shape sounds, thickest string first, muted strings left out. */
export function chordShapeMidi(tuning: GuitarTuning, shape: ChordShape): MidiNote[] {
  if (shape.frets.length !== tuning.strings.length) {
    throw new RangeError(`shape "${shape.name}" has ${shape.frets.length} strings, tuning has ${tuning.strings.length}`);
  }
  const out: MidiNote[] = [];
  shape.frets.forEach((fret, i) => {
    if (fret !== null) out.push(tuning.strings[i]! + fret);
  });
  return out;
}

export interface GuitarGrade {
  correct: boolean;
  /** Expected notes that were not played (MIDI). */
  missing: MidiNote[];
  /** Played notes that were not expected (MIDI). */
  wrong: MidiNote[];
}

/**
 * Compare played MIDI notes with expected ones. Grading is by note, not by
 * position: the same note on a different string is the same MIDI note, so any
 * correct fret passes.
 */
export function gradeGuitarAnswer(expected: MidiNote[], played: MidiNote[]): GuitarGrade {
  const exp = new Set(expected);
  const got = new Set(played);
  const missing = [...exp].filter((n) => !got.has(n)).sort((a, b) => a - b);
  const wrong = [...got].filter((n) => !exp.has(n)).sort((a, b) => a - b);
  return { correct: missing.length === 0 && wrong.length === 0, missing, wrong };
}
