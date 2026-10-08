/**
 * Grading for lesson and test items, in the browser so feedback is instant.
 * Pure functions over what was played; the player feeds them note-ons (or the
 * held chord, or a clicked choice) and draws the marks they return on the
 * virtual keyboard.
 */

import type { MistakeKind, TestItem } from '@music/contracts';
import {
  chordFromNumeral,
  gradeInterval,
  gradeNote,
  gradePitchClassSet,
  intervalInfo,
  C_MAJOR,
  parseKey,
  mod12,
  noteToString,
  octave,
  pcName,
  pitchClass,
  pretty,
  spellInKey,
  type MidiNote,
  type PitchClass,
} from '@music/theory';
import type { KeyMark } from '../keyboard/PianoKeyboard.js';

export interface Verdict {
  correct: boolean;
  message: string;
  mistake: MistakeKind | null;
}

/** Where an item stands while it is being answered. */
export interface ItemState {
  /** Note-ons so far, in order. */
  played: MidiNote[];
  marks: ReadonlyMap<MidiNote, KeyMark>;
  verdict: Verdict | null;
  /** A short nudge while answering ("Now play the note a whole step up"). */
  hint: string | null;
}

export const freshState = (): ItemState => ({ played: [], marks: new Map(), verdict: null, hint: null });

const MIDDLE_C = 60;

/** Lay pitch classes out upward from around middle C, for showing them on the keyboard. */
export function placeUpward(pcs: readonly PitchClass[], from: MidiNote = MIDDLE_C): MidiNote[] {
  const out: MidiNote[] = [];
  let floor = from;
  for (const pc of pcs) {
    const n = floor + mod12(pc - pitchClass(floor));
    out.push(n);
    floor = n + 1;
  }
  return out;
}

/** Pitch classes a scale item expects, in playing order. */
export function scaleOrder(item: Extract<TestItem, { kind: 'play-scale' }>): PitchClass[] {
  const seq = item.sequence;
  if (item.direction === 'down') return [...seq].reverse();
  if (item.direction === 'up-down') return [...seq, ...[...seq].reverse().slice(1)];
  return [...seq];
}

/** Keys that show the answer, for hints in play-along and for "missed" after a wrong answer. */
export function answerKeys(item: TestItem, played: readonly MidiNote[] = []): MidiNote[] {
  switch (item.kind) {
    case 'find-note':
      return [item.midi ?? MIDDLE_C + item.pc!];
    case 'play-interval': {
      const start = item.startMidi ?? played[0];
      return start === undefined ? [] : [start, start + item.semitones];
    }
    case 'play-scale': {
      const up = placeUpward(item.sequence);
      if (item.direction === 'down') return [...up].reverse();
      if (item.direction === 'up-down') return [...up, ...[...up].reverse().slice(1)];
      return up;
    }
    case 'build-chord': {
      const pcs = item.bassPc === null ? item.pitchClasses : [item.bassPc, ...item.pitchClasses.filter((pc) => pc !== item.bassPc)];
      return placeUpward(pcs);
    }
    case 'name-it':
      return item.shownMidi;
    case 'play-progression': {
      const first = progressionChords(item)[0];
      return first ? placeUpward([first.bassPc, ...first.pitchClasses.filter((pc) => pc !== first.bassPc)]) : [];
    }
    case 'read-staff':
      return item.midi;
    case 'tap-rhythm':
      return [];
  }
}

/** The chords a progression item asks for, in order; numerals that don't parse are left out. */
export function progressionChords(item: Extract<TestItem, { kind: 'play-progression' }>) {
  const key = parseKey(item.key) ?? C_MAJOR;
  return item.numerals.flatMap((n) => chordFromNumeral(n, key) ?? []);
}

/** What the attempt reports as expected (MIDI notes, or pitch classes when any octave is fine). */
export function expectedFor(item: TestItem, played: readonly MidiNote[] = []): number[] {
  switch (item.kind) {
    case 'find-note':
      return item.midi !== undefined ? [item.midi] : [item.pc!];
    case 'play-scale':
      return scaleOrder(item);
    case 'build-chord':
      return item.pitchClasses;
    default:
      return answerKeys(item, played);
  }
}

