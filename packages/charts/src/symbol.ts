/**
 * Chord symbols as people write them on a chart: "G", "Am7", "D/F#", "Bbmaj7",
 * "C#m7b5", "Fsus4". Reading one gives its root, the chord type (when the
 * theory engine knows it) and the bass note of a slash chord.
 */

import {
  CHORD_TYPES,
  LETTERS,
  chordPitchClasses,
  chordType,
  degreeInKey,
  keyTonicPc,
  letterIndex,
  mod12,
  nashvilleNumber,
  noteToString,
  parseKey,
  romanNumeral,
  sargam,
  spellChord,
  spellInKey,
  spellWithLetter,
  spelledPc,
  type ChordMatch,
  type ChordQuality,
  type Key,
  type PitchClass,
  type SargamName,
  type SpelledNote,
} from '@music/theory';

/** In place of a chord: the chord before carries on. */
export const CARRY_ON = '%';

export interface ParsedChord {
  root: SpelledNote;
  /** Text after the root, in the app's own spelling ("m7", "maj7", "" for major). */
  suffix: string;
  /** Null when the suffix is one the theory engine doesn't know (it is kept as written). */
  quality: ChordQuality | null;
  bass: SpelledNote | null;
}

/** Other ways people write each suffix, mapped to the app's own. */
const SUFFIX_ALIASES: Readonly<Record<string, ChordQuality>> = {
  '': 'major',
  maj: 'major',
  M: 'major',
  m: 'minor',
  min: 'minor',
  '-': 'minor',
  '7': '7',
  dom7: '7',
  maj7: 'maj7',
  M7: 'maj7',
  'Δ': 'maj7',
  'Δ7': 'maj7',
  ma7: 'maj7',
  m7: 'm7',
  min7: 'm7',
  '-7': 'm7',
  m7b5: 'm7b5',
  'm7♭5': 'm7b5',
  'ø': 'm7b5',
  'ø7': 'm7b5',
  dim: 'dim',
  '°': 'dim',
  o: 'dim',
  dim7: 'dim7',
  '°7': 'dim7',
  o7: 'dim7',
  aug: 'aug',
  '+': 'aug',
  sus2: 'sus2',
  sus4: 'sus4',
  sus: 'sus4',
  '7sus4': '7sus4',
  '7sus': '7sus4',
  '6': '6',
  m6: 'm6',
  add9: 'add9',
  add2: 'add9',
  madd9: 'madd9',
  '9': '9',
  maj9: 'maj9',
  m9: 'm9',
  mMaj7: 'mMaj7',
  'm(maj7)': 'mMaj7',
  mmaj7: 'mMaj7',
};

