/**
 * The drills for the daily session, built from small pieces so every hand,
 * finger pattern and chord lands on the right keys. All keys stay between C3
 * and C5 (48-72) so they fit the on-screen keyboard. The app hears keys, not
 * fingers, so the finger numbers are a guide the hand on screen shows.
 */

import type { HandPosition, HandSide, TechniqueBeat } from '@music/contracts';

export type Focus = 'finger' | 'move' | 'shape' | 'progression' | 'notes' | 'mirror';
export type Mode = 'speed' | 'control' | 'stability';
export type HandChoice = HandSide | 'both';

export interface Exercise {
  id: string;
  focus: Focus;
  title: string;
  /** One or two plain sentences: what it trains and how to play it. */
  blurb: string;
  hand: HandChoice;
  /** Where the hands rest before the first beat. */
  hands: HandPosition[];
  beats: TechniqueBeat[];
  /** Notes drills hide which key to press: you find it by name. */
  blind?: boolean;
  /** Fingers 3 and 4 count in the pattern: they get the extra work. */
  weak: number;
}

const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
const isWhite = (m: number) => WHITE_PCS.includes(m % 12);

/** `count` white keys going up from the white key `from`. */
export function whiteRun(from: number, count: number): number[] {
  const out: number[] = [];
  for (let m = from; out.length < count; m++) if (isWhite(m)) out.push(m);
  return out;
}

/**
 * A five-finger position on white keys. `anchor` is the lowest key: under the
 * thumb for the right hand, under the little finger for the left.
 */
export function fivePosition(hand: HandSide, anchor: number): HandPosition {
  const run = whiteRun(anchor, 5);
  return { hand, keys: hand === 'right' ? run : [...run].reverse() };
}

export const RH_HOME = fivePosition('right', 60);
export const LH_HOME = fivePosition('left', 48);

const home = (hand: HandSide) => (hand === 'right' ? RH_HOME : LH_HOME);

/** The beat for a finger pattern on a position. */
export function patternBeats(pos: HandPosition, pattern: readonly number[]): TechniqueBeat[] {
  return pattern.map((f) => ({ notes: [{ midi: pos.keys[f - 1]!, hand: pos.hand, finger: f }] }));
}

const weakCount = (pattern: readonly number[]) => pattern.filter((f) => f === 3 || f === 4).length;

interface PatternDef {
  id: string;
  title: string;
  blurb: string;
  pattern: number[];
}

/** Finger-independence patterns. Fingers 3 and 4 are the hardest to lift on their own, so many lean on them. */
export const FINGER_PATTERNS: PatternDef[] = [
  { id: 'run', title: 'Five-finger run', blurb: 'Up and back down, one finger per key. Keep the wrist level and the fingers curved.', pattern: [1, 2, 3, 4, 5, 4, 3, 2, 1] },
  { id: 'pair34', title: 'The 3-4 pair', blurb: 'Only fingers 3 and 4, back and forth. Lift one finger as the other presses; stay loose.', pattern: [3, 4, 3, 4, 3, 4, 3, 4] },
  { id: 'ring4', title: 'Ring finger leads', blurb: 'Finger 4 plays between every other finger. It is the weakest, so it gets the most turns.', pattern: [4, 1, 4, 2, 4, 3, 4, 5] },
  { id: 'middle3', title: 'Middle finger leads', blurb: 'Finger 3 plays between every other finger. Let the others move without the hand twisting.', pattern: [3, 1, 3, 2, 3, 4, 3, 5] },
  { id: 'hanon', title: 'Up in steps of two', blurb: 'A classic finger-independence pattern: 1-3-2-4-3-5-4-2. Slow and even wins.', pattern: [1, 3, 2, 4, 3, 5, 4, 2] },
  { id: 'skips', title: 'Thumb and a skip', blurb: 'The thumb returns between each finger, which trains the thumb to move on its own.', pattern: [1, 3, 1, 4, 1, 5, 1, 4, 1, 3] },
  { id: 'reverse', title: 'Coming down', blurb: 'The pattern backwards: 5-3-4-2-3-1. Going down trips most hands up first.', pattern: [5, 3, 4, 2, 3, 1, 2, 1] },
];

export function fingerExercise(hand: HandSide, patternId: string): Exercise {
  const def = FINGER_PATTERNS.find((p) => p.id === patternId) ?? FINGER_PATTERNS[0]!;
  const pos = home(hand);
  return {
    id: `finger-${hand}-${def.id}`,
    focus: 'finger',
    title: `${def.title} (${hand} hand)`,
    blurb: def.blurb,
    hand,
    hands: [pos],
    beats: patternBeats(pos, def.pattern),
    weak: weakCount(def.pattern),
  };
}