/** Concept tag for the progress report. */
export function skillFor(item: TestItem): string {
  switch (item.kind) {
    case 'find-note':
      return `note:${pcName(item.midi !== undefined ? pitchClass(item.midi) : item.pc!)}`;
    case 'play-interval':
      return `interval:${intervalInfo(item.semitones).short}`;
    case 'play-scale':
      return `scale:${pcName(item.sequence[0]!)}`;
    case 'build-chord':
      return `chord:${item.pitchClasses.map((pc) => pcName(pc)).join('-')}`;
    case 'name-it':
      return `name-it:${item.answer}`;
    case 'play-progression':
      return `progression:${item.numerals.join('-')}`;
    case 'read-staff':
      return `staff:${item.clef}`;
    case 'tap-rhythm':
      return `rhythm:${item.timeSignature.join('/')}`;
  }
}

// Black keys use the spellings bands use most: C♯, E♭, F♯, A♭, B♭.
const pcText = (pc: PitchClass) => pretty(noteToString(spellInKey(pc, C_MAJOR)));
const note = (n: MidiNote) => pcText(pitchClass(n)) + octave(n);

/**
 * Hint marks before the answer: in play-along the keys to play glow as
 * targets; in a quiz nothing is shown (except name-it, which is about keys
 * on screen).
 */
export function hintMarks(item: TestItem, state: ItemState, showAnswer: boolean): Map<MidiNote, KeyMark> {
  const marks = new Map(state.marks);
  if (item.kind === 'name-it') {
    if (!item.audioOnly) for (const n of item.shownMidi) if (!marks.has(n)) marks.set(n, 'target');
    return marks;
  }
  if (!showAnswer || state.verdict) return marks;
  const keys = answerKeys(item, state.played);
  if (item.kind === 'play-scale' || item.kind === 'play-interval') {
    // Light only the next key to play.
    const next = keys[state.played.length];
    if (next !== undefined && !marks.has(next)) marks.set(next, 'target');
    return marks;
  }
  for (const k of keys) if (!marks.has(k)) marks.set(k, 'target');
  return marks;
}

/** Feed one note-on. Returns the new state; `verdict` is set once the item is decided. */
export function pressNote(item: TestItem, state: ItemState, n: MidiNote): ItemState {
  if (state.verdict) return state;
  const played = [...state.played, n];
  const marks = new Map(state.marks);

  switch (item.kind) {
    case 'find-note': {
      const g = gradeNote(item.midi !== undefined ? { midi: item.midi } : { pc: item.pc! }, n);
      marks.set(n, g.correct ? 'good' : 'bad');
      if (!g.correct) for (const k of answerKeys(item)) if (k !== n) marks.set(k, 'missed');
      const mistake: MistakeKind | null = g.correct ? null : g.offset % 12 === 0 ? 'wrong-octave' : 'wrong-note';
      return { played, marks, verdict: { correct: g.correct, message: g.message, mistake }, hint: null };
    }

    case 'play-interval': {
      const start = item.startMidi ?? played[0]!;
      if (played.length === 1) {
        if (n !== start) {
          marks.set(n, 'bad');
          marks.set(start, 'missed');
          return { played, marks, verdict: { correct: false, message: `Start on ${note(start)}. You played ${note(n)}.`, mistake: 'wrong-note' }, hint: null };
        }
        marks.set(n, 'good');
        const dir = item.semitones >= 0 ? 'up' : 'down';
        return { played, marks, verdict: null, hint: `Now play the note ${intervalInfo(item.semitones).name} ${dir} from ${note(start)}.` };
      }
      const target = start + item.semitones;
      const g = gradeInterval(start, item.semitones, n);
      marks.set(n, g.correct ? 'good' : 'bad');
      if (!g.correct) marks.set(target, 'missed');
      const mistake: MistakeKind | null = g.correct ? null : mod12(target - n) === 0 ? 'wrong-octave' : 'wrong-note';
      return { played, marks, verdict: { correct: g.correct, message: g.message, mistake }, hint: null };
    }

    case 'play-scale': {
      const order = scaleOrder(item);
      const i = played.length - 1;
      const want = order[i]!;
      if (pitchClass(n) !== want) {
        marks.set(n, 'bad');
        const remaining = order.slice(i);
        const mistake: MistakeKind = remaining.includes(pitchClass(n)) ? 'wrong-order' : 'wrong-note';
        const message =
          mistake === 'wrong-order'
            ? `Note ${i + 1} should be ${pcText(want)}. ${pcText(pitchClass(n))} comes later.`
            : `Note ${i + 1} should be ${pcText(want)}. You played ${pcText(pitchClass(n))}.`;
        // Show where the right note was, next to the one played.
        const right = n + (((want - pitchClass(n) + 18) % 12) - 6);
        marks.set(right, 'missed');
        return { played, marks, verdict: { correct: false, message, mistake }, hint: null };
      }
      marks.set(n, 'good');
      if (played.length === order.length) {
        return { played, marks, verdict: { correct: true, message: 'Yes, every note in order.', mistake: null }, hint: null };
      }
      return { played, marks, verdict: null, hint: `${played.length} of ${order.length}. Next: ${pcText(order[played.length]!)}.` };
    }

    case 'build-chord':
    case 'name-it':
    case 'play-progression':
    case 'read-staff':
    case 'tap-rhythm':
      // Chords are graded on the held keys, choices on a click; the newer kinds have their own runners (kinds.tsx).
      return state;
  }
}

