/**
 * Turning MIDI notes and keys into what VexFlow draws. Pure, so it is easy to
 * test: the right letter for each note in the key (B♭ in F major, A♯ in E
 * major), the octave that letter belongs to, and the key signature's name.
 */

import { C_MAJOR, LETTER_PC, keyName, pitchClass, spellInKey, type Key, type MidiNote, type SpelledNote } from '@music/theory';

export type Clef = 'treble' | 'bass';

/** The note as it is written: letter, accidental and the octave of the letter. */
export interface WrittenNote {
  spelled: SpelledNote;
  octave: number;
}

export function writtenNote(midi: MidiNote, key: Key = C_MAJOR): WrittenNote {
  const spelled = spellInKey(pitchClass(midi), key);
  // B♯3 is MIDI 60, so the octave follows the letter, not the key pressed.
  const natural = midi - spelled.accidental;
  const octave = Math.round((natural - LETTER_PC[spelled.letter]) / 12) - 1;
  return { spelled, octave };
}

const ACCIDENTAL: Record<number, string> = { [-2]: 'bb', [-1]: 'b', 0: '', 1: '#', 2: '##' };

/** VexFlow key text such as "c#/4" or "bb/3". */
export function vexKey(midi: MidiNote, key: Key = C_MAJOR): string {
  const { spelled, octave } = writtenNote(midi, key);
  return `${spelled.letter.toLowerCase()}${ACCIDENTAL[spelled.accidental] ?? ''}/${octave}`;
}

/** VexFlow key-signature name ("Bb", "F#m"); C when the key has none VexFlow knows. */
export function vexKeySignature(key: Key = C_MAJOR): string {
  return keyName(key);
}

/** The clef that reads a note most easily: bass below middle C. */
export function clefFor(midi: readonly MidiNote[]): Clef {
  const low = Math.min(...midi);
  return low < 60 ? 'bass' : 'treble';
}