/** Both hands at once, mirror images: the same finger in each hand, moving in opposite directions. */
export function mirrorExercise(): Exercise {
  const right = RH_HOME;
  // Mirror C-D-E-F-G about the line between B and C: B-A-G-F-E in the left hand.
  const left: HandPosition = { hand: 'left', keys: [59, 57, 55, 53, 52] };
  const order = [1, 2, 3, 4, 5, 4, 3, 2, 1];
  const beats: TechniqueBeat[] = order.map((f) => ({
    notes: [
      { midi: left.keys[f - 1]!, hand: 'left', finger: f },
      { midi: right.keys[f - 1]!, hand: 'right', finger: f },
    ],
  }));
  return {
    id: 'mirror-run',
    focus: 'mirror',
    title: 'Mirror run (both hands)',
    blurb: 'Both hands play the same finger together, moving apart then back. The strong hand teaches the slower one; watch that finger 3 and 4 of the left keep up.',
    hand: 'both',
    hands: [left, right],
    beats,
    weak: weakCount(order) * 2,
  };
}

/** A hand position from a chord: the three chord keys under their fingers, fingers 2 and 4 in between. */
function chordPosition(hand: HandSide, keys: readonly number[], fingers: readonly number[]): HandPosition {
  const byFinger = new Map(keys.map((k, i) => [fingers[i]!, k]));
  const base = [...byFinger.entries()].sort((a, b) => a[0] - b[0]);
  const lo = base[0]!;
  const hi = base[base.length - 1]!;
  const out: number[] = [];
  for (let f = 1; f <= 5; f++) {
    const known = byFinger.get(f);
    if (known !== undefined) out.push(known);
    else out.push(Math.round(lo[1] + ((hi[1] - lo[1]) * (f - lo[0])) / (hi[0] - lo[0])));
  }
  // Clamp to the valid key range for the contract.
  return { hand, keys: out.map((k) => Math.min(108, Math.max(21, k))) };
}

export interface Triad {
  /** Chord name as printed, e.g. "Am". */
  name: string;
  keys: number[];
  fingers: number[];
}

/** A triad placed so its notes sit in [lo, hi] and (when `prev` is given) close to the one before. */
export function voiceTriad(hand: HandSide, rootPc: number, minor: boolean, name: string, lo: number, hi: number, prev?: readonly number[]): Triad {
  const pcs = [rootPc % 12, (rootPc + (minor ? 3 : 4)) % 12, (rootPc + 7) % 12];
  const candidates: number[][] = [];
  for (let low = lo; low <= hi; low++) {
    if (!pcs.includes(low % 12)) continue;
    // Stack the other two chord notes above the lowest.
    const order = pcs.filter((p) => p !== low % 12);
    const upper = order.map((p) => low + ((p - low + 120) % 12)).sort((a, b) => a - b);
    const keys = [low, ...upper];
    if (keys[2]! <= hi) candidates.push(keys);
  }
  const centre = (lo + hi) / 2;
  const cost = (k: number[]) => (prev ? Math.abs(avg(k) - avg(prev)) : Math.abs(avg(k) - centre)) + (k[2]! - k[0]!) / 4;
  const keys = [...candidates].sort((a, b) => cost(a) - cost(b))[0] ?? [lo, lo + 4, lo + 7];
  const gaps = [keys[1]! - keys[0]!, keys[2]! - keys[1]!];
  let fingers: number[];
  if (hand === 'right') fingers = gaps[1] === 5 ? [1, 2, 5] : [1, 3, 5];
  else fingers = gaps[0] === 5 ? [5, 2, 1] : [5, 3, 1];
  return { name, keys, fingers };
}

const avg = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

const RANGE: Record<HandSide, [number, number]> = { left: [48, 62], right: [60, 72] };

const chordBeat = (hand: HandSide, t: Triad, moveTo = true): TechniqueBeat => ({
  notes: t.keys.map((midi, i) => ({ midi, hand, finger: t.fingers[i]! })),
  ...(moveTo ? { move: [chordPosition(hand, t.keys, t.fingers)] } : {}),
});

/** A chord in a major key, from its numeral. */
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 } as const;
const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

const DEGREES: Record<string, { step: number; minor: boolean }> = {
  I: { step: 0, minor: false },
  ii: { step: 2, minor: true },
  iii: { step: 4, minor: true },
  IV: { step: 5, minor: false },
  V: { step: 7, minor: false },
  vi: { step: 9, minor: true },
};

