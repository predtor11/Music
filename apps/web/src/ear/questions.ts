/**
 * The play-by-ear trainer's levels and the questions they make. A chord, a
 * progression, a tune or a key plays and you find it on your keyboard. Every
 * question is made fresh from a random source, so a level never runs out.
 * Pure, so it is unit tested; EarRunner plays and grades the questions.
 */

import type { TestItem } from '@music/contracts';
import {
  chordFromNumeral,
  chordPitchClasses,
  keyName,
  keyTonicPc,
  mod12,
  noteToString,
  parseNote,
  pretty,
  scaleOffsets,
  spellChord,
  spellInKey,
  spelledPc,
  type ChordQuality,
  type Key,
  type MidiNote,
  type PitchClass,
  type SpelledNote,
} from '@music/theory';

export type Rng = () => number;

export const pick = <T>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length) % list.length]!;

/** A small seeded random source (mulberry32), so tests get the same questions every run. */
export function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type BuildChordItem = Extract<TestItem, { kind: 'build-chord' }>;
export type ProgressionItem = Extract<TestItem, { kind: 'play-progression' }>;

/** What a question plays, in order: chords (notes together) and runs (one after another). */
export type Sound = { kind: 'chord'; notes: MidiNote[] } | { kind: 'sequence'; notes: MidiNote[] };

interface Base {
  id: string;
  prompt: string;
  key: Key;
  /** What plays, before you answer and on "Play it again". */
  listen: Sound[];
  /** The answer, by name: "A minor", "G major". */
  answer: string;
  /** One line under the name: what it is in the key, and its notes. */
  detail: string;
  /** Keys that show the answer on the keyboard. */
  answerKeys: MidiNote[];
}

/** Find a chord you hear; any inversion and octave counts. Saved as a build-chord attempt. */
export interface ChordQuestion extends Base {
  type: 'chord';
  item: BuildChordItem;
  rootPc: PitchClass;
  quality: ChordQuality;
  /** Chords of the key the question uses, by number, so a wrong chord can be named the way a band would. */
  numbered: boolean;
}

/** Play back a short tune, note by note, in any octave. */
export interface MelodyQuestion extends Base {
  type: 'melody';
  /** Pitch classes in order; the tune as played is answerKeys. */
  order: PitchClass[];
}

/** Hear a key, then play its home note in any octave. */
export interface KeyQuestion extends Base {
  type: 'key';
  tonicPc: PitchClass;
}

/** A progression played back chord by chord, by the lessons' own progression runner. */
export interface ProgressionQuestion {
  type: 'progression';
  id: string;
  item: ProgressionItem;
}

export type EarQuestion = ChordQuestion | MelodyQuestion | KeyQuestion | ProgressionQuestion;

export interface EarLevel {
  id: string;
  order: number;
  title: string;
  summary: string;
  /** Whether attempts go to the practice service. Tunes and keys have no item kind there yet, so they stay on this device. */
  saved: boolean;
  make: (rng: Rng, n: number) => EarQuestion;
}

const key = (text: string): Key => ({ tonic: parseNote(text)!.note, mode: 'major' });
const name = (n: SpelledNote) => pretty(noteToString(n));
const list = (names: string[]) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

/** Roots the way bands usually spell them. */
const ALL_ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const WHITE_ROOTS = ['C', 'D', 'E', 'F', 'G', 'A'];
/** Easy keys first: few sharps and flats. */
const EASY_KEYS = ['C', 'G', 'F', 'D'];
const MORE_KEYS = ['C', 'G', 'F', 'D', 'A', 'Bb', 'E'];

/** Lowest note of a chord or tune: between F3 and E4, so it fits a 25-key board (C3-C5). */
const LOW = 53;
export const placeFrom = (pc: PitchClass, floor: MidiNote = LOW): MidiNote => floor + mod12(pc - floor);

/** A chord stacked up from its root: root, then each note above the last. */
export function stack(pcs: readonly PitchClass[], floor: MidiNote = LOW): MidiNote[] {
  const out: MidiNote[] = [];
  let at = floor;
  for (const pc of pcs) {
    const n = placeFrom(pc, at);
    out.push(n);
    at = n + 1;
  }
  return out;
}

/** The chord, then the same notes one at a time, low to high: hearing it broken up makes the middle note easier to catch. */
const chordSounds = (notes: MidiNote[]): Sound[] => [
  { kind: 'chord', notes },
  { kind: 'sequence', notes },
];

const QUALITY_WORD: Partial<Record<ChordQuality, string>> = { major: 'major', minor: 'minor', dim: 'diminished' };

