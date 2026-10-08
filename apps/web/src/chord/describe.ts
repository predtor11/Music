/**
 * Turns the held notes into what the Chord Namer shows: a note name for one
 * note, an interval for two, and a chord with its function in the key for
 * three or more. Pure, so it is unit tested without a browser.
 */

import {
  INVERSION_LABELS,
  identifyChord,
  intervalBetween,
  keyTonicPc,
  nashvilleNumber,
  noteToString,
  octave,
  parseNote,
  pitchClass,
  romanNumeral,
  sargam,
  spellInKey,
  spellInterval,
  spelledPc,
  type Key,
  type MidiNote,
  type SargamName,
  type SpelledNote,
} from '@music/theory';

export interface NoteLabel {
  midi: MidiNote | null;
  /** Spelled in the key, for example "Bb" (ASCII accidentals; pretty() for display). */
  western: string;
  octave: number | null;
  sargam: SargamName;
}

export type Description =
  | { kind: 'empty' }
  | { kind: 'note'; note: NoteLabel }
  | { kind: 'interval'; low: NoteLabel; high: NoteLabel; short: string; name: string; semitones: number }
  | {
      kind: 'chord';
      symbol: string;
      /** "A minor 7th" */
      fullName: string;
      inversion: string;
      roman: string;
      nashville: string;
      tones: NoteLabel[];
      bass: NoteLabel;
      omittedFifth: boolean;
    }
  | { kind: 'unknown'; notes: NoteLabel[] };

export function labelNote(midi: MidiNote, key: Key, spelled?: SpelledNote): NoteLabel {
  return {
    midi,
    western: noteToString(spelled ?? spellInKey(pitchClass(midi), key)),
    octave: octave(midi),
    sargam: sargam(pitchClass(midi), keyTonicPc(key)),
  };
}

/** Label a spelled chord tone (no octave), keeping the chord's own spelling. */
function labelName(name: string, key: Key): NoteLabel {
  const parsed = parseNote(name)!;
  return { midi: null, western: name, octave: null, sargam: sargam(spelledPc(parsed.note), keyTonicPc(key)) };
}

/** Two notes, spelled so their letters match the interval (C# to D#, not C# to Eb). */
function describeInterval(low: MidiNote, high: MidiNote, key: Key): Description {
  const info = intervalBetween(low, high);
  const [lowName, highName] = spellInterval(pitchClass(low), pitchClass(high), key);
  return {
    kind: 'interval',
    low: labelNote(low, key, lowName),
    high: labelNote(high, key, highName),
    short: info.short,
    name: info.name,
    semitones: info.semitones,
  };
}

export function describe(held: readonly MidiNote[], key: Key): Description {
  const notes = [...new Set(held)].sort((a, b) => a - b);
  if (notes.length === 0) return { kind: 'empty' };
  if (notes.length === 1) return { kind: 'note', note: labelNote(notes[0]!, key) };
  if (notes.length === 2) {
    const [low, high] = notes as [MidiNote, MidiNote];
    return describeInterval(low, high, key);
  }

  const chord = identifyChord(notes, key);
  if (!chord) {
    // Three keys but only two note names (C3 C4 G4): show it as the interval it is.
    const pcs = [...new Set(notes.map(pitchClass))];
    if (pcs.length <= 2) {
      const low = notes[0]!;
      const high = notes.find((n) => pitchClass(n) !== pitchClass(low)) ?? notes[notes.length - 1]!;
      return describeInterval(low, high, key);
    }
    return { kind: 'unknown', notes: notes.map((n) => labelNote(n, key)) };
  }

  return {
    kind: 'chord',
    symbol: chord.symbol,
    fullName: `${chord.root} ${chord.type.name}`,
    inversion: INVERSION_LABELS[chord.inversion],
    roman: romanNumeral(chord, key),
    nashville: nashvilleNumber(chord, key),
    tones: chord.notes.map((n) => labelName(n, key)),
    bass: labelName(chord.bass, key),
    omittedFifth: chord.omittedFifth,
  };
}
