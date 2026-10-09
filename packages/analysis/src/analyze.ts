/**
 * The front door: analyse notes (a recording), a MIDI file, or audio, and get
 * the key, the chords over time and a plain-English summary.
 */

import { keyTonicPc, type Key } from '@music/theory';
import { audioFrames } from './audio.js';
import { findChords, relabel, type ChordOptions } from './chords.js';
import { framesFromNotes } from './frames.js';
import { detectKey } from './key.js';
import { beatIndex, parseMidiFile } from './smf.js';
import { summarize } from './summary.js';
import { gridFromNotes } from './tempo.js';
import type { Analysis, BeatGrid, ChordSegment, ChordValue, Frame, KeyGuess, NoteEvent, SourceKind } from './types.js';

export interface AnalyzeOptions {
  title?: string;
  /** Count the numbers from this key instead of the detected one. */
  key?: Key | null;
  /** Tempo the player chose, for recordings with a metronome. */
  bpm?: number;
  beatsPerBar?: number;
}

const sumChroma = (frames: readonly Frame[]) => {
  const out = new Array<number>(12).fill(0);
  for (const f of frames) for (let i = 0; i < 12; i++) out[i]! += f.chroma[i]!;
  return out;
};

const timed = (segments: readonly ChordSegment[]) => segments.map((s) => ({ chord: s.chord as ChordValue | null, duration: s.end - s.start }));

const weightedConfidence = (segments: readonly ChordSegment[]) => {
  const real = segments.filter((s) => s.chord);
  const total = real.reduce((a, s) => a + (s.end - s.start), 0);
  return total ? real.reduce((a, s) => a + s.confidence * (s.end - s.start), 0) / total : 0;
};

/** The key and chords for frames: guess the key, find chords, then guess the key again with the chords' help. */
function run(frames: readonly Frame[], grid: BeatGrid, opts: AnalyzeOptions, chordOpts: ChordOptions, keyPrior: boolean, alignBars: boolean): { guesses: KeyGuess[]; key: Key; segments: ChordSegment[] } {
  const chroma = sumChroma(frames);
  const first = detectKey(chroma)[0]!.key;
  const chordKey = { ...chordOpts, key: keyPrior ? opts.key ?? first : null };
  let draft = findChords(frames, grid, first, chordKey);
  if (alignBars) {
    // Without a file saying where bars start, put the downbeat where chords change most.
    const phase = barPhase(draft, grid);
    if (phase !== grid.firstDownbeat) {
      grid.firstDownbeat = phase;
      draft = findChords(frames, grid, first, chordKey);
    }
  }
  const guesses = detectKey(chroma, timed(draft));
  const key = opts.key ?? guesses[0]!.key;
  const segments = keyTonicPc(key) === keyTonicPc(first) && key.mode === first.mode ? draft : relabel(draft, key);
  return { guesses, key, segments };
}

/** The bar position (0 to beatsPerBar-1) where most chord changes land. */
function barPhase(segments: readonly ChordSegment[], grid: BeatGrid): number {
  const counts = new Array<number>(grid.beatsPerBar).fill(0);
  for (const s of segments.slice(1)) {
    if (!s.chord) continue;
    const i = beatIndex(grid, s.start);
    counts[((i % grid.beatsPerBar) + grid.beatsPerBar) % grid.beatsPerBar]! += 1;
  }
  const best = Math.max(...counts);
  // Keep the current phase on a tie.
  return counts[grid.firstDownbeat] === best ? grid.firstDownbeat : counts.indexOf(best);
}

/** Analyse notes: something played on the keyboard, or the notes of a file. */
export function analyzeNotes(notes: readonly NoteEvent[], opts: AnalyzeOptions & { grid?: BeatGrid; source?: SourceKind; duration?: number } = {}): Analysis {
  const duration = opts.duration ?? notes.reduce((m, n) => Math.max(m, n.end), 0);
  const tempo = opts.grid ? { grid: opts.grid, strength: 1 } : gridFromNotes(notes, duration, opts.bpm, opts.beatsPerBar);
  const grid = tempo.grid;
  const frames = framesFromNotes(notes, grid);
  const { guesses, key, segments } = run(frames, grid, opts, { vocabulary: 'full', changeCost: 0.3 }, false, !opts.grid);
  const source = opts.source ?? 'recording';
  const steadyBeat = tempo.strength >= 0.2;
  return {
    source,
    title: opts.title ?? '',
    duration,
    grid,
    key: guesses[0]!,
    keyAlternatives: guesses.slice(1),
    segments,
    summary: summarize({ key, guess: guesses[0]!, alternatives: guesses.slice(1), segments, grid, source, steadyBeat }),
    steadyBeat,
    notes: [...notes],
    confidence: weightedConfidence(segments),
  };
}