function chordQuestion(id: string, prompt: string, k: Key, root: SpelledNote, quality: ChordQuality, opts: { reference?: MidiNote[]; numeral?: string }): ChordQuestion {
  const rootPc = spelledPc(root);
  const pcs = chordPitchClasses(rootPc, quality);
  const notes = stack(pcs);
  const spelled = spellChord(root, quality);
  const answer = `${name(root)} ${QUALITY_WORD[quality] ?? quality}`;
  const where = opts.numeral ? `The ${opts.numeral} chord in ${pretty(keyName(k))}. ` : '';
  const sounds = chordSounds(notes);
  return {
    type: 'chord',
    id,
    prompt,
    key: k,
    listen: opts.reference ? [{ kind: 'chord', notes: opts.reference }, ...sounds] : sounds,
    answer,
    detail: `${where}Notes: ${list(spelled.map(name))}.`,
    answerKeys: notes,
    item: { kind: 'build-chord', id, prompt, pitchClasses: pcs, bassPc: null, byEar: true },
    rootPc,
    quality,
    numbered: !!opts.numeral,
  };
}

/** Level 1 and 2: major or minor, with the root named or not. */
function majorMinor(roots: readonly string[], rootNamed: boolean) {
  return (rng: Rng, n: number): ChordQuestion => {
    const rootText = pick(rng, roots);
    const root = parseNote(rootText)!.note;
    const quality: ChordQuality = rng() < 0.5 ? 'major' : 'minor';
    const prompt = rootNamed
      ? `This chord is built on ${name(root)}. Is it major or minor? Play it.`
      : 'Find the chord you hear. It is major or minor.';
    // Name the notes in the chord's own major key, so a minor 3rd reads E♭, not D♯.
    return chordQuestion(`ear-${n}`, prompt, key(rootText), root, quality, {});
  };
}

/** Level 3 and 4: home chord first, then a chord from the same key. */
function inKey(keys: readonly string[], numbers: readonly number[]) {
  return (rng: Rng, n: number): ChordQuestion => {
    const k = key(pick(rng, keys));
    const number = pick(rng, numbers);
    const chord = chordFromNumeral(String(number), k)!;
    const home = stack(chordFromNumeral('1', k)!.pitchClasses);
    const prompt = `Key of ${pretty(keyName(k))}. First you hear home (the 1 chord), then a mystery chord. Find the mystery chord.`;
    return chordQuestion(`ear-${n}`, prompt, k, chord.root, chord.quality, { reference: home, numeral: String(number) });
  };
}

/** Common band progressions, as Nashville numbers. */
export const PROGRESSIONS: readonly string[][] = [
  ['1', '4', '5', '1'],
  ['1', '5', '6', '4'],
  ['1', '6', '4', '5'],
  ['6', '4', '1', '5'],
  ['1', '4', '6', '5'],
  ['2', '5', '1'],
  ['1', '5', '4', '1'],
  ['4', '1', '5', '6'],
];

function progression(rng: Rng, n: number): ProgressionQuestion {
  const k = pick(rng, EASY_KEYS);
  const numerals = pick(rng, PROGRESSIONS);
  const id = `ear-${n}`;
  return {
    type: 'progression',
    id,
    item: {
      kind: 'play-progression',
      id,
      prompt: `A progression in ${pretty(k)}, ${numerals.length} chords. Listen, then play it back one chord at a time.`,
      key: k,
      numerals,
      byEar: true,
    },
  };
}

/** Scale steps a tune may use: from the 7th below home up to the 6th above. */
const STEPS = [-1, 0, 1, 2, 3, 4, 5];

/** A short tune that moves mostly by step, like the tunes you already pick up by ear. */
export function tuneSteps(rng: Rng, length: number, endHome: boolean): number[] {
  const out = [0];
  while (out.length < length) {
    const last = out.at(-1)!;
    const leap = rng() < 0.25;
    const move = (rng() < 0.5 ? -1 : 1) * (leap ? 2 : 1);
    const next = STEPS.includes(last + move) ? last + move : last - move;
    if (next !== last) out.push(next);
  }
  if (endHome) {
    out[out.length - 1] = 0;
    // Step into home from next door, without repeating the note before.
    if (out.at(-2) === 0) out[out.length - 2] = [1, -1, 2].find((st) => st !== out.at(-3))!;
  }
  return out;
}

/** Home for tunes: between E3 and E♭4, so the 7th below and the 6th above stay on a 25-key board. */
const TUNE_LOW = 52;

/** MIDI note for a scale step from home, in a major key. */
export function stepNote(home: MidiNote, step: number): MidiNote {
  const octave = Math.floor(step / 7);
  return home + octave * 12 + scaleOffsets('major')[step - octave * 7]!;
}

function melody(rng: Rng, n: number): MelodyQuestion {
  const k = key(pick(rng, EASY_KEYS));
  const home = placeFrom(keyTonicPc(k), TUNE_LOW);
  const steps = tuneSteps(rng, 4 + Math.floor(rng() * 2), false);
  const notes = steps.map((s) => stepNote(home, s));
  const order = notes.map((m) => mod12(m));
  return {
    type: 'melody',
    id: `ear-${n}`,
    prompt: `Key of ${pretty(keyName(k))}. Play back the tune, note by note. It starts on ${name(k.tonic)}.`,
    key: k,
    listen: [{ kind: 'sequence', notes }],
    answer: list(order.map((pc) => name(spellInKey(pc, k)))),
    detail: `${notes.length} notes in ${pretty(keyName(k))} major, starting on home.`,
    answerKeys: notes,
    order,
  };
}