export function progressionTriads(hand: HandSide, keyPc: number, numerals: readonly string[]): Triad[] {
  const [lo, hi] = RANGE[hand];
  const out: Triad[] = [];
  for (const n of numerals) {
    const d = DEGREES[n]!;
    const pc = (keyPc + d.step) % 12;
    const name = `${NOTE_NAMES[pc]}${d.minor ? 'm' : ''}`;
    out.push(voiceTriad(hand, pc, d.minor, name, lo, hi, out[out.length - 1]?.keys));
  }
  return out;
}

export const PROGRESSIONS: { id: string; numerals: string[]; label: string }[] = [
  { id: 'pop', numerals: ['I', 'V', 'vi', 'IV'], label: 'I V vi IV' },
  { id: 'cadence', numerals: ['I', 'IV', 'V', 'I'], label: 'I IV V I' },
  { id: 'two-five', numerals: ['ii', 'V', 'I', 'I'], label: 'ii V I' },
  { id: 'fifties', numerals: ['I', 'vi', 'IV', 'V'], label: 'I vi IV V' },
];

export const PROGRESSION_KEYS: { id: string; pc: number; name: string }[] = [
  { id: 'C', pc: PC.C, name: 'C' },
  { id: 'G', pc: PC.G, name: 'G' },
  { id: 'F', pc: PC.F, name: 'F' },
  { id: 'D', pc: PC.D, name: 'D' },
];

export function progressionExercise(hand: HandSide, progressionId: string, keyId: string): Exercise {
  const prog = PROGRESSIONS.find((p) => p.id === progressionId) ?? PROGRESSIONS[0]!;
  const key = PROGRESSION_KEYS.find((k) => k.id === keyId) ?? PROGRESSION_KEYS[0]!;
  const triads = progressionTriads(hand, key.pc, prog.numerals);
  // Go round twice so it feels like a song, not a single pass.
  const seq = [...triads, ...triads];
  return {
    id: `prog-${hand}-${prog.id}-${key.id}`,
    focus: 'progression',
    title: `${prog.label} in ${key.name} (${hand} hand)`,
    blurb: `The chords are ${triads.map((t) => t.name).join(', ')}. Press all three keys together, move the whole hand to the next chord without looking at your fingers for long.`,
    hand,
    hands: [chordPosition(hand, triads[0]!.keys, triads[0]!.fingers)],
    beats: seq.map((t) => chordBeat(hand, t)),
    weak: 0,
  };
}

/** Jumping chords: the hand leaves one shape and lands on a far-away one. */
export function jumpExercise(hand: HandSide, variant: 'near' | 'far'): Exercise {
  const [lo, hi] = RANGE[hand];
  const chords: [number, boolean, string][] =
    variant === 'near'
      ? [[0, false, 'C'], [5, false, 'F'], [0, false, 'C'], [7, false, 'G']]
      : [[0, false, 'C'], [7, false, 'G'], [9, true, 'Am'], [5, false, 'F']];
  const triads: Triad[] = [];
  for (const [pc, minor, name] of chords) {
    // Far jumps: alternate the low and high ends of the range, no voice-leading.
    const t = variant === 'far' ? voiceTriad(hand, pc, minor, name, triads.length % 2 === 0 ? lo : hi - 8, triads.length % 2 === 0 ? lo + 9 : hi) : voiceTriad(hand, pc, minor, name, lo, hi);
    triads.push(t);
  }
  const seq = [...triads, ...triads];
  return {
    id: `jump-${hand}-${variant}`,
    focus: 'move',
    title: `${variant === 'far' ? 'Big jumps' : 'Chord hops'} (${hand} hand)`,
    blurb: variant === 'far' ? 'The hand jumps from one end to the other and lands on a chord. Look at the landing key as you leave, and let the arm lead, not the fingers.' : 'Hop between neighbouring chords. Lift, move as one, land together.',
    hand,
    hands: [chordPosition(hand, triads[0]!.keys, triads[0]!.fingers)],
    beats: seq.map((t) => chordBeat(hand, t)),
    weak: 0,
  };
}