/** Analyse a MIDI file's bytes. Throws MidiFileError when it isn't one. */
export function analyzeMidiFile(bytes: ArrayBuffer | Uint8Array, opts: AnalyzeOptions = {}): Analysis {
  const file = parseMidiFile(bytes);
  const title = opts.title ?? file.trackNames.find((n) => n) ?? '';
  return analyzeNotes(file.notes, { ...opts, title, grid: file.grid, source: 'midi', duration: file.duration });
}

/** Analyse decoded audio (one or more channels of samples). */
export function analyzeAudio(channels: readonly Float32Array[] | Float32Array, sampleRate: number, opts: AnalyzeOptions & { onProgress?: (p: number) => void } = {}): Analysis {
  const list = channels instanceof Float32Array ? [channels] : channels;
  const mono = list.length === 1 ? list[0]! : mix(list);
  const audio = audioFrames(mono, sampleRate, { beatsPerBar: opts.beatsPerBar, onProgress: opts.onProgress });
  const { guesses, key, segments } = run(audio.frames, audio.grid, opts, { vocabulary: 'basic', changeCost: 0.45, inversionRatio: 2.2 }, true, true);
  // Audio is never as certain as notes: scale confidences down.
  const scaled = segments.map((s) => ({ ...s, confidence: s.chord ? s.confidence * 0.7 : s.confidence }));
  const keyGuesses = guesses.map((g) => ({ ...g, confidence: g.confidence * 0.8 }));
  const steadyBeat = audio.tempoStrength >= 0.15;
  return {
    source: 'audio',
    title: opts.title ?? '',
    duration: audio.duration,
    grid: audio.grid,
    key: keyGuesses[0]!,
    keyAlternatives: keyGuesses.slice(1),
    segments: scaled,
    summary: summarize({ key, guess: keyGuesses[0]!, alternatives: keyGuesses.slice(1), segments: scaled, grid: audio.grid, source: 'audio', steadyBeat }),
    steadyBeat,
    notes: [],
    confidence: weightedConfidence(scaled) * (0.6 + 0.4 * audio.tempoStrength),
  };
}

function mix(channels: readonly Float32Array[]): Float32Array {
  const n = Math.min(...channels.map((c) => c.length));
  const out = new Float32Array(n);
  for (const c of channels) for (let i = 0; i < n; i++) out[i]! += c[i]! / channels.length;
  return out;
}

/**
 * Change the key the numbers count from (after the person corrects it), and
 * rewrite the summary to match. Hand-made chord fixes are kept.
 */
export function withKey(analysis: Analysis, key: Key): Analysis {
  const segments = relabel(analysis.segments, key);
  return { ...analysis, segments, summary: resummarize(analysis, segments, key) };
}

/** Replace one segment's chord (a hand correction) and rewrite the summary. */
export function withChord(analysis: Analysis, index: number, chord: ChordValue | null, key: Key): Analysis {
  const segments = analysis.segments.map((s, i) => {
    if (i !== index) return s;
    const alternatives = s.chord && chord && (s.chord.rootPc !== chord.rootPc || s.chord.quality !== chord.quality) ? [s.chord, ...s.alternatives] : s.alternatives;
    return { ...s, chord: chord as ChordSegment['chord'], alternatives, confidence: 1, edited: true };
  });
  const relabelled = relabel(segments, key);
  return { ...analysis, segments: relabelled, summary: resummarize(analysis, relabelled, key) };
}

function resummarize(analysis: Analysis, segments: readonly ChordSegment[], key: Key) {
  return summarize({
    key,
    guess: analysis.key,
    alternatives: analysis.keyAlternatives,
    segments,
    grid: analysis.grid,
    source: analysis.source,
    steadyBeat: analysis.steadyBeat,
  });
}
