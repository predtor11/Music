/**
 * What a piece is made of, worked out from its notes: the key, the chord in
 * each bar (or half bar when it changes), the melody, and which bars are hard
 * and why. Rule based, so the same file always gets the same answer. Pure, so
 * it is unit tested.
 */

import type { HandSide } from '@music/contracts';
import {
  chordPitchClasses,
  identifyChords,
  keyTonicPc,
  mod12,
  parseKey,
  romanNumeral,
  type ChordMatch,
  type ChordQuality,
  type Key,
} from '@music/theory';
import { barBeats, barCount, barOf, barStart, type Piece, type PieceNote } from './piece.js';

// Krumhansl-Kessler key profiles: how strongly each scale step belongs to a major or minor key.
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

/** The usual spelling of each key's home note: Eb major, but C# minor. */
const MAJOR_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const MINOR_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];

/**
 * How long each pitch class sounds. For chords (`harmony`), left-hand notes
 * count more: the left hand usually carries the harmony while the right hand's
 * tune passes through notes outside the chord.
 */
function pcWeights(notes: readonly PieceNote[], from = -Infinity, to = Infinity, harmony = false): number[] {
  const w = new Array<number>(12).fill(0);
  for (const n of notes) {
    const overlap = Math.min(n.start + n.dur, to) - Math.max(n.start, from);
    if (overlap > 0) w[mod12(n.midi)]! += overlap * (harmony && n.hand === 'left' ? 2 : 1);
  }
  return w;
}

function correlation(a: readonly number[], b: readonly number[]): number {
  const ma = a.reduce((s, x) => s + x, 0) / a.length;
  const mb = b.reduce((s, x) => s + x, 0) / b.length;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i]! - ma) * (b[i]! - mb);
    da += (a[i]! - ma) ** 2;
    db += (b[i]! - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

export interface KeyGuess {
  key: Key;
  /** 0-1: how clearly the notes point at this key. */
  confidence: number;
  /** The next most likely key, for when the first guess is close. */
  runnerUp: Key;
}

/** Guess the key from how long each note sounds (the Krumhansl-Schmuckler method). */
export function detectKey(notes: readonly PieceNote[]): KeyGuess {
  const w = pcWeights(notes);
  // Music tends to start and, above all, end on its home note in the bass.
  const bassAt = (pick: (a: PieceNote, b: PieceNote) => boolean) => {
    const edge = notes.reduce<PieceNote | null>((e, n) => (!e || pick(n, e) ? n : e), null);
    return edge ? mod12(Math.min(...notes.filter((n) => Math.abs(n.start - edge.start) < 1e-6).map((n) => n.midi))) : -1;
  };
  const firstBass = bassAt((n, e) => n.start < e.start);
  const lastBass = bassAt((n, e) => n.start > e.start);
  const bonus = (tonic: number) => (tonic === lastBass ? 0.1 : 0) + (tonic === firstBass ? 0.05 : 0);
  const scores: { key: Key; r: number }[] = [];
  for (let tonic = 0; tonic < 12; tonic++) {
    const rotated = w.map((_, i) => w[(i + tonic) % 12]!);
    scores.push({ key: parseKey(MAJOR_NAMES[tonic]!)!, r: correlation(rotated, MAJOR_PROFILE) + bonus(tonic) });
    scores.push({ key: parseKey(`${MINOR_NAMES[tonic]!}m`)!, r: correlation(rotated, MINOR_PROFILE) + bonus(tonic) });
  }
  scores.sort((a, b) => b.r - a.r);
  const best = scores[0]!;
  const gap = best.r - scores[1]!.r;
  return { key: best.key, runnerUp: scores[1]!.key, confidence: Math.max(0, Math.min(1, best.r * 0.6 + gap * 4)) };
}

/** Chord types the analysis picks between; rarer colours are left to the Chord Namer. */
const QUALITIES: ChordQuality[] = ['major', 'minor', '7', 'm7', 'maj7', 'dim', 'm7b5', 'dim7', 'sus4', 'aug'];
/** Small nudge toward plain triads, so a passing note doesn't make every chord a 7th. */
const QUALITY_COST: Partial<Record<ChordQuality, number>> = { '7': 0.08, m7: 0.06, maj7: 0.08, m7b5: 0.1, dim7: 0.1, dim: 0.06, sus4: 0.12, aug: 0.14 };

export interface ChordSpan {
  bar: number;
  start: number;
  end: number;
  chord: ChordMatch;
  roman: string;
  /** 0-1: how much of the sound the chord explains. */
  fit: number;
}

interface Fit {
  rootPc: number;
  quality: ChordQuality;
  score: number;
  fit: number;
}

function bestFit(w: readonly number[], bassPc: number | null, key: Key): Fit | null {
  const total = w.reduce((s, x) => s + x, 0);
  if (total === 0) return null;
  // Three different notes at least: two make an interval, not a chord.
  if (w.filter((x) => x > 0).length < 3) return null;
  const scale = new Set(diatonicPcs(key));
  let best: Fit | null = null;
  for (let root = 0; root < 12; root++) {
    for (const quality of QUALITIES) {
      const pcs = chordPitchClasses(root, quality);
      const inside = pcs.reduce((s, pc) => s + w[pc]!, 0);
      // A missing 5th is common (it adds little), so it costs less than a missing 3rd or 7th.
      const missing = pcs.filter((pc) => w[pc]! < total * 0.02).length;
      const fifthOnly = missing === 1 && w[mod12(root + 7)]! < total * 0.02 && pcs.includes(mod12(root + 7));
      let score = inside / total - (total - inside) / total - (fifthOnly ? 0.06 : 0.18 * missing) - (QUALITY_COST[quality] ?? 0);
      if (bassPc === root) score += 0.08;
      if (w[root]! < total * 0.02) score -= 0.3;
      if (pcs.every((pc) => scale.has(pc))) score += 0.03;
      if (!best || score > best.score) best = { rootPc: root, quality, score, fit: inside / total };
    }
  }
  return best;
}

/** The key's scale; minor keys also get the raised 7th, which their V chord uses. */
function diatonicPcs(key: Key): number[] {
  const steps = key.mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10, 11];
  return steps.map((s) => mod12(keyTonicPc(key) + s));
}

