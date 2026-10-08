/**
 * Intervals: the distance between two notes, counted in half steps (semitones).
 */

import { mod12, type MidiNote } from './notes.js';

export interface IntervalInfo {
  semitones: number;
  /** Short name, for example "M3" or "P5". */
  short: string;
  /** Full name, for example "major 3rd". */
  name: string;
}

const SIMPLE: ReadonlyArray<[string, string]> = [
  ['P1', 'unison'],
  ['m2', 'minor 2nd'],
  ['M2', 'major 2nd'],
  ['m3', 'minor 3rd'],
  ['M3', 'major 3rd'],
  ['P4', 'perfect 4th'],
  ['TT', 'tritone'],
  ['P5', 'perfect 5th'],
  ['m6', 'minor 6th'],
  ['M6', 'major 6th'],
  ['m7', 'minor 7th'],
  ['M7', 'major 7th'],
];

/** Common names for intervals larger than an octave. */
const COMPOUND: Record<number, [string, string]> = {
  13: ['m9', 'minor 9th'],
  14: ['M9', 'major 9th'],
  15: ['m10', 'minor 10th'],
  16: ['M10', 'major 10th'],
  17: ['P11', 'perfect 11th'],
  18: ['A11', 'augmented 11th'],
  19: ['P12', 'perfect 12th'],
  20: ['m13', 'minor 13th'],
  21: ['M13', 'major 13th'],
};

/** Describe an interval of a number of half steps (direction ignored). */
export function intervalInfo(semitones: number): IntervalInfo {
  const n = Math.abs(semitones);
  if (n === 12) return { semitones: n, short: 'P8', name: 'octave' };
  if (n < 12) {
    const [short, name] = SIMPLE[n]!;
    return { semitones: n, short, name };
  }
  const compound = COMPOUND[n];
  if (compound) return { semitones: n, short: compound[0], name: compound[1] };
  const octaves = Math.floor(n / 12);
  const rest = n % 12;
  if (rest === 0) return { semitones: n, short: `P8×${octaves}`, name: `${octaves} octaves` };
  const [short, name] = SIMPLE[rest]!;
  return {
    semitones: n,
    short: `${short}+${octaves}8va`,
    name: `${name} plus ${octaves} octave${octaves > 1 ? 's' : ''}`,
  };
}

/** Interval between two MIDI notes, low to high. */
export function intervalBetween(a: MidiNote, b: MidiNote): IntervalInfo {
  return intervalInfo(b - a);
}

/** Interval class within one octave, 0-11. */
export function simpleInterval(semitones: number): number {
  return mod12(semitones);
}

/** Half steps for each simple interval short name, for building prompts. */
export const INTERVAL_SEMITONES: Readonly<Record<string, number>> = Object.fromEntries([
  ...SIMPLE.map(([short], i) => [short, i] as const),
  ['P8', 12] as const,
]);

/** Plain-language step size: 1 = half step, 2 = whole step. */
export function stepName(semitones: number): string {
  const n = Math.abs(semitones);
  if (n === 0) return 'the same note';
  if (n === 1) return 'one half step';
  if (n === 2) return 'one whole step';
  return `${n} half steps`;
}
