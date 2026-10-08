/**
 * Chords: building them from a root, and naming whatever notes are held.
 *
 * Naming is rule based, not a trained model, so the same notes always get the
 * same answer. The held pitch classes are compared against chord templates with
 * every held note tried as the root; ties go to the lowest note as the root,
 * then to the more common chord type.
 */

import {
  LETTERS,
  letterIndex,
  mod12,
  noteToString,
  pitchClass,
  spellWithLetter,
  spelledPc,
  type MidiNote,
  type PitchClass,
  type SpelledNote,
} from './notes.js';
import { C_MAJOR, spellInKey, type Key } from './scales.js';

export type ChordQuality =
  | 'major'
  | 'minor'
  | 'dim'
  | 'aug'
  | 'sus2'
  | 'sus4'
  | '7'
  | 'maj7'
  | 'm7'
  | 'm7b5'
  | 'dim7'
  | 'mMaj7'
  | '7sus4'
  | '6'
  | 'm6'
  | 'add9'
  | 'madd9'
  | '9'
  | 'maj9'
  | 'm9';

export interface ChordType {
  quality: ChordQuality;
  /** Symbol suffix after the root, for example "m7" in "Am7". */
  suffix: string;
  /** Plain-language name, for example "minor 7th". */
  name: string;
  /** Half steps above the root, in chord order (root, 3rd, 5th, 7th ...). */
  intervals: readonly number[];
  /** Chord degree of each interval (1, 3, 5, 7, 9, 6, 2, 4), used for spelling and inversions. */
  degrees: readonly number[];
  /** True when the chord has a minor 3rd (lower-case Roman numeral). */
  minorThird: boolean;
}

/** Ordered from most to least common; the order breaks ties between equal matches. */
export const CHORD_TYPES: readonly ChordType[] = [
  { quality: 'major', suffix: '', name: 'major', intervals: [0, 4, 7], degrees: [1, 3, 5], minorThird: false },
  { quality: 'minor', suffix: 'm', name: 'minor', intervals: [0, 3, 7], degrees: [1, 3, 5], minorThird: true },
  { quality: '7', suffix: '7', name: 'dominant 7th', intervals: [0, 4, 7, 10], degrees: [1, 3, 5, 7], minorThird: false },
  { quality: 'm7', suffix: 'm7', name: 'minor 7th', intervals: [0, 3, 7, 10], degrees: [1, 3, 5, 7], minorThird: true },
  { quality: 'maj7', suffix: 'maj7', name: 'major 7th', intervals: [0, 4, 7, 11], degrees: [1, 3, 5, 7], minorThird: false },
  { quality: 'sus4', suffix: 'sus4', name: 'suspended 4th', intervals: [0, 5, 7], degrees: [1, 4, 5], minorThird: false },
  { quality: 'sus2', suffix: 'sus2', name: 'suspended 2nd', intervals: [0, 2, 7], degrees: [1, 2, 5], minorThird: false },
  { quality: 'dim', suffix: 'dim', name: 'diminished', intervals: [0, 3, 6], degrees: [1, 3, 5], minorThird: true },
  { quality: 'aug', suffix: 'aug', name: 'augmented', intervals: [0, 4, 8], degrees: [1, 3, 5], minorThird: false },
  { quality: 'm7b5', suffix: 'm7b5', name: 'half-diminished 7th', intervals: [0, 3, 6, 10], degrees: [1, 3, 5, 7], minorThird: true },
  { quality: 'dim7', suffix: 'dim7', name: 'diminished 7th', intervals: [0, 3, 6, 9], degrees: [1, 3, 5, 7], minorThird: true },
  { quality: 'add9', suffix: 'add9', name: 'added 9th', intervals: [0, 4, 7, 2], degrees: [1, 3, 5, 9], minorThird: false },
  { quality: '9', suffix: '9', name: 'dominant 9th', intervals: [0, 4, 7, 10, 2], degrees: [1, 3, 5, 7, 9], minorThird: false },
  { quality: 'maj9', suffix: 'maj9', name: 'major 9th', intervals: [0, 4, 7, 11, 2], degrees: [1, 3, 5, 7, 9], minorThird: false },
  { quality: 'm9', suffix: 'm9', name: 'minor 9th', intervals: [0, 3, 7, 10, 2], degrees: [1, 3, 5, 7, 9], minorThird: true },
  { quality: '7sus4', suffix: '7sus4', name: 'dominant 7th suspended 4th', intervals: [0, 5, 7, 10], degrees: [1, 4, 5, 7], minorThird: false },
  { quality: '6', suffix: '6', name: 'major 6th', intervals: [0, 4, 7, 9], degrees: [1, 3, 5, 6], minorThird: false },
  { quality: 'm6', suffix: 'm6', name: 'minor 6th', intervals: [0, 3, 7, 9], degrees: [1, 3, 5, 6], minorThird: true },
  { quality: 'madd9', suffix: 'madd9', name: 'minor added 9th', intervals: [0, 3, 7, 2], degrees: [1, 3, 5, 9], minorThird: true },
  { quality: 'mMaj7', suffix: 'm(maj7)', name: 'minor-major 7th', intervals: [0, 3, 7, 11], degrees: [1, 3, 5, 7], minorThird: true },
];