function parseNoteName(text: string): SpelledNote | null {
  const m = /^([A-Ga-g])([#b♯♭]*)$/.exec(text);
  if (!m) return null;
  let accidental = 0;
  for (const ch of m[2] ?? '') accidental += ch === '#' || ch === '♯' ? 1 : -1;
  if (Math.abs(accidental) > 2) return null;
  return { letter: m[1]!.toUpperCase() as SpelledNote['letter'], accidental };
}

/** Read a chord symbol. Returns null for anything that isn't a note name plus a suffix. */
export function parseChordSymbol(text: string): ParsedChord | null {
  const t = text.trim();
  const m = /^([A-G][#b♯♭]?)([^/]*)(?:\/([A-Ga-g][#b♯♭]?))?$/.exec(t);
  if (!m) return null;
  const root = parseNoteName(m[1]!);
  if (!root) return null;
  const rawSuffix = m[2] ?? '';
  const bass = m[3] ? parseNoteName(m[3]) : null;
  if (m[3] && !bass) return null;
  const quality = SUFFIX_ALIASES[rawSuffix] ?? null;
  const suffix = quality ? chordType(quality).suffix : rawSuffix;
  const rootPc = spelledPc(root);
  // "C/C" is just C.
  const slash = bass && spelledPc(bass) !== rootPc ? bass : null;
  return { root, suffix, quality, bass: slash };
}

export function formatChord(chord: ParsedChord): string {
  return noteToString(chord.root) + chord.suffix + (chord.bass ? `/${noteToString(chord.bass)}` : '');
}

/** Plain-language name, for example "A minor 7th" or "D major with F# in the bass". */
export function chordLongName(chord: ParsedChord): string {
  const root = noteToString(chord.root);
  const type = chord.quality ? chordType(chord.quality).name : chord.suffix ? `"${chord.suffix}" chord` : 'major';
  return `${root} ${type}${chord.bass ? ` with ${noteToString(chord.bass)} in the bass` : ''}`;
}

/** Pitch classes of the chord, bass first for a slash chord. Empty when the type is unknown. */
export function chordTones(chord: ParsedChord): PitchClass[] {
  if (!chord.quality) return [];
  const pcs = chordPitchClasses(spelledPc(chord.root), chord.quality);
  return chord.bass ? [spelledPc(chord.bass), ...pcs.filter((pc) => pc !== spelledPc(chord.bass!))] : pcs;
}

/**
 * Notes to sound or light up for a chord: bass an octave below middle C, the
 * chord around middle C. Empty when the type is unknown.
 */
export function chordVoicing(chord: ParsedChord): number[] {
  if (!chord.quality) return [];
  const type = chordType(chord.quality);
  const rootPc = spelledPc(chord.root);
  // Root between F#3 and F4, so every chord sits around middle C.
  const root = 60 + rootPc - (rootPc > 6 ? 12 : 0);
  const upper = type.intervals.map((i, n) => root + i + (type.degrees[n] === 9 ? 12 : 0));
  let bass = 36 + (chord.bass ? spelledPc(chord.bass) : rootPc);
  while (bass + 12 < root) bass += 12;
  return [...new Set([bass, ...upper])].sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Moving a chord to another key

/**
 * Spell `pc` on the letter that sits at the same scale step in the new key as
 * `note` did in the old one, so a chart moves the way a musician would write
 * it (bVII in C is Bb; in D it is C, not B#). Falls back to the new key's own
 * spelling when that would need a double sharp or flat.
 */
function moveNote(note: SpelledNote, from: Key, to: Key): SpelledNote {
  const steps = (letterIndex(note.letter) - letterIndex(from.tonic.letter) + 7) % 7;
  const pc = mod12(spelledPc(note) - keyTonicPc(from) + keyTonicPc(to));
  const letter = LETTERS[(letterIndex(to.tonic.letter) + steps) % 7]!;
  const spelled = spellWithLetter(pc, letter);
  return Math.abs(spelled.accidental) <= 1 ? spelled : spellInKey(pc, to);
}

/** Move a chart symbol from one key to another; "%" and unreadable text stay as they are. */
export function transposeSymbol(symbol: string, from: Key, to: Key): string {
  const parsed = parseChordSymbol(symbol);
  return parsed ? formatChord(transposeChord(parsed, from, to)) : symbol;
}

export function transposeChord(chord: ParsedChord, from: Key, to: Key): ParsedChord {
  return {
    root: moveNote(chord.root, from, to),
    suffix: chord.suffix,
    quality: chord.quality,
    bass: chord.bass ? moveNote(chord.bass, from, to) : null,
  };
}

/** The key `semitones` half steps away, spelled the way bands usually write it. */
export function shiftKey(key: Key, semitones: number): Key {
  const pc = mod12(keyTonicPc(key) + semitones);
  const names = key.mode === 'major' ? MAJOR_KEY_NAMES : MINOR_KEY_NAMES;
  return parseKey(names[pc]! + (key.mode === 'minor' ? 'm' : ''))!;
}

const MAJOR_KEY_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
const MINOR_KEY_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'] as const;

// ---------------------------------------------------------------------------
// What a chord does in the key

export interface ChordFunction {
  /** "IV", "vi", "V7", "bVII", "I/3" */
  roman: string;
  /** "4", "6m", "5/7" */
  nashville: string;
  /** Sargam of the root with Sa on the key's tonic. */
  rootSargam: SargamName;
  bassSargam: SargamName | null;
  /** True when every note of the chord belongs to the key's scale. */
  inKey: boolean;
}

/** Roman numeral, Nashville number and sargam for a chord in a key. */
export function chordFunction(chord: ParsedChord, key: Key): ChordFunction {
  const tonic = keyTonicPc(key);
  const rootPc = spelledPc(chord.root);
  const bassPc = chord.bass ? spelledPc(chord.bass) : rootPc;
  const rootName = noteToString(chord.root);
  const bassName = chord.bass ? noteToString(chord.bass) : rootName;
  let roman: string;
  let nashville: string;
  if (chord.quality) {
    const type = chordType(chord.quality);
    // The parts of a ChordMatch that the numeral functions read.
    const match = {
      rootPc,
      type,
      root: rootName,
      symbol: formatChord(chord),
      baseSymbol: rootName + type.suffix,
      bassPc,
      bass: bassName,
      inversion: 'root',
      notes: spellChord(chord.root, chord.quality).map(noteToString),
      omittedFifth: false,
    } satisfies ChordMatch;
    roman = romanNumeral(match, key);
    nashville = nashvilleNumber(match, key);
  } else {
    const { index, prefix } = degreeInKey(rootName, key);
    const bass = chord.bass ? degreeInKey(bassName, key) : null;
    const slash = bass ? `/${bass.prefix}${bass.index + 1}` : '';
    roman = `${prefix}${['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][index]}${chord.suffix}${slash}`;
    nashville = `${prefix}${index + 1}${chord.suffix}${slash}`;
  }
  const scale = new Set(scalePcs(key));
  const tones = chordTones(chord);
  return {
    roman,
    nashville,
    rootSargam: sargam(rootPc, tonic),
    bassSargam: chord.bass ? sargam(bassPc, tonic) : null,
    inKey: tones.length > 0 ? tones.every((pc) => scale.has(pc)) : scale.has(rootPc),
  };
}

function scalePcs(key: Key): PitchClass[] {
  const steps = key.mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
  return steps.map((s) => mod12(keyTonicPc(key) + s));
}

/** Every chord type suffix the app knows, for hints in the editor. */
export const KNOWN_SUFFIXES: readonly string[] = CHORD_TYPES.map((t) => t.suffix);