/** Grade a held chord. Returns null while too few notes are down to judge. */
export function gradeChord(item: Extract<TestItem, { kind: 'build-chord' }>, held: readonly MidiNote[]): ItemState | null {
  const distinct = new Set(held.map(pitchClass));
  if (distinct.size < item.pitchClasses.length) return null;
  const notes = [...held].sort((a, b) => a - b);
  const g = gradePitchClassSet(item.pitchClasses, notes);
  const marks = new Map<MidiNote, KeyMark>();
  for (const n of notes) marks.set(n, item.pitchClasses.includes(pitchClass(n)) ? 'good' : 'bad');
  const low = notes[0]!;
  for (const pc of g.missing) marks.set(low + mod12(pc - pitchClass(low)), 'missed');

  let verdict: Verdict;
  if (!g.correct) {
    const parts = [];
    if (g.missing.length) parts.push(`Missing ${g.missing.map(pcText).join(' and ')}.`);
    if (g.extra.length) parts.push(`${g.extra.map(pcText).join(' and ')} ${g.extra.length === 1 ? "isn't" : "aren't"} in this chord.`);
    verdict = { correct: false, message: parts.join(' '), mistake: g.missing.length ? 'missing-notes' : 'extra-notes' };
  } else if (item.bassPc !== null && pitchClass(low) !== item.bassPc) {
    marks.set(low, 'bad');
    verdict = { correct: false, message: `Right notes, but ${pcText(item.bassPc)} should be the lowest. You have ${pcText(pitchClass(low))} at the bottom.`, mistake: 'wrong-inversion' };
  } else {
    verdict = { correct: true, message: 'Yes, that’s the chord.', mistake: null };
  }
  return { played: notes, marks, verdict, hint: null };
}

/** Grade a multiple-choice answer. */
export function chooseAnswer(item: Extract<TestItem, { kind: 'name-it' }>, choice: string): ItemState {
  const correct = choice === item.answer;
  const marks = new Map<MidiNote, KeyMark>(item.shownMidi.map((n) => [n, correct ? 'good' : 'missed']));
  return {
    played: [],
    marks,
    verdict: { correct, message: correct ? `Yes, it's ${pretty(item.answer)}.` : `Not quite. It's ${pretty(item.answer)}.`, mistake: correct ? null : 'wrong-choice' },
    hint: null,
  };
}
