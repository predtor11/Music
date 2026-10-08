/**
 * Naming the chords in a take, over time.
 *
 * 1. Split the take where a new chord could start: a few keys struck together,
 *    a new lowest note (the bass moving), or the first note after silence.
 * 2. For each part, add up how long each pitch class sounded and compare that
 *    with every chord shape on every root. Chord tones count for a chord,
 *    other notes count against it, a missing chord tone costs, the root in
 *    the bass and chords that belong to the key earn a little.
 * 3. Tidy up: very short parts join a neighbour (passing notes and grace
 *    notes), runs of single notes are joined so broken chords (arpeggios)
 *    get named, and neighbours with the same chord become one.
 *
 * The naming itself is the theory engine's (identifyChords, romanNumeral,
 * nashvilleNumber), so chords read the same here as in the Chord Namer.
 */

import type { ChordCorrection, Take } from '@music/contracts';
import {
  CHORD_TYPES,
  C_MAJOR,
  chordPitchClasses,
  chordType,
  identifyChords,
  keyScale,
  keyName,
  nashvilleNumber,
  noteToString,
  parseKey,
  pitchClass,
  romanNumeral,
  spelledPc,
  spellInKey,
  type ChordQuality,
  type Key,
  type PitchClass,
} from '@music/theory';
import { detectKey, pitchClassWeights, type KeyResult } from './key.js';
import { soundingNotes, type SoundingNote } from './sounding.js';

/** Chord shapes the analysis tries, most common first (ties go to the earlier one). */
export const ANALYSED_QUALITIES: readonly ChordQuality[] = ['major', 'minor', '7', 'm7', 'maj7', 'sus4', 'sus2', 'dim', 'aug', 'm7b5', 'dim7', '6', 'm6', 'add9'];

/** Notes starting this close together count as struck together (a rolled chord). */
const TOGETHER_MS = 50;
/** Silence longer than this always ends a chord. */
const GAP_MS = 800;
/** A part shorter than this joins a neighbour. */
const SHORT_MS = 300;
/** How far around a note to look when deciding it is a new bass note in a broken chord. */
const LOCAL_MS = 1000;
/** Below this score the notes don't make a chord (just melody). */
const MIN_SCORE = 0.35;

export type ChordConfidence = 'high' | 'medium' | 'low';

export interface NamedChord {
  rootPc: PitchClass;
  quality: ChordQuality;
  bassPc: PitchClass;
  /** "G", "Em7", "C/E" */
  symbol: string;
  /** "G major", "E minor 7th" */
  name: string;
  /** "V", "vi7", "I/3" */
  roman: string;
  /** "5", "6m7", "1/3" */
  nashville: string;
  /** Every chord tone is in the key's scale. */
  inKey: boolean;
  /** Chord tones, root first. */
  tones: PitchClass[];
}

export interface ChordSpan {
  start: number;
  end: number;
  /** Null when the notes here don't make a chord (just melody, or a single note). */
  chord: NamedChord | null;
  confidence: ChordConfidence;
  /** True when the learner set this chord by hand. */
  corrected: boolean;
  /** Pitch classes heard here, loudest and longest first. */
  heard: PitchClass[];
}

export interface Analysis {
  /** The key everything is named in: the learner's pick, else the detected one. */
  key: Key;
  /** What the app heard; null for an empty take. */
  detected: KeyResult | null;
  keyFromUser: boolean;
  spans: ChordSpan[];
  durationMs: number;
}

/** A chord name in a key, from its root, shape and lowest note. */
export function nameChord(rootPc: PitchClass, quality: ChordQuality, bassPc: PitchClass, key: Key): NamedChord {
  const tones = chordPitchClasses(rootPc, quality);
  const bassInChord = tones.includes(bassPc);
  const voicing = bassInChord ? [36 + bassPc, ...tones.map((pc) => 48 + pc)] : [48 + rootPc, ...tones.map((pc) => 60 + pc)];
  const match = identifyChords(voicing, key).find((m) => m.rootPc === rootPc && m.type.quality === quality);
  if (!match) throw new Error(`No match for ${rootPc} ${quality}`);
  const scale = new Set(keyScale(key).map(spelledPc));
  const slash = bassInChord ? '' : `/${noteToString(spellInKey(bassPc, key))}`;
  return {
    rootPc,
    quality,
    bassPc,
    symbol: match.symbol + slash,
    name: `${match.root} ${match.type.name}`,
    roman: romanNumeral(match, key),
    nashville: nashvilleNumber(match, key),
    inKey: tones.every((pc) => scale.has(pc)),
    tones,
  };
}

