/**
 * Notes, pitch classes and spelling.
 *
 * A pitch class is 0-11 (C = 0, C#/Db = 1, ... B = 11). A MIDI note number is
 * 0-127 with middle C = 60 (named C4). Names use ASCII accidentals internally
 * ("#", "b") and `pretty()` turns them into ♯ and ♭ for display.
 */

export type PitchClass = number;
export type MidiNote = number;

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const;
export type Letter = (typeof LETTERS)[number];

/** Pitch class of each natural letter. */
export const LETTER_PC: Record<Letter, PitchClass> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

/** A spelled note name without octave, for example "C", "F#" or "Bb". */
export interface SpelledNote {
  letter: Letter;
  /** -2 = double flat, -1 = flat, 0 = natural, 1 = sharp, 2 = double sharp. */
  accidental: number;
}

export function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

export function pitchClass(midi: MidiNote): PitchClass {
  return mod12(midi);
}

/** Octave number in scientific pitch notation: MIDI 60 is C4. */
export function octave(midi: MidiNote): number {
  return Math.floor(midi / 12) - 1;
}

export function letterIndex(letter: Letter): number {
  return LETTERS.indexOf(letter);
}

export function spelledPc(note: SpelledNote): PitchClass {
  return mod12(LETTER_PC[note.letter] + note.accidental);
}

/** Spell a pitch class using a given letter, for example (6, "G") is Gb. */
export function spellWithLetter(pc: PitchClass, letter: Letter): SpelledNote {
  let diff = mod12(pc - LETTER_PC[letter]);
  if (diff > 6) diff -= 12;
  return { letter, accidental: diff };
}

export function accidentalText(accidental: number): string {
  if (accidental > 0) return '#'.repeat(accidental);
  if (accidental < 0) return 'b'.repeat(-accidental);
  return '';
}

export function noteToString(note: SpelledNote): string {
  return note.letter + accidentalText(note.accidental);
}

/** Replace ASCII accidentals with music symbols: "F#" → "F♯", "Bb" → "B♭". */
export function pretty(name: string): string {
  return name.replace(/##/g, '𝄪').replace(/#/g, '♯').replace(/(?<=[A-G])bb/g, '𝄫').replace(/(?<=[A-G𝄫])b/g, '♭').replace(/(?<=\d)b(?=\d)/g, '♭');
}

export type Spelling = 'sharp' | 'flat';

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/** Name a pitch class with sharps or flats, for example 1 → "C#" or "Db". */
export function pcName(pc: PitchClass, spelling: Spelling = 'sharp'): string {
  const names = spelling === 'flat' ? FLAT_NAMES : SHARP_NAMES;
  return names[mod12(pc)]!;
}

/** Name a MIDI note with its octave, for example 61 → "C#4". */
export function midiName(midi: MidiNote, spelling: Spelling = 'sharp'): string {
  return pcName(pitchClass(midi), spelling) + octave(midi);
}

/** Both names of a black key, for example 1 → ["C#", "Db"]; a white key has one. */
export function enharmonics(pc: PitchClass): string[] {
  const sharp = pcName(pc, 'sharp');
  const flat = pcName(pc, 'flat');
  return sharp === flat ? [sharp] : [sharp, flat];
}

export function isBlackKey(pc: PitchClass): boolean {
  return [1, 3, 6, 8, 10].includes(mod12(pc));
}

const NOTE_RE = /^([A-Ga-g])(##|bb|#|b|♯|♭|𝄪|𝄫)?(-?\d+)?$/;

/** Parse "C", "f#", "Bb", "E♭4" or "C-1". Returns null if it isn't a note name. */
export function parseNote(text: string): { note: SpelledNote; octave?: number } | null {
  const m = NOTE_RE.exec(text.trim());
  if (!m) return null;
  const letter = m[1]!.toUpperCase() as Letter;
  const acc = m[2] ?? '';
  const accidental =
    acc === '#' || acc === '♯' ? 1 : acc === '##' || acc === '𝄪' ? 2 : acc === 'b' || acc === '♭' ? -1 : acc === 'bb' || acc === '𝄫' ? -2 : 0;
  const result: { note: SpelledNote; octave?: number } = { note: { letter, accidental } };
  if (m[3] !== undefined) result.octave = Number(m[3]);
  return result;
}

/** Parse a note with octave into a MIDI number: "C4" → 60, "A0" → 21. */
export function parseMidi(text: string): MidiNote | null {
  const parsed = parseNote(text);
  if (!parsed || parsed.octave === undefined) return null;
  const { note } = parsed;
  return (parsed.octave + 1) * 12 + LETTER_PC[note.letter] + note.accidental;
}

/** Middle C. */
export const MIDDLE_C: MidiNote = 60;
