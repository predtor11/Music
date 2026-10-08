/**
 * Piano layouts and the computer-key fallback. Pure, so it is unit tested.
 */

import { isBlackKey, type MidiNote } from '@music/theory';

export type KeyboardSize = 25 | 37 | 49 | 61 | 76 | 88;

/** Standard ranges for each keyboard size, as sold. */
export const KEYBOARD_RANGES: Readonly<Record<KeyboardSize, { low: MidiNote; high: MidiNote }>> = {
  25: { low: 48, high: 72 }, // C3-C5
  37: { low: 48, high: 84 }, // C3-C6
  49: { low: 36, high: 84 }, // C2-C6
  61: { low: 36, high: 96 }, // C2-C7
  76: { low: 28, high: 103 }, // E1-G7
  88: { low: 21, high: 108 }, // A0-C8
};

export const KEYBOARD_SIZES = Object.keys(KEYBOARD_RANGES).map(Number) as KeyboardSize[];

export interface PianoKey {
  note: MidiNote;
  black: boolean;
  /** For white keys: index among white keys. For black keys: the white key index it sits after. */
  whiteIndex: number;
}

export function keyboardKeys(size: KeyboardSize): PianoKey[] {
  const { low, high } = KEYBOARD_RANGES[size];
  const keys: PianoKey[] = [];
  let white = -1;
  for (let note = low; note <= high; note++) {
    const black = isBlackKey(note);
    if (!black) white++;
    keys.push({ note, black, whiteIndex: Math.max(white, 0) });
  }
  return keys;
}

/**
 * Computer keys laid out like a piano: the home row is the white keys, the row
 * above is the black keys. A plays the octave's C; K plays the next C.
 */
export const COMPUTER_KEYS: Readonly<Record<string, number>> = {
  a: 0,
  w: 1,
  s: 2,
  e: 3,
  d: 4,
  f: 5,
  t: 6,
  g: 7,
  y: 8,
  h: 9,
  u: 10,
  j: 11,
  k: 12,
};

/** Default octave for computer keys: A is middle C (C4). */
export const DEFAULT_COMPUTER_BASE: MidiNote = 60;

export function computerKeyToNote(key: string, base: MidiNote = DEFAULT_COMPUTER_BASE): MidiNote | null {
  const offset = COMPUTER_KEYS[key.toLowerCase()];
  return offset === undefined ? null : base + offset;
}

/** The computer key for a note at the current octave, for labelling keys. */
export function noteToComputerKey(note: MidiNote, base: MidiNote = DEFAULT_COMPUTER_BASE): string | null {
  const entry = Object.entries(COMPUTER_KEYS).find(([, offset]) => base + offset === note);
  return entry ? entry[0].toUpperCase() : null;
}

/**
 * Where a key's centre sits across the keyboard, from 0 (left edge) to 1
 * (right edge), matching the CSS layout; null when the key isn't on this size.
 * Used to put the animated hands' fingertips on their keys.
 */
export function keyCenter(size: KeyboardSize, note: MidiNote): number | null {
  const keys = keyboardKeys(size);
  const key = keys.find((k) => k.note === note);
  if (!key) return null;
  const whites = keys.filter((k) => !k.black).length;
  return key.black ? (key.whiteIndex + 1) / whites : (key.whiteIndex + 0.5) / whites;
}