export function chordType(quality: ChordQuality): ChordType {
  return CHORD_TYPES.find((t) => t.quality === quality)!;
}

/** Spell the notes of a chord from a spelled root: (Ab, major) → Ab C Eb. */
export function spellChord(root: SpelledNote, quality: ChordQuality): SpelledNote[] {
  const type = chordType(quality);
  const rootPc = spelledPc(root);
  const start = letterIndex(root.letter);
  return type.intervals.map((interval, i) => {
    const letter = LETTERS[(start + type.degrees[i]! - 1) % 7]!;
    return spellWithLetter(mod12(rootPc + interval), letter);
  });
}

/** Pitch classes of a chord, for grading. */
export function chordPitchClasses(rootPc: PitchClass, quality: ChordQuality): PitchClass[] {
  return chordType(quality).intervals.map((i) => mod12(rootPc + i));
}

export type Inversion = 'root' | 'first' | 'second' | 'third' | 'slash';

export const INVERSION_LABELS: Readonly<Record<Inversion, string>> = {
  root: 'root position',
  first: '1st inversion',
  second: '2nd inversion',
  third: '3rd inversion',
  slash: 'other note in the bass',
};

export interface ChordMatch {
  rootPc: PitchClass;
  type: ChordType;
  /** Root spelled in the key, for example "Bb". */
  root: string;
  /** Full symbol, for example "Cmaj7" or "C/E". */
  symbol: string;
  /** Symbol without the slash bass, for example "C" for "C/E". */
  baseSymbol: string;
  bassPc: PitchClass;
  bass: string;
  inversion: Inversion;
  /** Chord tones spelled from the root. */
  notes: string[];
  /** True when the 5th was left out (a common voicing for 7th chords). */
  omittedFifth: boolean;
}

function sameSet(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

/**
 * Name the chord formed by the given MIDI notes. Needs at least 3 different
 * pitch classes (2 notes are an interval, not a chord). Returns every match,
 * best first; an empty list means the notes aren't a chord this engine knows.
 */
export function identifyChords(midiNotes: readonly MidiNote[], key: Key = C_MAJOR): ChordMatch[] {
  if (midiNotes.length === 0) return [];
  const bassMidi = Math.min(...midiNotes);
  const bassPc = pitchClass(bassMidi);
  const pcs = [...new Set(midiNotes.map(pitchClass))];
  if (pcs.length < 3) return [];

  const exact: ChordMatch[] = [];
  const noFifth: ChordMatch[] = [];
  for (const rootPc of pcs) {
    const rel = pcs.map((pc) => mod12(pc - rootPc));
    for (const type of CHORD_TYPES) {
      if (sameSet(rel, type.intervals)) {
        exact.push(buildMatch(rootPc, type, bassPc, key, false));
        continue;
      }
      // 7th and 9th chords are often played without the 5th.
      if (type.intervals.length >= 4 && type.intervals[2] === 7) {
        const without = type.intervals.filter((i) => i !== 7);
        if (sameSet(rel, without)) noFifth.push(buildMatch(rootPc, type, bassPc, key, true));
      }
    }
  }

  const rank = (m: ChordMatch) => [m.rootPc === bassPc ? 0 : 1, CHORD_TYPES.indexOf(m.type)] as const;
  const sort = (list: ChordMatch[]) =>
    list.sort((a, b) => {
      const [ra, ta] = rank(a);
      const [rb, tb] = rank(b);
      return ra - rb || ta - tb;
    });
  return [...sort(exact), ...sort(noFifth)];
}

/** The best name for the held notes, or null. */
export function identifyChord(midiNotes: readonly MidiNote[], key: Key = C_MAJOR): ChordMatch | null {
  return identifyChords(midiNotes, key)[0] ?? null;
}

function buildMatch(rootPc: PitchClass, type: ChordType, bassPc: PitchClass, key: Key, omittedFifth: boolean): ChordMatch {
  const rootSpelled = spellInKey(rootPc, key);
  const notes = spellChord(rootSpelled, type.quality);
  const root = noteToString(rootSpelled);
  const baseSymbol = root + type.suffix;
  const bassIndex = type.intervals.findIndex((i) => mod12(rootPc + i) === bassPc);
  const bassNote = bassIndex >= 0 ? notes[bassIndex]! : spellInKey(bassPc, key);
  const bass = noteToString(bassNote);
  const bassDegree = bassIndex >= 0 ? type.degrees[bassIndex]! : 0;
  const inversion: Inversion =
    bassDegree === 1 ? 'root' : bassDegree === 3 ? 'first' : bassDegree === 5 ? 'second' : bassDegree === 7 ? 'third' : 'slash';
  return {
    rootPc,
    type,
    root,
    symbol: bassPc === rootPc ? baseSymbol : `${baseSymbol}/${bass}`,
    baseSymbol,
    bassPc,
    bass,
    inversion,
    notes: notes.map(noteToString),
    omittedFifth,
  };
}
