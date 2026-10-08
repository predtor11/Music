/**
 * Roman numerals and Nashville numbers: naming a chord by where its root sits
 * in the key, so "the four chord" means the same thing in any key.
 */

import { chordPitchClasses, chordType, type ChordMatch, type ChordQuality } from './chords.js';
import { LETTERS, letterIndex, mod12, noteToString, parseNote, spellWithLetter, spelledPc, type PitchClass, type SpelledNote } from './notes.js';
import { keyTonicPc, scaleOffsets, type Key } from './scales.js';

const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'] as const;

const ROMAN_SUFFIX: Readonly<Record<ChordQuality, string>> = {
  major: '',
  minor: '',
  dim: '°',
  aug: '+',
  sus2: 'sus2',
  sus4: 'sus4',
  '7': '7',
  maj7: 'maj7',
  m7: '7',
  m7b5: 'ø7',
  dim7: '°7',
  mMaj7: '(maj7)',
  '7sus4': '7sus4',
  '6': '6',
  m6: '6',
  add9: 'add9',
  madd9: 'add9',
  '9': '9',
  maj9: 'maj9',
  m9: '9',
};

const NASHVILLE_SUFFIX: Readonly<Record<ChordQuality, string>> = {
  major: '',
  minor: 'm',
  dim: '°',
  aug: '+',
  sus2: 'sus2',
  sus4: 'sus4',
  '7': '7',
  maj7: 'maj7',
  m7: 'm7',
  m7b5: 'ø7',
  dim7: '°7',
  mMaj7: 'm(maj7)',
  '7sus4': '7sus4',
  '6': '6',
  m6: 'm6',
  add9: 'add9',
  madd9: 'madd9',
  '9': '9',
  maj9: 'maj9',
  m9: 'm9',
};

interface Degree {
  /** 0-6 for scale degrees 1-7. */
  index: number;
  /** "b", "#" or "" when the note is outside the key. */
  prefix: string;
}

/** Where a spelled note sits in a key, for example Bb in C major is degree b7. */
export function degreeInKey(noteName: string, key: Key): Degree {
  const parsed = parseNote(noteName);
  if (!parsed) throw new Error(`Not a note name: ${noteName}`);
  const note = parsed.note;
  const index = (letterIndex(note.letter) - letterIndex(key.tonic.letter) + 7) % 7;
  const offsets = scaleOffsets(key.mode === 'major' ? 'major' : 'naturalMinor');
  let diff = mod12(spelledPc(note) - keyTonicPc(key)) - offsets[index]!;
  if (diff > 6) diff -= 12;
  if (diff < -6) diff += 12;
  const prefix = diff > 0 ? '#'.repeat(diff) : diff < 0 ? 'b'.repeat(-diff) : '';
  return { index, prefix };
}

/** Roman numeral for a chord in a key: "IV", "ii", "V7", "vii°", "bVII", "I/3". */
export function romanNumeral(chord: ChordMatch, key: Key): string {
  const { index, prefix } = degreeInKey(chord.root, key);
  const base = NUMERALS[index]!;
  const numeral = chord.type.minorThird ? base.toLowerCase() : base;
  const roman = prefix + numeral + ROMAN_SUFFIX[chord.type.quality];
  return chord.bassPc === chord.rootPc ? roman : `${roman}/${bassDegreeLabel(chord, key)}`;
}

/** Nashville number for a chord in a key: "4", "6m", "5/7", "b7". */
export function nashvilleNumber(chord: ChordMatch, key: Key): string {
  const { index, prefix } = degreeInKey(chord.root, key);
  const num = prefix + String(index + 1) + NASHVILLE_SUFFIX[chord.type.quality];
  return chord.bassPc === chord.rootPc ? num : `${num}/${bassDegreeLabel(chord, key)}`;
}

function bassDegreeLabel(chord: ChordMatch, key: Key): string {
  const { index, prefix } = degreeInKey(chord.bass, key);
  return prefix + String(index + 1);
}

/** The diatonic triads of a key, for lessons: C major → C Dm Em F G Am Bdim. */
export function diatonicTriadQualities(mode: Key['mode']): ChordQuality[] {
  return mode === 'major'
    ? ['major', 'minor', 'minor', 'major', 'major', 'minor', 'dim']
    : ['minor', 'dim', 'major', 'minor', 'minor', 'major', 'major'];
}

/** The diatonic seventh chords of a key: C major → Cmaj7 Dm7 Em7 Fmaj7 G7 Am7 Bm7b5. */
export function diatonicSeventhQualities(mode: Key['mode']): ChordQuality[] {
  return mode === 'major'
    ? ['maj7', 'm7', 'm7', 'maj7', '7', 'm7', 'm7b5']
    : ['m7', 'm7b5', 'maj7', 'm7', 'm7', 'maj7', '7'];
}

export interface NumeralChord {
  numeral: string;
  root: SpelledNote;
  quality: ChordQuality;
  /** Chord symbol in the key, for example "Em7" or "D/F#". */
  symbol: string;
  pitchClasses: PitchClass[];
  /** Lowest note when a slash names one ("V/7"), else the root. */
  bassPc: PitchClass;
}

