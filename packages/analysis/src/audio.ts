/**
 * Listening to an audio file (MP3, WAV, M4A...): turn the sound into beat-long
 * frames of pitch-class energy (a "chromagram"), so the same key and chord
 * finder used for MIDI can run on it.
 *
 * Plain signal processing, no trained model and no network: a short FFT finds
 * the beat, a long FFT finds the pitches. Harmonics are folded back onto the
 * note that made them, and drums are damped by comparing each pitch with its
 * neighbours. It is much less sure than MIDI: vocals, distortion and
 * drums all add notes that aren't in the chord, so results are guesses.
 */

import { estimateTempo } from './tempo.js';
import { steadyGrid } from './smf.js';
import type { BeatGrid, Frame } from './types.js';

export interface AudioFrames {
  frames: Frame[];
  grid: BeatGrid;
  duration: number;
  /** 0 to 1: how clearly a steady beat was found. */
  tempoStrength: number;
  /** Tuning offset found, in semitones (0 = A440). */
  tuning: number;
}

/** Mix channels to one. */
export function mixDown(channels: readonly Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0]!;
  const n = Math.min(...channels.map((c) => c.length));
  const out = new Float32Array(n);
  for (const c of channels) for (let i = 0; i < n; i++) out[i]! += c[i]! / channels.length;
  return out;
}

/** Lower the sample rate by an integer factor, averaging (a crude low-pass). */
function decimate(x: Float32Array, factor: number): Float32Array {
  if (factor <= 1) return x;
  const out = new Float32Array(Math.floor(x.length / factor));
  for (let i = 0; i < out.length; i++) {
    let s = 0;
    for (let j = 0; j < factor; j++) s += x[i * factor + j]!;
    out[i] = s / factor;
  }
  return out;
}

class FFT {
  readonly cos: Float64Array;
  readonly sin: Float64Array;
  readonly window: Float64Array;
  readonly rev: Uint32Array;
  readonly re: Float64Array;
  readonly im: Float64Array;
  constructor(readonly size: number) {
    this.cos = new Float64Array(size / 2);
    this.sin = new Float64Array(size / 2);
    for (let i = 0; i < size / 2; i++) {
      this.cos[i] = Math.cos((2 * Math.PI * i) / size);
      this.sin[i] = -Math.sin((2 * Math.PI * i) / size);
    }
    this.window = new Float64Array(size);
    for (let i = 0; i < size; i++) this.window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size);
    this.rev = new Uint32Array(size);
    const bits = Math.log2(size);
    for (let i = 0; i < size; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.rev[i] = r;
    }
    this.re = new Float64Array(size);
    this.im = new Float64Array(size);
  }

  /** Magnitudes of the first size/2 bins of a windowed frame starting at `at`. */
  magnitudes(x: Float32Array, at: number, out: Float64Array): void {
    const { size, re, im, rev, window } = this;
    for (let i = 0; i < size; i++) {
      const v = x[at + i] ?? 0;
      re[rev[i]!] = v * window[i]!;
      im[rev[i]!] = 0;
    }
    for (let len = 2; len <= size; len <<= 1) {
      const half = len >> 1;
      const step = size / len;
      for (let i = 0; i < size; i += len) {
        for (let j = 0; j < half; j++) {
          const wr = this.cos[j * step]!;
          const wi = this.sin[j * step]!;
          const a = i + j;
          const b = a + half;
          const tr = re[b]! * wr - im[b]! * wi;
          const ti = re[b]! * wi + im[b]! * wr;
          re[b] = re[a]! - tr;
          im[b] = im[a]! - ti;
          re[a] = re[a]! + tr;
          im[a] = im[a]! + ti;
        }
      }
    }
    for (let k = 0; k < size / 2; k++) out[k] = Math.hypot(re[k]!, im[k]!);
  }
}

const LOW_MIDI = 28; // E1
const HIGH_MIDI = 96; // C7
const BASS_TOP = 54; // F#3

/**
 * Beat-long chroma frames for a mono signal.
 * `onProgress` gets 0 to 1 as the work goes, for a progress bar.
 */
