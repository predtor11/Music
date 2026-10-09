/**
 * Finding the key. Two kinds of evidence are combined:
 *  - which notes sound most (compared with the Krumhansl-Kessler key
 *    profiles, a standard from music psychology);
 *  - which chords are used (how much of the song sits on chords of the key,
 *    and whether it rests on the key's home chord).
 */

import { COMMON_KEYS, chordPitchClasses, diatonicTriadQualities, keyTonicPc, mod12, scaleOffsets, type Key } from '@music/theory';
import type { ChordValue, KeyGuess } from './types.js';

const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function pearson(a: readonly number[], b: readonly number[]): number {
  const n = a.length;
  const ma = a.reduce((s, x) => s + x, 0) / n;
  const mb = b.reduce((s, x) => s + x, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i]! - ma;
    const y = b[i]! - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

/** The app's spelling of the key with this tonic and mode (F# not Gb, Bb not A#). */
export function keyFor(tonicPc: number, mode: Key['mode']): Key {
  return COMMON_KEYS.find((k) => k.mode === mode && keyTonicPc(k) === mod12(tonicPc))!;
}

/** All 24 keys scored by how well the overall note profile fits, best first. */
export function profileScores(chroma: readonly number[]): Array<{ key: Key; score: number }> {
  const out: Array<{ key: Key; score: number }> = [];
  for (let tonic = 0; tonic < 12; tonic++) {
    const rotated = Array.from({ length: 12 }, (_, i) => chroma[mod12(i + tonic)]!);
    out.push({ key: keyFor(tonic, 'major'), score: pearson(rotated, MAJOR_PROFILE) });
    out.push({ key: keyFor(tonic, 'minor'), score: pearson(rotated, MINOR_PROFILE) });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** The pitch classes of a key's scale (natural minor for minor keys). */
export function keyScalePcs(key: Key): Set<number> {
  const tonic = keyTonicPc(key);
  return new Set(scaleOffsets(key.mode === 'major' ? 'major' : 'naturalMinor').map((o) => mod12(tonic + o)));
}

/** True when every note of the chord is in the key (minor keys also allow the raised 7th, for V and vii°). */
export function chordInKey(chord: Pick<ChordValue, 'rootPc' | 'quality'>, key: Key): boolean {
  const pcs = keyScalePcs(key);
  if (key.mode === 'minor') pcs.add(mod12(keyTonicPc(key) + 11));
  return chordPitchClasses(chord.rootPc, chord.quality).every((pc) => pcs.has(pc));
}

/** The key's home chord. */
export function tonicChord(key: Key): Pick<ChordValue, 'rootPc' | 'quality'> {
  return { rootPc: keyTonicPc(key), quality: diatonicTriadQualities(key.mode)[0]! };
}

interface TimedChord {
  chord: ChordValue | null;
  duration: number;
}

const isMinorish = (q: string) => q === 'minor' || q === 'm7' || q === 'm6' || q === 'm9' || q === 'madd9' || q === 'mMaj7';
const homeMatch = (c: ChordValue, key: Key) => c.rootPc === keyTonicPc(key) && isMinorish(c.quality) === (key.mode === 'minor');

/** How well a chord list fits a key, 0 to 1. */
export function chordFit(chords: readonly TimedChord[], key: Key): number {
  const real = chords.filter((c): c is { chord: ChordValue; duration: number } => !!c.chord);
  const total = real.reduce((s, c) => s + c.duration, 0);
  if (!total) return 0;
  const inKey = real.filter((c) => chordInKey(c.chord, key)).reduce((s, c) => s + c.duration, 0) / total;
  const home = real.filter((c) => homeMatch(c.chord, key)).reduce((s, c) => s + c.duration, 0) / total;
  const first = real[0]!.chord;
  const last = real[real.length - 1]!.chord;
  const ends = (homeMatch(first, key) ? 0.5 : 0) + (homeMatch(last, key) ? 1 : 0);
  return Math.min(1, 0.55 * inKey + 0.3 * Math.min(1, home * 3) + 0.1 * ends);
}

/**
 * Best keys for a note profile, optionally helped by the chords already found.
 * Confidence comes from how far the winner is ahead of the next key.
 */
export function detectKey(chroma: readonly number[], chords: readonly TimedChord[] = []): KeyGuess[] {
  const total = chroma.reduce((a, b) => a + b, 0);
  if (!total) return [{ key: keyFor(0, 'major'), confidence: 0 }];
  const scored = profileScores(chroma).map(({ key, score }) => ({
    key,
    score: chords.length ? 0.55 * score + 0.45 * chordFit(chords, key) : score,
  }));
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0]!.score;
  return scored.slice(0, 4).map(({ key, score }, i) => {
    const next = i === 0 ? scored[1]!.score : best;
    const margin = i === 0 ? score - next : score - best;
    const confidence = i === 0 ? clamp01(0.35 + 0.5 * Math.max(0, score) + 3 * margin) : clamp01(0.5 + 3 * margin) * 0.5;
    return { key, confidence };
  });
}

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