/** Name a fitted chord with the theory engine, so symbols match the rest of the app. */
function match(fit: Fit, bassMidi: number | null, key: Key): ChordMatch | null {
  const pcs = chordPitchClasses(fit.rootPc, fit.quality);
  const bassPc = bassMidi === null ? null : mod12(bassMidi);
  const bass = bassPc !== null && pcs.includes(bassPc) ? bassPc : fit.rootPc;
  const notes = [36 + bass, ...pcs.map((pc) => 48 + pc)];
  return identifyChords(notes, key).find((m) => m.rootPc === fit.rootPc && m.type.quality === fit.quality) ?? null;
}

function lowestAt(notes: readonly PieceNote[], from: number, to: number): number | null {
  // The bass is the lowest note struck near the start of the span, else the lowest sounding at all.
  const near = notes.filter((n) => n.start < from + (to - from) / 2 && n.start + n.dur > from);
  const pool = near.length ? near : notes.filter((n) => n.start < to && n.start + n.dur > from);
  return pool.length ? Math.min(...pool.map((n) => n.midi)) : null;
}

/** Below this share of the sound explained, a span gets no chord name. */
const MIN_FIT = 0.75;

function spanChord(piece: Piece, key: Key, bar: number, from: number, to: number): ChordSpan | null {
  const w = pcWeights(piece.notes, from, to, true);
  const bassMidi = lowestAt(piece.notes, from, to);
  const fit = bestFit(w, bassMidi === null ? null : mod12(bassMidi), key);
  // A tune on its own, with nothing under it, often isn't one chord: leave it unnamed rather than guess.
  if (!fit || fit.fit < MIN_FIT) return null;
  const chord = match(fit, bassMidi, key);
  if (!chord) return null;
  return { bar, start: from, end: to, chord, roman: romanNumeral(chord, key), fit: fit.fit };
}

/**
 * The chords bar by bar. A bar gets two chords when its halves fit two
 * different chords clearly better than one chord fits the whole bar.
 */
export function chordsByBar(piece: Piece, key: Key): ChordSpan[] {
  const spans: ChordSpan[] = [];
  const len = barBeats(piece);
  for (let bar = piece.pickup > 0 ? 0 : 1; bar <= barCount(piece); bar++) {
    const from = barStart(piece, bar);
    const to = bar === 0 ? piece.pickup : from + len;
    const whole = spanChord(piece, key, bar, from, to);
    if (bar > 0 && len >= 2) {
      const mid = from + len / 2;
      const a = spanChord(piece, key, bar, from, mid);
      const b = spanChord(piece, key, bar, mid, to);
      // Split only when the bass moves too: a tune passing over one chord isn't a chord change.
      const bassMoves = lowestAt(piece.notes, from, mid) !== lowestAt(piece.notes, mid, to);
      if (a && b && a.chord.symbol !== b.chord.symbol && (bassMoves || !whole) && Math.min(a.fit, b.fit) >= 0.9) {
        spans.push(a, b);
        continue;
      }
    }
    if (whole) spans.push(whole);
  }
  return spans;
}