/** Suffixes after a Roman numeral; upper case picks the first quality, lower case the second. */
const ROMAN_QUALITY: Readonly<Record<string, readonly [ChordQuality, ChordQuality]>> = {
  '': ['major', 'minor'],
  '7': ['7', 'm7'],
  maj7: ['maj7', 'mMaj7'],
  '6': ['6', 'm6'],
  '9': ['9', 'm9'],
  maj9: ['maj9', 'maj9'],
  add9: ['add9', 'madd9'],
  sus2: ['sus2', 'sus2'],
  sus4: ['sus4', 'sus4'],
  '7sus4': ['7sus4', '7sus4'],
  '°': ['dim', 'dim'],
  o: ['dim', 'dim'],
  dim: ['dim', 'dim'],
  '°7': ['dim7', 'dim7'],
  o7: ['dim7', 'dim7'],
  dim7: ['dim7', 'dim7'],
  'ø': ['m7b5', 'm7b5'],
  'ø7': ['m7b5', 'm7b5'],
  m7b5: ['m7b5', 'm7b5'],
  '+': ['aug', 'aug'],
  aug: ['aug', 'aug'],
};

/** Suffixes after a Nashville number; "" and "7" follow the key, the rest are explicit. */
const NASHVILLE_QUALITY: Readonly<Record<string, ChordQuality>> = {
  m: 'minor',
  maj: 'major',
  maj7: 'maj7',
  m7: 'm7',
  '6': '6',
  m6: 'm6',
  '9': '9',
  m9: 'm9',
  maj9: 'maj9',
  add9: 'add9',
  madd9: 'madd9',
  sus2: 'sus2',
  sus4: 'sus4',
  '7sus4': '7sus4',
  '°': 'dim',
  o: 'dim',
  dim: 'dim',
  '°7': 'dim7',
  o7: 'dim7',
  dim7: 'dim7',
  'ø': 'm7b5',
  'ø7': 'm7b5',
  m7b5: 'm7b5',
  '+': 'aug',
  aug: 'aug',
};

const ROMAN_INDEX: Readonly<Record<string, number>> = { i: 0, ii: 1, iii: 2, iv: 3, v: 4, vi: 5, vii: 6 };

/** Root of scale degree `index` (0-6) in a key, moved by `shift` half steps, spelled on that degree's letter. */
function degreeRoot(index: number, shift: number, key: Key): SpelledNote {
  const offsets = scaleOffsets(key.mode === 'major' ? 'major' : 'naturalMinor');
  const pc = mod12(keyTonicPc(key) + offsets[index]! + shift);
  return spellWithLetter(pc, LETTERS[(letterIndex(key.tonic.letter) + index) % 7]!);
}

function accidentalShift(text: string): number {
  let shift = 0;
  for (const ch of text) shift += ch === '#' || ch === '♯' ? 1 : -1;
  return shift;
}

/**
 * The chord a Roman numeral or Nashville number names in a key: ("V7", G) → D7,
 * ("6m", C) → Am, ("4", C) → F, ("bVII", C) → Bb, ("5/7", C) → G/B.
 * Nashville numbers with no suffix take the key's own chord (6 in a major key is minor).
 * Returns null for text that isn't a numeral.
 */
export function chordFromNumeral(numeral: string, key: Key): NumeralChord | null {
  const [main, slash] = numeral.trim().split('/') as [string, string | undefined];
  const m = /^([b#♭♯]*)(vii|iii|vi|iv|ii|v|i|VII|III|VI|IV|II|V|I|[1-7])(.*)$/.exec(main);
  if (!m) return null;
  const [, accidentals = '', degreeText = '', suffix = ''] = m;
  const shift = accidentalShift(accidentals);

  let index: number;
  let quality: ChordQuality | undefined;
  if (/^[1-7]$/.test(degreeText)) {
    index = Number(degreeText) - 1;
    if (suffix === '') quality = diatonicTriadQualities(key.mode)[index];
    else if (suffix === '7') quality = diatonicSeventhQualities(key.mode)[index];
    else quality = NASHVILLE_QUALITY[suffix];
  } else {
    index = ROMAN_INDEX[degreeText.toLowerCase()]!;
    const pair = ROMAN_QUALITY[suffix];
    quality = pair?.[degreeText === degreeText.toUpperCase() ? 0 : 1];
  }
  if (quality === undefined) return null;

  const root = degreeRoot(index, shift, key);
  const rootPc = spelledPc(root);
  let bassPc = rootPc;
  let bassName = '';
  if (slash !== undefined) {
    const b = /^([b#♭♯]*)([1-7])$/.exec(slash.trim());
    if (!b) return null;
    const bass = degreeRoot(Number(b[2]) - 1, accidentalShift(b[1] ?? ''), key);
    bassPc = spelledPc(bass);
    bassName = `/${noteToString(bass)}`;
  }
  const type = chordType(quality);
  return {
    numeral,
    root,
    quality,
    symbol: noteToString(root) + type.suffix + bassName,
    pitchClasses: chordPitchClasses(rootPc, quality),
    bassPc,
  };
}