interface Evaluation {
  chord: NamedChord | null;
  score: number;
  heard: PitchClass[];
}

const velocityFactor = (v: number) => 0.6 + (0.4 * v) / 127;

/** A 7th, 6th or 9th needs at least this share of the sound to be named. */
const EXTENSION_SHARE = 0.1;

/** Shapes a line of single notes can spell out; a tune often walks through a sus2 or add9 shape by step. */
const BROKEN_CHORD_QUALITIES: ReadonlySet<ChordQuality> = new Set(['major', 'minor', '7', 'm7', 'maj7', 'dim']);

/** True when no two notes in the window overlap by much: a line played one note at a time. */
function monophonic(notes: readonly SoundingNote[], a: number, b: number): boolean {
  const inside = notes.filter((n) => n.end > a && n.start < b).sort((x, y) => x.start - y.start);
  for (let i = 1; i < inside.length; i++) {
    for (let j = 0; j < i; j++) if (Math.min(inside[j]!.end, inside[i]!.end, b) - Math.max(inside[i]!.start, a) > 50) return false;
  }
  return true;
}

function evaluate(notes: readonly SoundingNote[], a: number, b: number, key: Key): Evaluation {
  const w = new Array<number>(12).fill(0);
  const len = b - a;
  let bass: SoundingNote | null = null;
  let bassFallback: SoundingNote | null = null;
  for (const n of notes) {
    const overlap = Math.min(n.end, b) - Math.max(n.start, a);
    if (overlap <= 0) continue;
    w[pitchClass(n.midi)]! += overlap * velocityFactor(n.velocity);
    if (!bassFallback || n.midi < bassFallback.midi) bassFallback = n;
    if (overlap >= Math.min(150, len * 0.4) && (!bass || n.midi < bass.midi)) bass = n;
  }
  const total = w.reduce((s, v) => s + v, 0);
  const heard = w
    .map((v, pc) => ({ pc, v }))
    .filter((x) => x.v > 0)
    .sort((x, y) => y.v - x.v)
    .map((x) => x.pc);
  const bassNote = bass ?? bassFallback;
  if (total === 0 || !bassNote) return { chord: null, score: 0, heard };
  const share = w.map((v) => v / total);
  if (share.filter((s) => s >= 0.06).length < 2) return { chord: null, score: 0, heard };

  const bassPc = pitchClass(bassNote.midi);
  const scale = new Set(keyScale(key).map(spelledPc));
  const single = monophonic(notes, a, b);
  let best: { rootPc: number; quality: ChordQuality; score: number } | null = null;
  for (const quality of ANALYSED_QUALITIES) {
    for (let rootPc = 0; rootPc < 12; rootPc++) {
      const tones = chordPitchClasses(rootPc, quality);
      // A 7th, 6th or 9th has to be part of the harmony, not a passing melody note.
      if (tones.slice(3).some((pc) => share[pc]! < EXTENSION_SHARE)) continue;
      const inside = tones.reduce((s, pc) => s + share[pc]!, 0);
      const missing = tones.filter((pc) => share[pc]! < 0.03).length;
      // One note at a time only makes a chord when it spells one out (a broken chord).
      if (single && (!BROKEN_CHORD_QUALITIES.has(quality) || 1 - inside > 0.12 || missing > 0)) continue;
      let score = inside - (1 - inside) - 0.15 * missing - 0.04 * (tones.length - 3);
      if (share[rootPc]! < 0.03) score -= 0.1;
      score += bassPc === rootPc ? 0.12 : tones.includes(bassPc) ? 0.02 : -0.08;
      if (tones.every((pc) => scale.has(pc))) score += 0.05;
      if (!best || score > best.score + 1e-9) best = { rootPc, quality, score };
    }
  }
  if (!best || best.score < MIN_SCORE) return { chord: null, score: best?.score ?? 0, heard };
  return { chord: nameChord(best.rootPc, best.quality, bassPc, key), score: best.score, heard };
}

function confidenceOf(score: number): ChordConfidence {
  return score >= 0.8 ? 'high' : score >= 0.55 ? 'medium' : 'low';
}

