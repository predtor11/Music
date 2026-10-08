/**
 * Grading for play-progression items: one chord at a time, on the keys held.
 * Pure, so it is unit tested; Progression.tsx feeds it the held keys.
 *
 * Any voicing counts. The lowest note only matters for slash numerals
 * ("5/7", "V/7"), where the numeral itself names the bass.
 */

import type { MistakeKind, TestItem } from '@music/contracts';
import {
  C_MAJOR,
  chordFromNumeral,
  gradePitchClassSet,
  identifyChord,
  keyName,
  mod12,
  noteToString,
  parseKey,
  pitchClass,
  pretty,
  spellInKey,
  type Key,
  type MidiNote,
  type NumeralChord,
  type PitchClass,
} from '@music/theory';
import type { KeyMark } from '../../keyboard/PianoKeyboard.js';

export type ProgressionItem = Extract<TestItem, { kind: 'play-progression' }>;

export interface ProgressionStep {
  /** The numeral as written in the item ("5", "V7", "5/7"). */
  numeral: string;
  chord: NumeralChord;
  /** True when the numeral names a bass note, so the lowest note is graded. */
  slash: boolean;
}

export interface ChordVerdict {
  correct: boolean;
  /** What was played, by name, when it is a chord ("D", "Em/G"). */
  playedSymbol: string | null;
  message: string;
  mistake: MistakeKind | null;
  marks: Map<MidiNote, KeyMark>;
}

export function progressionKey(item: ProgressionItem): Key {
  return parseKey(item.key) ?? C_MAJOR;
}

/** The chords to play, in order. A numeral that doesn't parse is left out. */
export function progressionSteps(item: ProgressionItem): ProgressionStep[] {
  const key = progressionKey(item);
  return item.numerals.flatMap((numeral) => {
    const chord = chordFromNumeral(numeral, key);
    return chord ? [{ numeral, chord, slash: numeral.includes('/') }] : [];
  });
}

/** "1-5-6-4" for Nashville numbers, "I–V–vi–IV" for Roman ones. */
export function progressionLabel(item: ProgressionItem): string {
  return item.numerals.map(pretty).join(item.numerals.every((n) => /^[b#]*[1-7]/.test(n)) ? '-' : '–');
}

/** Chord symbol as shown: "F♯m", "D/F♯". */
export const chordText = (step: ProgressionStep) => pretty(step.chord.symbol);

const noteText = (pc: PitchClass, key: Key) => pretty(noteToString(spellInKey(pc, key)));
const list = (names: string[]) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

/** The chord's notes, bass first, spelled in the key: "D, F♯ and A". */
export function chordNotesText(step: ProgressionStep, key: Key): string {
  const { pitchClasses, bassPc } = step.chord;
  const order = [bassPc, ...pitchClasses.filter((pc) => pc !== bassPc)];
  return list(order.map((pc) => noteText(pc, key)));
}

/** Lowest note for showing a chord: its bass between D3 and C♯4, so it fits a 25-key board. */
const LOW_WINDOW = 50;

/** Keys that show a chord on the keyboard: bass in the low window, the rest stacked above it. */
export function chordKeys(step: ProgressionStep): MidiNote[] {
  const { pitchClasses, bassPc } = step.chord;
  const bass = LOW_WINDOW + mod12(bassPc - LOW_WINDOW);
  const out = [bass];
  let floor = bass + 1;
  for (const pc of pitchClasses) {
    if (pc === bassPc) continue;
    const n = floor + mod12(pc - floor);
    out.push(n);
    floor = n + 1;
  }
  return out;
}

/**
 * Which number a chord is in the key, when it is one of the key's own chords:
 * D in G is "5". Lets a wrong answer be explained the way a band would say it.
 */
export function diatonicNumber(symbol: string, key: Key): string | null {
  for (let d = 1; d <= 7; d++) {
    const c = chordFromNumeral(String(d), key);
    if (c && c.symbol === symbol) return String(d);
  }
  return null;
}

/**
 * Grade the held keys against one chord of the progression. Returns null
 * while fewer different notes are down than the chord has, so a chord
 * still being put down isn't marked wrong.
 */
export function gradeProgressionChord(step: ProgressionStep, held: readonly MidiNote[], key: Key): ChordVerdict | null {
  const notes = [...held].sort((a, b) => a - b);
  const distinct = new Set(notes.map(pitchClass));
  if (distinct.size < step.chord.pitchClasses.length) return null;

  const want = step.chord;
  const g = gradePitchClassSet(want.pitchClasses, notes);
  const marks = new Map<MidiNote, KeyMark>();
  for (const n of notes) marks.set(n, want.pitchClasses.includes(pitchClass(n)) ? 'good' : 'bad');
  const low = notes[0]!;
  for (const pc of g.missing) marks.set(low + mod12(pc - pitchClass(low)), 'missed');

  const match = identifyChord(notes, key);
  const playedSymbol = match ? match.symbol : null;
  const wanted = `${chordText(step)} (${pretty(step.numeral)} in ${pretty(keyName(key))})`;

  if (g.correct && step.slash && pitchClass(low) !== want.bassPc) {
    marks.set(low, 'bad');
    return {
      correct: false,
      playedSymbol,
      message: `Right notes, but ${wanted} needs ${noteText(want.bassPc, key)} at the bottom. You have ${noteText(pitchClass(low), key)} lowest.`,
      mistake: 'wrong-inversion',
      marks,
    };
  }
  if (g.correct) {
    return { correct: true, playedSymbol, message: `Yes, ${wanted}.`, mistake: null, marks };
  }

  const parts: string[] = [];
  if (match) {
    const base = match.baseSymbol;
    const num = diatonicNumber(base, key);
    parts.push(`That's ${pretty(base)}${num ? `, the ${num} chord` : ''}.`);
  }
  parts.push(`${wanted} is ${chordNotesText(step, key)}.`);
  // When some notes were right, say which ones to change.
  const someRight = g.missing.length < want.pitchClasses.length;
  if (someRight && g.missing.length) parts.push(`Missing ${list(g.missing.map((pc) => noteText(pc, key)))}.`);
  if (someRight && g.extra.length) parts.push(`${list(g.extra.map((pc) => noteText(pc, key)))} ${g.extra.length === 1 ? "isn't" : "aren't"} in it.`);
  return { correct: false, playedSymbol, message: parts.join(' '), mistake: g.missing.length ? 'missing-notes' : 'extra-notes', marks };
}
