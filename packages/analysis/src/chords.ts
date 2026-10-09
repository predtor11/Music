/**
 * Naming the chords over time. Each beat is compared with every chord in the
 * vocabulary (how closely the notes match the chord's notes, and whether the
 * bass sits on its root). A Viterbi pass then picks the chord sequence with
 * the best total, paying a small cost for every change, so a passing note
 * doesn't flip the chord. Changes cost less on the first beat of a bar, where
 * songs usually change chord.
 */

import {
  chordPitchClasses,
  chordType,
  identifyChords,
  keyTonicPc,
  mod12,
  nashvilleNumber,
  pretty,
  romanNumeral,
  sargam,
  type ChordQuality,
  type Key,
} from '@music/theory';
import { chordInKey, clamp01 } from './key.js';
import type { BeatGrid, ChordLabel, ChordSegment, ChordValue, Frame } from './types.js';

/** Chord types the analyser can name. Audio uses the short list: it can't hear 6ths and sus chords reliably. */
export const VOCABULARY: Readonly<Record<'full' | 'basic', readonly ChordQuality[]>> = {
  full: ['major', 'minor', '7', 'm7', 'maj7', 'dim', 'aug', 'sus4', 'sus2', 'm7b5', 'dim7', '6', 'm6'],
  basic: ['major', 'minor', '7'],
};

/** Extra cost of naming a richer chord, so plain triads win ties. */
const COMPLEXITY: Partial<Record<ChordQuality, number>> = {
  '7': 0.03,
  m7: 0.03,
  maj7: 0.035,
  m7b5: 0.04,
  dim: 0.03,
  sus4: 0.05,
  sus2: 0.06,
  aug: 0.07,
  dim7: 0.06,
  '6': 0.06,
  m6: 0.07,
};

export interface ChordOptions {
  vocabulary?: 'full' | 'basic';
  /** Cost of changing chord, in units of match score. Higher = steadier. */
  changeCost?: number;
  /** A key to favour its chords slightly (helps audio). */
  key?: Key | null;
  /** How strongly the bass has to point at another chord tone before calling an inversion. */
  inversionRatio?: number;
}

interface State {
  rootPc: number;
  quality: ChordQuality;
  template: number[];
  tones: number[];
  penalty: number;
}

function states(vocabulary: readonly ChordQuality[]): State[] {
  const out: State[] = [];
  for (const quality of vocabulary) {
    for (let rootPc = 0; rootPc < 12; rootPc++) {
      const tones = chordPitchClasses(rootPc, quality);
      const template = new Array<number>(12).fill(0);
      for (const pc of tones) template[pc] = 1;
      const norm = Math.sqrt(tones.length);
      out.push({ rootPc, quality, tones, template: template.map((x) => x / norm), penalty: COMPLEXITY[quality] ?? 0 });
    }
  }
  return out;
}

const NO_CHORD = -1;

function unit(v: readonly number[]): number[] {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return n ? v.map((x) => x / n) : v.map(() => 0);
}

function share(v: readonly number[]): number[] {
  const n = v.reduce((s, x) => s + x, 0);
  return n ? v.map((x) => x / n) : v.map(() => 0);
}

/** Score of every state (and no-chord, last) for one frame. */
function emissions(frame: Frame, list: readonly State[], quiet: number, key: Key | null | undefined): number[] {
  const c = unit(frame.chroma);
  const b = share(frame.bass);
  const hasBass = frame.bass.some((x) => x > 0);
  const out = list.map((s) => {
    let cos = 0;
    for (let i = 0; i < 12; i++) cos += c[i]! * s.template[i]!;
    let bass = 0;
    if (hasBass) {
      bass = b[s.rootPc]!;
      for (const pc of s.tones) if (pc !== s.rootPc) bass += 0.35 * b[pc]!;
    }
    const prior = key && chordInKey(s, key) ? 0.04 : 0;
    return cos + 0.22 * bass - s.penalty + prior;
  });
  // Silence or near-silence is "no chord"; otherwise a weak match still beats it.
  out.push(frame.energy <= quiet ? 2 : 0.3);
  return out;
}

/** Cost multiplier for changing chord at this beat: cheaper on downbeats. */
function changeWeight(beatIndex: number, grid: BeatGrid): number {
  const pos = (((beatIndex - grid.firstDownbeat) % grid.beatsPerBar) + grid.beatsPerBar) % grid.beatsPerBar;
  if (pos === 0) return 0.6;
  if (grid.beatsPerBar % 2 === 0 && pos === grid.beatsPerBar / 2) return 0.85;
  return 1.25;
}