export function audioFrames(signal: Float32Array, sampleRate: number, opts: { beatsPerBar?: number; onProgress?: (p: number) => void } = {}): AudioFrames {
  const factor = Math.max(1, Math.floor(sampleRate / 11025));
  const x = decimate(signal, factor);
  const sr = sampleRate / factor;
  const duration = signal.length / sampleRate;
  const beatsPerBar = opts.beatsPerBar ?? 4;

  // 1. Onset envelope from a short FFT (spectral flux), about 86 values a second.
  const small = new FFT(1024);
  const hopS = 128;
  const nS = Math.max(0, Math.floor((x.length - small.size) / hopS) + 1);
  const magS = new Float64Array(small.size / 2);
  let prev = new Float64Array(small.size / 2);
  const flux: number[] = [];
  const bassFlux: number[] = [];
  const bassBin = Math.ceil((200 * small.size) / sr);
  for (let f = 0; f < nS; f++) {
    small.magnitudes(x, f * hopS, magS);
    let s = 0;
    let b = 0;
    for (let k = 1; k < magS.length; k++) {
      const v = Math.log1p(100 * magS[k]!);
      const d = v - prev[k]!;
      if (d > 0) {
        s += d;
        if (k < bassBin) b += d;
      }
      magS[k] = v;
    }
    flux.push(s);
    bassFlux.push(b);
    prev = Float64Array.from(magS);
    if (f % 2000 === 0) opts.onProgress?.(0.4 * (f / Math.max(1, nS)));
  }
  const rateS = sr / hopS;
  const env = detrend(flux, Math.round(rateS * 0.5));
  const tempo = estimateTempo(env, rateS);
  const period = 60 / tempo.bpm;
  const offset = tempo.offset % period;
  const grid = steadyGrid(tempo.bpm, duration, beatsPerBar, offset);

  // Downbeat: the bar position with the strongest low-end hits (kick drum, bass notes).
  const scores = new Array<number>(beatsPerBar).fill(0);
  grid.beats.forEach((t, i) => {
    const k = Math.round(t * rateS);
    let v = 0;
    for (let j = k - 2; j <= k + 2; j++) v += bassFlux[j] ?? 0;
    scores[i % beatsPerBar]! += v;
  });
  grid.firstDownbeat = scores.indexOf(Math.max(...scores));

  // 2. Pitch spectrum from a long FFT, about 5 frames a second.
  const big = new FFT(4096);
  const hop = 2048;
  const nB = Math.max(0, Math.floor((x.length - big.size) / hop) + 1);
  const mag = new Float64Array(big.size / 2);
  const binHz = sr / big.size;
  const firstBin = Math.max(1, Math.floor(midiHz(LOW_MIDI - 0.5) / binHz));
  const lastBin = Math.min(big.size / 2 - 1, Math.ceil(midiHz(HIGH_MIDI + 0.5) / binHz));
  const binMidi = new Float64Array(big.size / 2);
  for (let k = firstBin; k <= lastBin; k++) binMidi[k] = 69 + 12 * Math.log2((k * binHz) / 440);

  // Tuning: where strong peaks sit between semitones, sampled over the song.
  const hist = new Float64Array(20);
  for (let f = 0; f < nB; f += 6) {
    big.magnitudes(x, f * hop, mag);
    for (let k = firstBin + 1; k < lastBin; k++) {
      const m = mag[k]!;
      if (m > mag[k - 1]! && m >= mag[k + 1]! && binMidi[k]! > 48) {
        // Parabolic peak position.
        const a = mag[k - 1]!;
        const c = mag[k + 1]!;
        const p = 0.5 * (a - c) / (a - 2 * m + c || 1);
        const midi = 69 + 12 * Math.log2(((k + p) * binHz) / 440);
        const dev = midi - Math.round(midi);
        hist[Math.min(19, Math.floor((dev + 0.5) * 20))]! += m;
      }
    }
  }
  let peakBin = 0;
  for (let i = 1; i < 20; i++) if (hist[i]! > hist[peakBin]!) peakBin = i;
  const tuning = hist[peakBin]! > 0 ? (peakBin + 0.5) / 20 - 0.5 : 0;

  const pitchCount = HIGH_MIDI - LOW_MIDI + 1;
  const raw: Array<{ t: number; chroma: number[]; bass: number[]; energy: number }> = [];
  const pitch = new Float64Array(pitchCount);
  for (let f = 0; f < nB; f++) {
    big.magnitudes(x, f * hop, mag);
    pitch.fill(0);
    let energy = 0;
    for (let k = firstBin; k <= lastBin; k++) {
      const m = mag[k]!;
      energy += m * m;
      const midi = binMidi[k]! - tuning;
      const p = Math.round(midi);
      const w = Math.max(0, 1 - 2 * Math.abs(midi - p));
      if (p >= LOW_MIDI && p <= HIGH_MIDI) pitch[p - LOW_MIDI]! += w * m;
    }
    // Log scale, then keep only what stands above its neighbourhood (drums and noise are broad).
    const logP = Array.from(pitch, (v) => Math.log1p(50 * v));
    const whitened = logP.map((v, i) => {
      let s = 0;
      let c = 0;
      for (let j = Math.max(0, i - 6); j <= Math.min(pitchCount - 1, i + 6); j++) {
        s += logP[j]!;
        c++;
      }
      return Math.max(0, v - s / c);
    });
    // Fold harmonics back: a note also lights up its octave, 12th and double octave.
    const salience = whitened.map((v, i) => v + 0.5 * (whitened[i + 12] ?? 0) + 0.33 * (whitened[i + 19] ?? 0) + 0.25 * (whitened[i + 24] ?? 0));
    const chroma = new Array<number>(12).fill(0);
    const bass = new Array<number>(12).fill(0);
    salience.forEach((v, i) => {
      const midi = i + LOW_MIDI;
      if (midi >= 43) chroma[midi % 12]! += whitened[i]!;
      if (midi <= BASS_TOP) bass[midi % 12]! += v;
    });
    raw.push({ t: (f * hop + big.size / 2) / sr, chroma, bass, energy: Math.sqrt(energy) });
    if (f % 200 === 0) opts.onProgress?.(0.45 + 0.5 * (f / Math.max(1, nB)));
  }

  // 3. Average into beats.
  const frames: Frame[] = [];
  let j = 0;
  for (let i = 0; i + 1 < grid.beats.length; i++) {
    const start = grid.beats[i]!;
    const end = grid.beats[i + 1]!;
    const chroma = new Array<number>(12).fill(0);
    const bass = new Array<number>(12).fill(0);
    let energy = 0;
    let count = 0;
    while (j < raw.length && raw[j]!.t < start) j++;
    for (let k = j; k < raw.length && raw[k]!.t < end; k++) {
      const r = raw[k]!;
      for (let p = 0; p < 12; p++) {
        chroma[p]! += r.chroma[p]!;
        bass[p]! += r.bass[p]!;
      }
      energy += r.energy;
      count++;
    }
    if (count === 0) {
      // A beat shorter than one frame: borrow the nearest frame.
      const near = raw[Math.min(raw.length - 1, j)];
      if (near) frames.push({ start, end, chroma: [...near.chroma], bass: [...near.bass], energy: near.energy });
      else frames.push({ start, end, chroma, bass, energy: 0 });
      continue;
    }
    frames.push({ start, end, chroma: chroma.map((v) => v / count), bass: bass.map((v) => v / count), energy: energy / count });
  }
  opts.onProgress?.(1);
  return { frames, grid, duration, tempoStrength: tempo.strength, tuning };
}

const midiHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

/** Subtract a moving average and keep the positive part. */
function detrend(v: readonly number[], radius: number): number[] {
  const out = new Array<number>(v.length);
  let sum = 0;
  let lo = 0;
  let hi = -1;
  for (let i = 0; i < v.length; i++) {
    while (hi < Math.min(v.length - 1, i + radius)) sum += v[++hi]!;
    while (lo < i - radius) sum -= v[lo++]!;
    out[i] = Math.max(0, v[i]! - sum / (hi - lo + 1));
  }
  return out;
}
