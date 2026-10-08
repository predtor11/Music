/**
 * Scales and keys, spelled correctly: every scale uses each letter once, so
 * F major has Bb (not A#) and E major has D# (not Eb).
 */

import {
  LETTERS,
  letterIndex,
  mod12,
  noteToString,
  parseNote,
  spellWithLetter,
  spelledPc,
  type PitchClass,
  type SpelledNote,
} from './notes.js';

export type ScaleType = 'major' | 'naturalMinor' | 'harmonicMinor' | 'melodicMinor' | 'majorPentatonic' | 'minorPentatonic';

/** Whole (2) and half (1) steps from one scale note to the next, ending back on the tonic. */
export const SCALE_STEPS: Readonly<Record<ScaleType, readonly number[]>> = {
  major: [2, 2, 1, 2, 2, 2, 1],
  naturalMinor: [2, 1, 2, 2, 1, 2, 2],
  harmonicMinor: [2, 1, 2, 2, 1, 3, 1],
  melodicMinor: [2, 1, 2, 2, 2, 2, 1],
  majorPentatonic: [2, 2, 3, 2, 3],
  minorPentatonic: [3, 2, 2, 3, 2],
};

/** Which scale degree (1-7) each pentatonic note sits on, for letter spelling. */
const PENTATONIC_DEGREES: Readonly<Record<string, readonly number[]>> = {
  majorPentatonic: [1, 2, 3, 5, 6],
  minorPentatonic: [1, 3, 4, 5, 7],
};

export const SCALE_LABELS: Readonly<Record<ScaleType, string>> = {
  major: 'major',
  naturalMinor: 'natural minor',
  harmonicMinor: 'harmonic minor',
  melodicMinor: 'melodic minor',
  majorPentatonic: 'major pentatonic',
  minorPentatonic: 'minor pentatonic',
};

/** Half steps from the tonic to each scale note. */
export function scaleOffsets(type: ScaleType): number[] {
  const offsets = [0];
  const steps = SCALE_STEPS[type];
  for (let i = 0; i < steps.length - 1; i++) offsets.push(offsets[i]! + steps[i]!);
  return offsets;
}

/** Spell a scale from a spelled tonic, for example ("Eb", "major") → Eb F G Ab Bb C D. */
export function spellScale(tonic: SpelledNote, type: ScaleType): SpelledNote[] {
  const tonicPc = spelledPc(tonic);
  const start = letterIndex(tonic.letter);
  const offsets = scaleOffsets(type);
  const degrees = PENTATONIC_DEGREES[type] ?? offsets.map((_, i) => i + 1);
  return offsets.map((offset, i) => {
    const letter = LETTERS[(start + degrees[i]! - 1) % 7]!;
    return spellWithLetter(mod12(tonicPc + offset), letter);
  });
}

export type Mode = 'major' | 'minor';

export interface Key {
  tonic: SpelledNote;
  mode: Mode;
}

/** Parse "C", "Eb", "F#m", "Bbm" or "A minor" into a key. */
export function parseKey(text: string): Key | null {
  const t = text.trim();
  const minor = /(m|min|minor)$/i.test(t) && !/maj(or)?$/i.test(t);
  const tonicText = t.replace(/\s*(major|maj|minor|min|m)$/i, '');
  const parsed = parseNote(tonicText);
  if (!parsed) return null;
  return { tonic: parsed.note, mode: minor ? 'minor' : 'major' };
}

export function keyName(key: Key): string {
  return noteToString(key.tonic) + (key.mode === 'minor' ? 'm' : '');
}

export function keyLabel(key: Key): string {
  return `${noteToString(key.tonic)} ${key.mode}`;
}

export function keyTonicPc(key: Key): PitchClass {
  return spelledPc(key.tonic);
}

export function keyScale(key: Key): SpelledNote[] {
  return spellScale(key.tonic, key.mode === 'major' ? 'major' : 'naturalMinor');
}

