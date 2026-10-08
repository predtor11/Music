/**
 * Roman numerals and Nashville numbers: naming a chord by where its root sits
 * in the key, so "the four chord" means the same thing in any key.
 */

import type { ChordMatch, ChordQuality } from './chords.js';
import { letterIndex, mod12, parseNote, spelledPc } from './notes.js';
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