interface Part {
  start: number;
  end: number;
}

/** Stretches where something is sounding, split at silences longer than GAP_MS. */
function activity(notes: readonly SoundingNote[]): Part[] {
  const sorted = [...notes].sort((x, y) => x.start - y.start);
  const out: Part[] = [];
  for (const n of sorted) {
    const last = out[out.length - 1];
    if (last && n.start - last.end <= GAP_MS) last.end = Math.max(last.end, n.end);
    else out.push({ start: n.start, end: n.end });
  }
  return out;
}

/** Times where a new chord could begin, inside one stretch of playing. */
function boundaries(notes: readonly SoundingNote[], part: Part): number[] {
  const inPart = notes.filter((n) => n.start >= part.start && n.start < part.end).sort((x, y) => x.start - y.start);
  const cuts: number[] = [];
  let i = 0;
  while (i < inPart.length) {
    const t = inPart[i]!.start;
    const cluster: SoundingNote[] = [];
    while (i < inPart.length && inPart[i]!.start - t <= TOGETHER_MS) cluster.push(inPart[i++]!);
    const before = notes.filter((n) => n.start < t && n.end > t + 20 && !cluster.includes(n));
    const pcs = new Set(cluster.map((n) => pitchClass(n.midi)));
    const low = Math.min(...cluster.map((n) => n.midi));
    if (before.length === 0 || pcs.size >= 2 || low < Math.min(...before.map((n) => n.midi))) cuts.push(t);
  }
  if (cuts[0] !== part.start) cuts.unshift(part.start);
  return cuts;
}

interface Working extends Part {
  ev: Evaluation;
}

/** The lowest note starting in a stretch, for splitting runs of single notes at the bass. */
function startsIn(notes: readonly SoundingNote[], a: number, b: number): SoundingNote[] {
  return notes.filter((n) => n.start >= a && n.start < b).sort((x, y) => x.start - y.start);
}

function sameChord(x: NamedChord | null, y: NamedChord | null): boolean {
  if (!x || !y) return x === y;
  return x.symbol === y.symbol;
}

function chordsInPart(notes: readonly SoundingNote[], part: Part, key: Key): Working[] {
  const cuts = boundaries(notes, part);
  let spans: Working[] = cuts.map((start, i) => {
    const end = cuts[i + 1] ?? part.end;
    return { start, end, ev: evaluate(notes, start, end, key) };
  });
  const rebuild = (s: Part): Working => ({ ...s, ev: evaluate(notes, s.start, s.end, key) });

  // Runs with no chord (single notes) are joined, then split again where the
  // line drops well below the run's middle: that is usually a broken chord
  // starting again from a new bass note.
  const joined: Array<Working & { run?: boolean }> = [];
  for (const s of spans) {
    const last = joined[joined.length - 1];
    if (last?.run && !s.ev.chord) last.end = s.end;
    else joined.push(s.ev.chord ? s : { ...s, run: true });
  }
  spans = [];
  for (const s of joined) {
    if (!s.run) {
      spans.push(s);
      continue;
    }
    const line = startsIn(notes, s.start, s.end);
    let from = s.start;
    for (let k = 1; k < line.length; k++) {
      const n = line[k]!;
      const near = (lo: number, hi: number) => line.filter((m) => m !== n && m.start >= lo && m.start < hi).map((m) => m.midi);
      const before = near(n.start - LOCAL_MS, n.start);
      const after = near(n.start + 1, n.start + LOCAL_MS);
      const localLow = before.length > 0 && n.midi <= Math.min(...before) && n.midi <= Math.min(...after, 128);
      if (localLow && n.start - from >= SHORT_MS) {
        spans.push(rebuild({ start: from, end: n.start }));
        from = n.start;
      }
    }
    spans.push(rebuild({ start: from, end: s.end }));
  }

  // Short parts join the neighbour they fit best.
  let changed = true;
  while (changed && spans.length > 1) {
    changed = false;
    for (let k = 0; k < spans.length; k++) {
      const s = spans[k]!;
      if (s.end - s.start >= SHORT_MS) continue;
      const prev = spans[k - 1];
      const next = spans[k + 1];
      const withPrev = prev ? rebuild({ start: prev.start, end: s.end }) : null;
      const withNext = next ? rebuild({ start: s.start, end: next.end }) : null;
      const pick =
        withPrev && withNext ? (withPrev.ev.score >= withNext.ev.score ? 'prev' : 'next') : withPrev ? 'prev' : 'next';
      if (pick === 'prev') spans.splice(k - 1, 2, withPrev!);
      else spans.splice(k, 2, withNext!);
      changed = true;
      break;
    }
  }

  // A part with only two different notes joins a neighbour when together
  // they still make that neighbour's chord (half of a broken chord).
  changed = true;
  while (changed && spans.length > 1) {
    changed = false;
    for (let k = 0; k < spans.length; k++) {
      const s = spans[k]!;
      if (s.ev.heard.length >= 3) continue;
      for (const [i, j] of [
        [k - 1, k],
        [k, k + 1],
      ] as const) {
        const x = spans[i];
        const y = spans[j];
        if (!x || !y) continue;
        const other = i === k ? y : x;
        if (!other.ev.chord) continue;
        const both = rebuild({ start: x.start, end: y.end });
        if (sameChord(both.ev.chord, other.ev.chord)) {
          spans.splice(i, 2, both);
          changed = true;
          break;
        }
      }
      if (changed) break;
    }
  }

  // Neighbours with the same chord become one.
  const merged: Working[] = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && sameChord(last.ev.chord, s.ev.chord)) {
      const both = rebuild({ start: last.start, end: s.end });
      merged[merged.length - 1] = sameChord(both.ev.chord, s.ev.chord) ? both : { ...last, end: s.end };
    } else merged.push(s);
  }
  return merged;
}