/** Boom-chick for the left hand: a low note, then a chord above it, going back and forth (the basic bass pattern). */
export function boomChickExercise(): Exercise {
  const bass = [48, 53, 55, 48];
  const beats: TechniqueBeat[] = [];
  for (const b of bass) {
    // The chord sits above the bass note, so the two never share a key.
    const t = voiceTriad('left', b % 12, false, '', b + 3, b + 14);
    beats.push({ notes: [{ midi: b, hand: 'left', finger: 5 }], move: [LH_HOME_AT(b)] });
    beats.push({ notes: t.keys.map((midi, i) => ({ midi, hand: 'left' as const, finger: t.fingers[i]! })), move: [chordPosition('left', t.keys, t.fingers)] });
  }
  return {
    id: 'move-boomchick',
    focus: 'move',
    title: 'Boom, chick (left hand)',
    blurb: 'Low note with the little finger, then the chord above it, over and over. Bands call this a bass-and-chord pattern. Stay relaxed and keep the elbow loose.',
    hand: 'left',
    hands: [LH_HOME],
    beats,
    weak: 0,
  };
}

/** The left hand resting with the little finger on `bass`. */
const LH_HOME_AT = (bass: number): HandPosition => fivePosition('left', bass);

/** Chord shapes: the same triad types in the hand, pressed all together. */
export function shapeExercise(hand: HandSide, kind: 'root' | 'inversions'): Exercise {
  const [lo, hi] = RANGE[hand];
  const sets: [number, boolean, string][] =
    kind === 'root' ? [[0, false, 'C'], [5, false, 'F'], [7, false, 'G'], [9, true, 'Am'], [2, true, 'Dm'], [4, true, 'Em']] : [[0, false, 'C'], [0, false, 'C'], [0, false, 'C']];
  const triads: Triad[] = [];
  if (kind === 'root') {
    for (const [pc, minor, name] of sets) triads.push(voiceTriad(hand, pc, minor, name, lo, hi, triads[triads.length - 1]?.keys));
  } else {
    // C in its three positions: root, first and second inversion, then back down.
    const base = hand === 'right' ? 60 : 48;
    const shapes = [[0, 4, 7], [4, 7, 12], [7, 12, 16], [4, 7, 12], [0, 4, 7]];
    for (const [i, s] of shapes.entries()) {
      const keys = s.map((x) => base + x);
      const gaps = [keys[1]! - keys[0]!, keys[2]! - keys[1]!];
      const fingers = hand === 'right' ? (gaps[1] === 5 ? [1, 2, 5] : [1, 3, 5]) : gaps[0] === 5 ? [5, 2, 1] : [5, 3, 1];
      triads.push({ name: ['C', 'C/E', 'C/G', 'C/E', 'C'][i]!, keys, fingers });
    }
  }
  return {
    id: `shape-${hand}-${kind}`,
    focus: 'shape',
    title: kind === 'root' ? `Chord shapes (${hand} hand)` : `C in three positions (${hand} hand)`,
    blurb: kind === 'root' ? `Press ${triads.map((t) => t.name).join(', ')} with all three fingers landing together. Check the chord rings clean, with no key late.` : 'The same chord with its notes rearranged, called inversions. Find each shape without looking down.',
    hand,
    hands: [chordPosition(hand, triads[0]!.keys, triads[0]!.fingers)],
    beats: triads.map((t) => chordBeat(hand, t)),
    weak: 0,
  };
}

/** Small seeded random numbers, so a day's note drill is the same if you come back to it. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

export function noteName(midi: number): string {
  const idx = WHITE_PCS.indexOf(midi % 12);
  return idx === -1 ? NOTE_NAMES[midi % 12]! : NAMES[idx]!;
}

/** Note finding: a name appears, you find the key. Which finger you use is up to you. */
export function notesExercise(hand: HandSide, seed: number): Exercise {
  const [lo, hi] = RANGE[hand];
  const pool = [];
  for (let m = lo; m <= hi; m++) if (isWhite(m)) pool.push(m);
  const rand = seeded(seed + (hand === 'left' ? 1 : 2));
  const picks: number[] = [];
  while (picks.length < 10) {
    const m = pool[Math.floor(rand() * pool.length)]!;
    if (m !== picks[picks.length - 1]) picks.push(m);
  }
  const pos = home(hand);
  return {
    id: `notes-${hand}`,
    focus: 'notes',
    title: `Find the note (${hand} hand)`,
    blurb: 'A note name shows up. Find it with your hand and press it; the keyboard does not light it up for you. Say the name as you play.',
    hand,
    hands: [pos],
    blind: true,
    beats: picks.map((midi) => ({ notes: [{ midi, hand, finger: nearestFinger(pos, midi) }] })),
    weak: 0,
  };
}

function nearestFinger(pos: HandPosition, midi: number): number {
  let best = 1;
  for (let f = 1; f <= 5; f++) if (Math.abs(pos.keys[f - 1]! - midi) < Math.abs(pos.keys[best - 1]! - midi)) best = f;
  return best;
}
