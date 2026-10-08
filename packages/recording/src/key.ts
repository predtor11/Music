/**
 * Which key a take is in, from the notes alone.
 *
 * Every note adds its length to its pitch class (C, C#, D ...), and the
 * totals are compared with how often each scale degree is heard in music in
 * each of the 24 keys (the Krumhansl-Kessler profiles, from listening tests).
 * The closest match is the key. A major key and its relative minor share
 * their notes, so the chords decide between them: whichever tonic the music
 * starts and ends on wins a small bonus.
 */

import { COMMON_KEYS, keyLabel, keyTonicPc, pitchClass, type Key, type PitchClass } from '@music/theory';
import type { SoundingNote } from './sounding.js';

const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

/** A very long note shouldn't outweigh everything else; count at most this much of each. */
const MAX_NOTE_WEIGHT_MS = 2000;

export type KeyConfidence = 'clear' | 'likely' | 'unsure';

export interface KeyGuess {
  key: Key;
  /** "G major" */
  label: string;
  /** Correlation with the key's profile, -1 to 1, plus the chord bonus. */
  score: number;
}

export interface KeyResult {
  best: KeyGuess;
  /** The next closest keys, best first (for "or maybe E minor"). */
  others: KeyGuess[];
  confidence: KeyConfidence;
}

/** How much of each pitch class sounded, in milliseconds. */
export function pitchClassWeights(notes: readonly SoundingNote[]): number[] {
  const w = new Array<number>(12).fill(0);
  for (const n of notes) w[pitchClass(n.midi)]! += Math.min(MAX_NOTE_WEIGHT_MS, n.end - n.start);
  return w;
}

function correlation(a: readonly number[], b: readonly number[]): number {
  const mean = (x: readonly number[]) => x.reduce((s, v) => s + v, 0) / x.length;
  const ma = mean(a);
  const mb = mean(b);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i]! - ma) * (b[i]! - mb);
    da += (a[i]! - ma) ** 2;
    db += (b[i]! - mb) ** 2;
  }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
}

export interface KeyHints {
  /** Root and minor-ness of the first and last chords, when the take has chords. */
  firstChord?: { rootPc: PitchClass; minor: boolean };
  lastChord?: { rootPc: PitchClass; minor: boolean };
}

/** The most likely keys for a set of pitch-class weights. Null when nothing was played. */
export function detectKey(weights: readonly number[], hints: KeyHints = {}): KeyResult | null {
  if (weights.every((w) => w === 0)) return null;
  const guesses = COMMON_KEYS.map((key) => {
    const tonic = keyTonicPc(key);
    const profile = key.mode === 'major' ? MAJOR_PROFILE : MINOR_PROFILE;
    const rotated = weights.map((_, pc) => weights[(pc + tonic) % 12]!);
    let score = correlation(rotated, profile);
    const minor = key.mode === 'minor';
    if (hints.lastChord && hints.lastChord.rootPc === tonic && hints.lastChord.minor === minor) score += 0.08;
    if (hints.firstChord && hints.firstChord.rootPc === tonic && hints.firstChord.minor === minor) score += 0.04;
    return { key, label: keyLabel(key), score };
  }).sort((a, b) => b.score - a.score);
  const [best, ...others] = guesses;
  const gap = best!.score - others[0]!.score;
  const confidence: KeyConfidence = gap > 0.1 ? 'clear' : gap > 0.04 ? 'likely' : 'unsure';
  return { best: best!, others: others.slice(0, 3), confidence };
}