function findChords(notes: readonly SoundingNote[], key: Key): ChordSpan[] {
  return activity(notes).flatMap((part) =>
    chordsInPart(notes, part, key).map((s) => ({
      start: s.start,
      end: s.end,
      chord: s.ev.chord,
      confidence: s.ev.chord ? confidenceOf(s.ev.score) : 'medium',
      corrected: false,
      heard: s.ev.heard,
    })),
  );
}

/** Apply the learner's fixes: each one replaces the chord of the span it falls in. */
export function applyCorrections(spans: readonly ChordSpan[], corrections: readonly ChordCorrection[], key: Key): ChordSpan[] {
  return spans.map((span) => {
    const fix = [...corrections].reverse().find((c) => c.at >= span.start && c.at < span.end);
    if (!fix) return span;
    const bass = span.chord?.bassPc ?? span.heard[0] ?? fix.rootPc ?? 0;
    const chord =
      fix.rootPc === null || fix.quality === null
        ? null
        : nameChord(fix.rootPc, fix.quality, chordPitchClasses(fix.rootPc, fix.quality).includes(bass) ? bass : fix.rootPc, key);
    return { ...span, chord, confidence: 'high', corrected: true };
  });
}

export interface AnalyseOptions {
  /** A key the learner picked ("G", "Em"); overrides the detected one. */
  keyOverride?: string | null;
  corrections?: readonly ChordCorrection[];
}

/** Key and chords of a take. */
export function analyseTake(take: Take, options: AnalyseOptions = {}): Analysis {
  const notes = soundingNotes(take);
  const weights = pitchClassWeights(notes);
  const picked = options.keyOverride ? parseKey(options.keyOverride) : null;

  // First guess the key from the notes, name chords in it, then let the first
  // and last chords settle major against relative minor.
  const firstGuess = detectKey(weights);
  let key = picked ?? firstGuess?.best.key ?? C_MAJOR;
  let spans = findChords(notes, key);
  const withChords = spans.filter((s) => s.chord);
  const hint = (s: ChordSpan | undefined) => (s?.chord ? { rootPc: s.chord.rootPc, minor: chordType(s.chord.quality).minorThird } : undefined);
  const detected = detectKey(weights, { firstChord: hint(withChords[0]), lastChord: hint(withChords[withChords.length - 1]) });
  if (!picked && detected && keyName(detected.best.key) !== keyName(key)) {
    key = detected.best.key;
    spans = findChords(notes, key);
  }

  spans = applyCorrections(spans, options.corrections ?? [], key);
  return { key, detected, keyFromUser: !!picked, spans, durationMs: take.durationMs };
}

/** Every chord shape a correction can pick, for the editor. */
export const CORRECTION_QUALITIES = CHORD_TYPES.map((t) => ({ quality: t.quality, name: t.name, suffix: t.suffix }));