const CADENCES = [
  ['1', '4', '5', '1'],
  ['1', '6', '4', '5', '1'],
  ['1', '5', '6', '4', '1'],
];

function keyQuestion(k: Key, n: number, listen: Sound[], how: string): KeyQuestion {
  const tonicPc = keyTonicPc(k);
  // The scale from the home note, low enough that the octave above still fits on 25 keys.
  const home = placeFrom(tonicPc, 48);
  const scale = scaleOffsets('major').map((o) => home + o);
  const chords = ['1', '4', '5'].map((x) => pretty(chordFromNumeral(x, k)!.symbol));
  return {
    type: 'key',
    id: `ear-${n}`,
    prompt: `What key is this in? ${how} Then play its home note: the one the music wants to rest on.`,
    key: k,
    listen,
    answer: `${pretty(keyName(k))} major`,
    detail: `Home note ${name(k.tonic)}. Its main chords are ${list(chords)}, the 1, 4 and 5.`,
    answerKeys: [...scale, home + 12],
    tonicPc,
  };
}

function keyFromChords(rng: Rng, n: number): KeyQuestion {
  const k = key(pick(rng, ALL_ROOTS));
  const listen = pick(rng, CADENCES).map((x): Sound => ({ kind: 'chord', notes: stack(chordFromNumeral(x, k)!.pitchClasses, 48) }));
  return keyQuestion(k, n, listen, 'Listen to the chords.');
}

function keyFromTune(rng: Rng, n: number): KeyQuestion {
  const k = key(pick(rng, MORE_KEYS));
  const home = placeFrom(keyTonicPc(k), TUNE_LOW);
  const steps = tuneSteps(rng, 7, true);
  // Start somewhere other than home, so the first note doesn't give it away.
  steps[0] = pick(rng, [2, 4]);
  return keyQuestion(k, n, [{ kind: 'sequence', notes: steps.map((s) => stepNote(home, s)) }], 'Listen to the tune.');
}

export const EAR_LEVELS: readonly EarLevel[] = [
  {
    id: 'major-minor-root',
    order: 1,
    title: 'Major or minor, root given',
    summary: 'You are told the bottom note. Listen: bright (major) or dark (minor)? Then play it.',
    saved: true,
    make: majorMinor(WHITE_ROOTS, true),
  },
  {
    id: 'major-minor',
    order: 2,
    title: 'Major or minor, any chord',
    summary: 'Now nothing is named. Find the root and the colour of the chord on your own.',
    saved: true,
    make: majorMinor(ALL_ROOTS, false),
  },
  {
    id: 'one-four-five',
    order: 3,
    title: 'The 1, 4 and 5 chords',
    summary: 'Home plays first, then one of the three chords most songs use. Which one moved?',
    saved: true,
    make: inKey(EASY_KEYS, [1, 4, 5]),
  },
  {
    id: 'chords-in-key',
    order: 4,
    title: 'Any chord in the key',
    summary: 'Adds the minor chords 2, 3 and 6. This is what hearing a song’s chords feels like.',
    saved: true,
    make: inKey(MORE_KEYS, [1, 2, 3, 4, 5, 6]),
  },
  {
    id: 'progressions',
    order: 5,
    title: 'Short progressions',
    summary: 'Three or four chords in a row, like 1-5-6-4. Play them back one chord at a time.',
    saved: true,
    make: progression,
  },
  {
    id: 'melody',
    order: 6,
    title: 'Play back a tune',
    summary: 'A short tune in a named key. You already do this by ear; here you see the note names too.',
    saved: false,
    make: melody,
  },
  {
    id: 'key-chords',
    order: 7,
    title: 'What key? From chords',
    summary: 'A few chords play. Find the home note, and the app tells you the key and its chords.',
    saved: false,
    make: keyFromChords,
  },
  {
    id: 'key-tune',
    order: 8,
    title: 'What key? From a tune',
    summary: 'Only a tune this time, like humming a song. Find where it wants to rest.',
    saved: false,
    make: keyFromTune,
  },
];

export const QUESTIONS_PER_ROUND = 10;

export function earLevel(id: string): EarLevel | undefined {
  return EAR_LEVELS.find((l) => l.id === id);
}

/** A round of questions, without the same one twice in a row. */
export function makeRound(level: EarLevel, rng: Rng, count = QUESTIONS_PER_ROUND): EarQuestion[] {
  const out: EarQuestion[] = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 20) {
    const q = level.make(rng, out.length + 1);
    const prev = out.at(-1);
    if (prev && signature(prev) === signature(q)) continue;
    out.push(q);
  }
  return out;
}

function signature(q: EarQuestion): string {
  if (q.type === 'progression') return `${q.item.key}:${q.item.numerals.join('-')}`;
  return `${q.prompt}|${q.answerKeys.join(',')}`;
}
