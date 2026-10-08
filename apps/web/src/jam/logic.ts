/**
 * Jam-along: what the backing band plays on each beat, and which keys fit.
 * Pure, so it is unit tested; band.ts turns these events into sound.
 */

import type { JamStyle } from '@music/contracts';
import { chordFromNumeral, keyScale, mod12, pitchClass, spelledPc, type Key, type MidiNote, type NumeralChord, type PitchClass } from '@music/theory';

export type { JamStyle };

export interface JamChord {
  numeral: string;
  chord: NumeralChord;
}

export interface JamPreset {
  id: string;
  label: string;
  numerals: string[];
  /** Where you've heard it, in a few words. */
  note: string;
  style?: JamStyle;
  beatsPerChord?: number;
}

export const PRESETS: readonly JamPreset[] = [
  { id: '1564', label: '1-5-6-4', numerals: ['1', '5', '6', '4'], note: 'The four-chord pop song' },
  { id: '1645', label: '1-6-4-5', numerals: ['1', '6', '4', '5'], note: 'The 50s ballad', style: 'ballad' },
  { id: '6415', label: '6-4-1-5', numerals: ['6', '4', '1', '5'], note: 'The same four chords, starting sad' },
  { id: '1415', label: '1-4-1-5', numerals: ['1', '4', '1', '5'], note: 'The three-chord trick', style: 'rock' },
  { id: '4156', label: '4-1-5-6', numerals: ['4', '1', '5', '6'], note: 'A chorus that starts on the four' },
  { id: '251', label: '2-5-1', numerals: ['ii7', 'V7', 'Imaj7', 'Imaj7'], note: 'Jazz and soul', style: 'ballad' },
  { id: '1625', label: '1-6-2-5', numerals: ['1', '6', '2', '5'], note: 'The turnaround', beatsPerChord: 2 },
  { id: '1b74', label: '1-♭7-4-1', numerals: ['1', 'b7', '4', '1'], note: 'Classic rock', style: 'rock' },
  { id: 'blues', label: '12-bar blues', numerals: ['I7', 'I7', 'I7', 'I7', 'IV7', 'IV7', 'I7', 'I7', 'V7', 'IV7', 'I7', 'V7'], note: 'Blues and rock and roll', style: 'shuffle' },
];

export const STYLES: ReadonlyArray<{ id: JamStyle; label: string; note: string }> = [
  { id: 'pop', label: 'Pop', note: 'Steady and even, the default' },
  { id: 'rock', label: 'Rock', note: 'Driving eighth notes' },
  { id: 'ballad', label: 'Ballad', note: 'Slow and spacious' },
  { id: 'four-on-the-floor', label: 'Four on the floor', note: 'Dance: a kick on every beat' },
  { id: 'half-time', label: 'Half time', note: 'Big and heavy, snare on 3' },
  { id: 'shuffle', label: 'Shuffle', note: 'Long-short swing, for blues' },
];

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

/**
 * The chord a band means by a numeral. A bare number with a flat or sharp
 * ("b7", "b3") is a major chord, the way bands say "the flat seven"; the
 * theory library would give it the key's own quality (B♭dim in C).
 */