/** Find the chord segments for a list of frames. */
export function findChords(frames: readonly Frame[], grid: BeatGrid, key: Key, opts: ChordOptions = {}): ChordSegment[] {
  if (frames.length === 0) return [];
  const vocab = VOCABULARY[opts.vocabulary ?? 'full'];
  const list = states(vocab);
  const lambda = opts.changeCost ?? 0.28;
  const energies = frames.map((f) => f.energy).filter((e) => e > 0).sort((a, b) => a - b);
  const median = energies[Math.floor(energies.length / 2)] ?? 0;
  const quiet = median * 0.04;
  const E = frames.map((f) => emissions(f, list, quiet, opts.key));
  const S = list.length + 1;

  // Viterbi. Transitions are "stay" (free) or "change" (one cost to anywhere),
  // so each step needs only the best previous state, not all pairs.
  let score = E[0]!.slice();
  const back: Int16Array[] = [];
  for (let t = 1; t < frames.length; t++) {
    let bestPrev = 0;
    for (let s = 1; s < S; s++) if (score[s]! > score[bestPrev]!) bestPrev = s;
    const cost = lambda * changeWeight(t, grid);
    const next = new Array<number>(S);
    const ptr = new Int16Array(S);
    for (let s = 0; s < S; s++) {
      const stay = score[s]!;
      const move = score[bestPrev]! - cost;
      if (stay >= move) {
        next[s] = stay + E[t]![s]!;
        ptr[s] = s;
      } else {
        next[s] = move + E[t]![s]!;
        ptr[s] = bestPrev;
      }
    }
    back.push(ptr);
    score = next;
  }
  let s = 0;
  for (let i = 1; i < S; i++) if (score[i]! > score[s]!) s = i;
  const path = new Array<number>(frames.length);
  path[frames.length - 1] = s;
  for (let t = frames.length - 1; t > 0; t--) {
    s = back[t - 1]![s]!;
    path[t - 1] = s;
  }

  // Runs of the same state become segments.
  const segments: ChordSegment[] = [];
  let runStart = 0;
  for (let t = 1; t <= frames.length; t++) {
    if (t < frames.length && path[t] === path[runStart]) continue;
    const state = path[runStart]!;
    segments.push(makeSegment(frames.slice(runStart, t), E.slice(runStart, t), state === list.length ? NO_CHORD : state, list, key, opts));
    runStart = t;
  }
  return mergeNoChord(segments);
}

function makeSegment(frames: readonly Frame[], E: readonly number[][], state: number, list: readonly State[], key: Key, opts: ChordOptions): ChordSegment {
  const start = frames[0]!.start;
  const end = frames[frames.length - 1]!.end;
  if (state === NO_CHORD) return { start, end, chord: null, confidence: 1, alternatives: [] };

  const totals = list.map((_, i) => E.reduce((sum, row) => sum + row[i]!, 0) / E.length);
  const chosen = list[state]!;
  const order = totals.map((v, i) => [v, i] as const).sort((a, b) => b[0] - a[0]);
  const rival = order.find(([, i]) => i !== state)?.[0] ?? 0;
  const fit = totals[state]!;
  const margin = fit - rival;
  const confidence = clamp01(0.25 + 0.55 * clamp01((fit - 0.55) / 0.45) + 2.2 * margin);

  // Inversions: the bass leans on another chord tone.
  const bass = new Array<number>(12).fill(0);
  for (const f of frames) for (let i = 0; i < 12; i++) bass[i]! += f.bass[i]!;
  let bassPc = chosen.rootPc;
  const ratio = opts.inversionRatio ?? 1.3;
  for (const pc of chosen.tones) if (bass[pc]! > bass[bassPc]! * ratio) bassPc = pc;

  const value: ChordValue = { rootPc: chosen.rootPc, quality: chosen.quality, bassPc };
  const alternatives = order
    .filter(([, i]) => i !== state)
    .slice(0, 4)
    .map(([, i]) => labelChord({ rootPc: list[i]!.rootPc, quality: list[i]!.quality, bassPc: list[i]!.rootPc }, key));
  return { start, end, chord: labelChord(value, key), confidence, alternatives };
}

/** Very short no-chord gaps between two chords are just breaths: give them to the chord before. */
function mergeNoChord(segments: ChordSegment[]): ChordSegment[] {
  const out: ChordSegment[] = [];
  for (const seg of segments) {
    const prev = out[out.length - 1];
    if (prev && !seg.chord && prev.chord && seg.end - seg.start < 1.2) {
      prev.end = seg.end;
      continue;
    }
    if (prev && !prev.chord && !seg.chord) {
      prev.end = seg.end;
      continue;
    }
    out.push(seg);
  }
  return out;
}

/** Flats and sharps in numerals as ♭ and ♯ ("b7" → "♭7"); numerals have no other b or #. */
const prettyNumeral = (s: string) => s.replace(/b/g, '♭').replace(/#/g, '♯');

/** Every name of a chord in a key: symbol, Roman numeral, number, sargam. */
export function labelChord(value: ChordValue, key: Key): ChordLabel {
  const tones = chordPitchClasses(value.rootPc, value.quality);
  const bassPc = tones.includes(mod12(value.bassPc)) ? mod12(value.bassPc) : value.rootPc;
  const midi = [36 + bassPc, ...tones.map((pc) => 60 + pc)];
  const matches = identifyChords(midi, key);
  const match = matches.find((m) => m.rootPc === value.rootPc && m.type.quality === value.quality) ?? matches[0]!;
  const type = chordType(value.quality);
  const qualityName = value.quality === 'major' || value.quality === 'minor' ? value.quality : type.name;
  return {
    rootPc: value.rootPc,
    quality: value.quality,
    bassPc,
    symbol: pretty(match.symbol),
    roman: prettyNumeral(romanNumeral(match, key)),
    number: prettyNumeral(nashvilleNumber(match, key)),
    sargam: sargam(value.rootPc, keyTonicPc(key)).label,
    notes: match.notes.map(pretty),
    name: `${pretty(match.root)} ${qualityName}`,
    inKey: chordInKey(value, key),
  };
}

/** Relabel segments for another key (after the person corrects the key). */
export function relabel(segments: readonly ChordSegment[], key: Key): ChordSegment[] {
  return segments.map((s) => ({
    ...s,
    chord: s.chord && labelChord(s.chord, key),
    alternatives: s.alternatives.map((a) => labelChord(a, key)),
  }));
}