/** The melody: the top note of the right hand at each moment a new note starts. */
export function melody(piece: Piece): PieceNote[] {
  const byStart = new Map<number, PieceNote>();
  for (const n of piece.notes) {
    if (n.hand !== 'right') continue;
    const top = byStart.get(n.start);
    if (!top || n.midi > top.midi) byStart.set(n.start, n);
  }
  return [...byStart.values()].sort((a, b) => a.start - b.start);
}

export interface BarStats {
  bar: number;
  /** New notes per second at full speed, per hand. */
  speed: Record<HandSide, number>;
  /** Biggest jump between one left-hand note or chord and the next, in half steps. */
  leftLeap: number;
  rightLeap: number;
  /** Why the bar is hard, in plain words; empty when it isn't. */
  reasons: string[];
  /** 0 easy, 1 tricky, 2 hard. */
  level: 0 | 1 | 2;
}

/** Note-on groups (chords count once) for one hand, in time order. */
function onsets(notes: readonly PieceNote[], hand: HandSide): { start: number; low: number; high: number }[] {
  const map = new Map<number, { start: number; low: number; high: number }>();
  for (const n of notes) {
    if (n.hand !== hand) continue;
    const g = map.get(n.start);
    if (g) {
      g.low = Math.min(g.low, n.midi);
      g.high = Math.max(g.high, n.midi);
    } else map.set(n.start, { start: n.start, low: n.midi, high: n.midi });
  }
  return [...map.values()].sort((a, b) => a.start - b.start);
}

/** A jump this big (more than an octave) needs the hand to move in the air. */
const LEAP = 12;
/** This many notes a second in one hand is fast for a beginner. */
const FAST = 6;

export function barStats(piece: Piece): BarStats[] {
  const secPerBeat = 60 / piece.bpm;
  const len = barBeats(piece);
  const stats: BarStats[] = [];
  const groups = { left: onsets(piece.notes, 'left'), right: onsets(piece.notes, 'right') };
  for (let bar = piece.pickup > 0 ? 0 : 1; bar <= barCount(piece); bar++) {
    const from = barStart(piece, bar);
    const to = bar === 0 ? piece.pickup : from + len;
    const seconds = (to - from) * secPerBeat;
    const s: BarStats = { bar, speed: { left: 0, right: 0 }, leftLeap: 0, rightLeap: 0, reasons: [], level: 0 };
    for (const hand of ['left', 'right'] as const) {
      const list = groups[hand];
      const inBar = list.filter((g) => g.start >= from - 1e-6 && g.start < to - 1e-6);
      s.speed[hand] = seconds > 0 ? inBar.length / seconds : 0;
      let leap = 0;
      for (const g of inBar) {
        const prev = list[list.indexOf(g) - 1];
        if (prev) leap = Math.max(leap, Math.abs(g.low - prev.low), Math.abs(g.high - prev.high));
      }
      if (hand === 'left') s.leftLeap = leap;
      else s.rightLeap = leap;
    }
    if (s.speed.left >= FAST) s.reasons.push('fast left hand');
    if (s.speed.right >= FAST) s.reasons.push('fast right hand');
    if (s.leftLeap > LEAP) s.reasons.push('left-hand jump');
    if (s.rightLeap > LEAP) s.reasons.push('right-hand jump');
    const score = s.reasons.length + (Math.max(s.speed.left, s.speed.right) >= FAST * 1.6 ? 1 : 0) + (Math.max(s.leftLeap, s.rightLeap) > LEAP * 1.5 ? 1 : 0);
    s.level = score >= 2 ? 2 : score === 1 ? 1 : 0;
    stats.push(s);
  }
  return stats;
}

export interface Analysis {
  key: KeyGuess;
  chords: ChordSpan[];
  melody: PieceNote[];
  bars: BarStats[];
  /** Lowest and highest note, to size the keyboard. */
  range: { low: number; high: number };
}

export function analyse(piece: Piece): Analysis {
  const key = detectKey(piece.notes);
  const midis = piece.notes.map((n) => n.midi);
  return {
    key,
    chords: chordsByBar(piece, key.key),
    melody: melody(piece),
    bars: barStats(piece),
    range: { low: Math.min(...midis), high: Math.max(...midis) },
  };
}

export { barOf };
