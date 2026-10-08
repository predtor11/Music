/**
 * Finding the beat when nothing says where it is: a recording played without
 * a metronome, or an audio file. Works on an onset envelope (how much new
 * sound starts at each moment): the tempo is the lag at which the envelope
 * best repeats, favouring everyday tempos; the beats are then placed where
 * they line up with the most onsets.
 */

import { beatIndex, steadyGrid } from './smf.js';
import type { BeatGrid, NoteEvent } from './types.js';

export interface TempoGuess {
  bpm: number;
  /** Seconds of the first beat. */
  offset: number;
  /** 0 to 1: how strongly the envelope repeats at this tempo. */
  strength: number;
}

const MIN_BPM = 55;
const MAX_BPM = 190;

/**
 * Tempo and beat phase from an onset envelope sampled `rate` times a second.
 */
export function estimateTempo(envelope: readonly number[], rate: number): TempoGuess {
  const n = envelope.length;
  const mean = envelope.reduce((a, b) => a + b, 0) / Math.max(1, n);
  const env = envelope.map((x) => x - mean);
  const minLag = Math.max(1, Math.floor((60 / MAX_BPM) * rate));
  const maxLag = Math.min(n - 1, Math.ceil((60 / MIN_BPM) * rate));
  let energy = 0;
  for (const x of env) energy += x * x;
  if (!energy || maxLag <= minLag) return { bpm: 120, offset: 0, strength: 0 };

  const ac = (lag: number) => {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += env[i]! * env[i + lag]!;
    return s / energy;
  };
  let best = { lag: minLag, score: -Infinity, raw: 0 };
  for (let lag = minLag; lag <= maxLag; lag++) {
    const bpm = (60 * rate) / lag;
    // Prefer tempos near 110 bpm (log-normal weighting), and reward lags whose
    // double also repeats (a real beat repeats at 2 beats too).
    const prior = Math.exp(-0.5 * (Math.log2(bpm / 110) / 0.9) ** 2);
    const raw = ac(lag) + 0.5 * (2 * lag < n ? ac(2 * lag) : 0);
    const score = raw * prior;
    if (score > best.score) best = { lag, score, raw };
  }
  // Refine the lag between samples with a parabola through its neighbours.
  const l = best.lag;
  const a = ac(l - 1);
  const b = ac(l);
  const c = l + 1 <= maxLag ? ac(l + 1) : b;
  const denom = a - 2 * b + c;
  const lag = denom < 0 ? l + (0.5 * (a - c)) / denom : l;
  const period = lag / rate;

  // Phase: the offset whose beat train hits the most onset energy.
  const steps = Math.max(1, Math.round(lag));
  let phase = { offset: 0, score: -Infinity };
  for (let k = 0; k < steps; k++) {
    let s = 0;
    for (let t = k; t < n; t += lag) s += envelope[Math.round(t)] ?? 0;
    if (s > phase.score) phase = { offset: k / rate, score: s };
  }
  return { bpm: 60 / period, offset: phase.offset, strength: Math.max(0, Math.min(1, best.raw)) };
}

/** Onset envelope of notes at `rate` samples a second. */
export function noteEnvelope(notes: readonly NoteEvent[], duration: number, rate = 100): number[] {
  const env = new Array<number>(Math.ceil(duration * rate) + 1).fill(0);
  for (const n of notes) {
    const i = Math.round(n.start * rate);
    if (i < env.length) env[i]! += 0.3 + n.velocity;
    // A little spread, so near-together hits add up.
    if (i + 1 < env.length) env[i + 1]! += 0.15;
    if (i > 0) env[i - 1]! += 0.15;
  }
  return env;
}

/** A beat grid for notes played without a click. */
export function gridFromNotes(notes: readonly NoteEvent[], duration: number, bpm?: number, beatsPerBar = 4): { grid: BeatGrid; strength: number } {
  const rate = 100;
  const env = noteEnvelope(notes, duration, rate);
  const guess = estimateTempo(env, rate);
  const tempo = bpm ?? guess.bpm;
  const period = 60 / tempo;
  const first = notes.length ? Math.min(...notes.map((n) => n.start)) : 0;
  // With a known tempo, the beats start at the first note.
  const offset = (bpm ? first : guess.offset) % period;
  const grid = steadyGrid(tempo, duration, beatsPerBar, offset);
  // Bars start at the beat nearest the first note.
  grid.firstDownbeat = beatIndex(grid, first) % beatsPerBar;
  return { grid, strength: bpm ? 1 : guess.strength };
}