export function jamChord(numeral: string, key: Key): NumeralChord | null {
  const text = numeral.replace(/♭/g, 'b').replace(/♯/g, '#');
  const m = /^([b#]+)([1-7])$/.exec(text);
  return chordFromNumeral(m ? m[1]! + ROMAN[Number(m[2]) - 1]! : text, key);
}

/** Read "1 5 6 4", "1-5-6-4", "I V vi IV" or "ii7, V7, I" into chords. */
export function parseProgression(text: string, key: Key): { chords: JamChord[]; bad: string[] } {
  // Numerals never contain a dash, so dashes, commas and spaces all separate chords.
  const parts = text.split(/[\s,|\-–—]+/).filter(Boolean);
  const chords: JamChord[] = [];
  const bad: string[] = [];
  for (const numeral of parts) {
    const chord = jamChord(numeral, key);
    if (chord) chords.push({ numeral, chord });
    else bad.push(numeral);
  }
  return { chords, bad };
}

export function chordsFor(numerals: readonly string[], key: Key): JamChord[] {
  return numerals.flatMap((numeral) => {
    const chord = jamChord(numeral, key);
    return chord ? [{ numeral, chord }] : [];
  });
}

/** Where we are in the progression at a beat (beat 0 is the first after the count-in). */
export function position(beat: number, chordCount: number, beatsPerChord: number) {
  if (beat < 0 || chordCount === 0) return { index: 0, beatInChord: 0, beatsLeft: beatsPerChord, changing: false, countIn: beat < 0 };
  const total = Math.floor(beat / beatsPerChord);
  const beatInChord = beat % beatsPerChord;
  return { index: total % chordCount, beatInChord, beatsLeft: beatsPerChord - beatInChord, changing: beatInChord === 0, countIn: false };
}

// ---- Voicing ----

/** Backing chords sit below middle C's octave, out of the way of the right hand. */
const CHORD_LOW = 52; // E3
const CHORD_HIGH = 64; // E4: the lowest chord note starts below this
const BASS_LOW = 36; // C2

/** Close-position voicings of the chord with the lowest note between E3 and E4. */
function voicings(pcs: readonly PitchClass[]): MidiNote[][] {
  const out: MidiNote[][] = [];
  for (let r = 0; r < pcs.length; r++) {
    const order = [...pcs.slice(r), ...pcs.slice(0, r)];
    const first = CHORD_LOW + mod12(order[0]! - CHORD_LOW);
    if (first >= CHORD_HIGH) continue;
    const notes = [first];
    for (const pc of order.slice(1)) notes.push(notes.at(-1)! + 1 + mod12(pc - notes.at(-1)! - 1));
    out.push(notes);
  }
  return out;
}

const centre = (notes: readonly MidiNote[]) => notes.reduce((a, b) => a + b, 0) / notes.length;

/**
 * The voicing that moves least from the previous chord, the way a keyboard
 * player keeps their hand in one place.
 */
export function voiceChord(chord: NumeralChord, previous: readonly MidiNote[] | null): MidiNote[] {
  const options = voicings(chord.pitchClasses);
  if (options.length === 0) return [];
  const target = previous && previous.length > 0 ? centre(previous) : 60;
  return options.reduce((best, v) => (Math.abs(centre(v) - target) < Math.abs(centre(best) - target) ? v : best));
}

/** The bass note: the chord's lowest note (the slash note when there is one), around C2. */
export function bassNote(chord: NumeralChord): MidiNote {
  return BASS_LOW + mod12(chord.bassPc - BASS_LOW);
}

// ---- What fits ----

export interface Fit {
  chordTones: Set<PitchClass>;
  scaleTones: Set<PitchClass>;
}

export function fitFor(chord: NumeralChord | null, key: Key): Fit {
  return { chordTones: new Set(chord?.pitchClasses ?? []), scaleTones: new Set(keyScale(key).map(spelledPc)) };
}

export type FitKind = 'chord' | 'scale' | 'outside';

export function fitOf(note: MidiNote, fit: Fit): FitKind {
  const pc = pitchClass(note);
  return fit.chordTones.has(pc) ? 'chord' : fit.scaleTones.has(pc) ? 'scale' : 'outside';
}

// ---- The band's parts ----

export type Drum = 'kick' | 'snare' | 'hat' | 'open-hat' | 'rim';

/** Times are in beats from the start of this beat; durations in beats. */
export interface BeatEvents {
  chords: Array<{ at: number; dur: number; level: number }>;
  bass: Array<{ at: number; dur: number; offset: number; level: number }>;
  drums: Array<{ at: number; drum: Drum; level: number }>;
}

const SWING = 2 / 3;

type DrumBar = ReadonlyArray<ReadonlyArray<readonly [number, Drum, number]>>;

const eighthHats = (level = 0.5): Array<readonly [number, Drum, number]> => [
  [0, 'hat', level],
  [0.5, 'hat', level * 0.6],
];

const DRUMS: Readonly<Record<JamStyle, DrumBar>> = {
  pop: [
    [[0, 'kick', 1], ...eighthHats()],
    [[0, 'snare', 0.9], ...eighthHats()],
    [[0, 'kick', 1], [0.5, 'kick', 0.7], ...eighthHats()],
    [[0, 'snare', 0.9], ...eighthHats()],
  ],
  rock: [
    [[0, 'kick', 1], ...eighthHats(0.6)],
    [[0, 'snare', 1], ...eighthHats(0.6)],
    [[0, 'kick', 1], [0.5, 'kick', 0.85], ...eighthHats(0.6)],
    [[0, 'snare', 1], ...eighthHats(0.6)],
  ],
  ballad: [
    [[0, 'kick', 0.8], [0, 'hat', 0.35]],
    [[0, 'rim', 0.6], [0, 'hat', 0.3]],
    [[0, 'hat', 0.35], [0.5, 'kick', 0.6]],
    [[0, 'rim', 0.6], [0, 'hat', 0.3]],
  ],
  'four-on-the-floor': [0, 1, 2, 3].map((b) => [[0, 'kick', 1] as const, [0.5, 'open-hat', 0.45] as const, ...(b % 2 === 1 ? [[0, 'snare', 0.8] as const] : [])]),
  'half-time': [
    [[0, 'kick', 1], ...eighthHats(0.45)],
    [...eighthHats(0.45)],
    [[0, 'snare', 1], ...eighthHats(0.45)],
    [[0.5, 'kick', 0.7], ...eighthHats(0.45)],
  ],
  shuffle: [
    [[0, 'kick', 1], [0, 'hat', 0.5], [SWING, 'hat', 0.3]],
    [[0, 'snare', 0.85], [0, 'hat', 0.5], [SWING, 'hat', 0.3]],
    [[0, 'kick', 1], [0, 'hat', 0.5], [SWING, 'hat', 0.3]],
    [[0, 'snare', 0.85], [0, 'hat', 0.5], [SWING, 'hat', 0.3]],
  ],
};

/** Chord hits per beat of the bar: [at, length]. */
const CHORDS: Readonly<Record<JamStyle, ReadonlyArray<ReadonlyArray<readonly [number, number]>>>> = {
  pop: [[[0, 2]], [], [[0, 1.5], [1.5, 0.5]], []],
  rock: [0, 1, 2, 3].map(() => [[0, 0.45], [0.5, 0.45]]),
  ballad: [[[0, 4]], [], [], []],
  'four-on-the-floor': [0, 1, 2, 3].map(() => [[0.5, 0.3]]),
  'half-time': [[[0, 4]], [], [], []],
  shuffle: [0, 1, 2, 3].map((b) => (b % 2 === 1 ? [[0, 0.5], [SWING, 0.3]] : [[SWING, 0.3]])),
};

/** Bass notes per beat of the bar: [at, half steps above the bass note, length]. */
type BassNote = readonly [at: number, offset: number, dur: number];

function bassLine(style: JamStyle, beatInBar: number, minorThird: boolean): BassNote[] {
  const bar = (beats: BassNote[][]) => beats[beatInBar]!;
  switch (style) {
    case 'pop':
      return bar([[[0, 0, 1.4]], [[0.5, 0, 0.4]], [[0, 0, 0.9]], [[0, 7, 0.9]]]);
    case 'rock':
      return [
        [0, 0, 0.45],
        [0.5, 0, 0.45],
      ];
    case 'ballad':
      return bar([[[0, 0, 1.9]], [], [[0, 7, 1.9]], []]);
    case 'four-on-the-floor':
      return [
        [0, 0, 0.3],
        [0.5, 12, 0.3],
      ];
    case 'half-time':
      return bar([[[0, 0, 2.4]], [], [[0.5, 0, 0.4]], [[0, 7, 0.9]]]);
    case 'shuffle': {
      // The boogie line: root, 3rd, 5th, 6th, each played long-short.
      const step = [0, minorThird ? 3 : 4, 7, 9][beatInBar]!;
      return [
        [0, step, SWING - 0.05],
        [SWING, step, 1 - SWING - 0.02],
      ];
    }
  }
}

/** Styles whose chords hold, so a chord change mid-bar needs a fresh hit. */
const HOLDS: ReadonlySet<JamStyle> = new Set(['pop', 'ballad', 'half-time']);

/**
 * Everything the band plays on one beat. Lengths are cut at the next chord
 * change so a held chord never rings into the wrong harmony.
 */
export function beatEvents(style: JamStyle, beat: number, beatsPerChord: number, chord: NumeralChord): BeatEvents {
  const beatInBar = ((beat % 4) + 4) % 4;
  const beatsLeft = beatsPerChord - (beat % beatsPerChord);
  const clip = (at: number, dur: number) => Math.max(0.1, Math.min(dur, beatsLeft - at - 0.05));
  const changing = beat % beatsPerChord === 0;

  const chords = CHORDS[style][beatInBar]!.map(([at, dur]) => ({ at, dur: clip(at, dur), level: 0.7 }));
  if (changing && HOLDS.has(style) && !chords.some((c) => c.at === 0)) chords.unshift({ at: 0, dur: clip(0, beatsLeft), level: 0.65 });

  const minorThird = chord.pitchClasses.includes(mod12(chord.pitchClasses[0]! + 3));
  let bass = bassLine(style, beatInBar, minorThird).map(([at, offset, dur]) => ({ at, offset, dur: clip(at, dur), level: 0.9 }));
  if (changing && !bass.some((b) => b.at === 0)) bass = [{ at: 0, offset: 0, dur: clip(0, 1), level: 0.9 }, ...bass];
  // Under a slash chord the bass stays on its named note.
  if (chord.bassPc !== spelledPc(chord.root)) bass = bass.map((b) => ({ ...b, offset: b.offset === 12 ? 12 : 0 }));

  const drums = DRUMS[style][beatInBar]!.map(([at, drum, level]) => ({ at, drum, level }));
  return { chords, bass, drums };
}

/** The count-in: a stick click on each beat, louder on the first. */
export function countInEvents(beat: number): BeatEvents {
  return { chords: [], bass: [], drums: [{ at: 0, drum: 'rim', level: beat === -4 ? 1 : 0.7 }] };
}