/** Sharps (positive) or flats (negative) in the key signature. */
export function keySignature(key: Key): number {
  return keyScale(key).reduce((sum, n) => sum + n.accidental, 0);
}

/** The 12 major and 12 minor keys offered in the app, spelled the way musicians usually write them. */
export const COMMON_KEYS: readonly Key[] = [
  ...['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'].map((t) => ({
    tonic: parseNote(t)!.note,
    mode: 'major' as const,
  })),
  ...['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'].map((t) => ({
    tonic: parseNote(t)!.note,
    mode: 'minor' as const,
  })),
];

/**
 * Spell any pitch class in the context of a key. Scale notes use the key's own
 * spelling; other notes follow the key signature (flats in flat keys, sharps in
 * sharp keys). C major and A minor use the spellings bands use most:
 * C#, Eb, F#, Ab, Bb.
 */
export function spellInKey(pc: PitchClass, key: Key): SpelledNote {
  const scale = keyScale(key);
  const inScale = scale.find((n) => spelledPc(n) === mod12(pc));
  if (inScale) return inScale;
  const sig = keySignature(key);
  if (sig === 0) {
    const neutral: Record<number, SpelledNote> = {
      1: { letter: 'C', accidental: 1 },
      3: { letter: 'E', accidental: -1 },
      6: { letter: 'F', accidental: 1 },
      8: { letter: 'A', accidental: -1 },
      10: { letter: 'B', accidental: -1 },
    };
    return neutral[mod12(pc)] ?? spellWithLetter(pc, 'C');
  }
  // A white key outside the scale keeps its natural name (B natural in F major).
  const natural = LETTERS.find((l) => spellWithLetter(pc, l).accidental === 0);
  if (natural) return spellWithLetter(pc, natural);
  // A black key takes the accidental that matches the key's direction.
  const dir = sig > 0 ? 1 : -1;
  for (const letter of LETTERS) {
    const spelled = spellWithLetter(pc, letter);
    if (spelled.accidental === dir) return spelled;
  }
  return spellWithLetter(pc, 'C');
}

/** Letter steps from the lower note to the upper one, for each interval size (0-11 half steps). */
const INTERVAL_LETTER_STEPS: readonly (readonly number[])[] = [[0], [1], [1], [2], [2], [3], [3, 4], [4], [5], [5], [6], [6]];

/**
 * Spell two notes as an interval, so the letters match the interval's number:
 * a major 2nd on two black keys reads C# to D#, never C# to Eb. Starts from
 * how the key spells each note and changes as few names as it can.
 */
export function spellInterval(low: PitchClass, high: PitchClass, key: Key): [SpelledNote, SpelledNote] {
  const keyLow = spellInKey(low, key);
  const keyHigh = spellInKey(high, key);
  const lows = [keyLow, ...LETTERS.map((l) => spellWithLetter(low, l)).filter((n) => Math.abs(n.accidental) === 1 && n.letter !== keyLow.letter)];
  const same = (a: SpelledNote, b: SpelledNote) => a.letter === b.letter && a.accidental === b.accidental;
  let best: { pair: [SpelledNote, SpelledNote]; score: number } | null = null;
  for (const lo of lows) {
    for (const step of INTERVAL_LETTER_STEPS[mod12(high - low)]!) {
      const hi = spellWithLetter(high, LETTERS[(letterIndex(lo.letter) + step) % 7]!);
      if (Math.abs(hi.accidental) > 1) continue;
      // Fewer accidentals first, then the spelling closest to the key's own.
      const score = (Math.abs(lo.accidental) + Math.abs(hi.accidental)) * 10 - (same(lo, keyLow) ? 1 : 0) - (same(hi, keyHigh) ? 1 : 0);
      if (!best || score < best.score) best = { pair: [lo, hi], score };
    }
  }
  return best?.pair ?? [keyLow, keyHigh];
}

/** The key of C major, the default when no key is chosen. */
export const C_MAJOR: Key = { tonic: { letter: 'C', accidental: 0 }, mode: 'major' };
