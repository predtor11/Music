export interface PitchReading {
  frequency: number;
  /** Nearest equal-tempered note (A4 = 440 Hz). */
  midi: number;
  /** Signed distance from that note; negative is flat, positive is sharp. */
  cents: number;
  confidence: number;
  rms: number;
}

export interface PitchOptions {
  minFrequency?: number;
  maxFrequency?: number;
  minRms?: number;
  /** Maximum YIN normalized difference; lower values reject more noise. */
  threshold?: number;
}

export function frequencyToNote(frequency: number): { midi: number; cents: number } {
  if (!Number.isFinite(frequency) || frequency <= 0) throw new RangeError('Frequency must be positive and finite.');
  const note = 69 + 12 * Math.log2(frequency / 440);
  const midi = Math.round(note);
  return { midi, cents: (note - midi) * 100 };
}

/**
 * YIN difference function for one instrument playing one note at a time.
 * Works on raw PCM; never records or sends microphone audio. Returns null
 * for silence, noise, or notes outside the requested range.
 */
export function detectPitch(samples: Float32Array, sampleRate: number, options: PitchOptions = {}): PitchReading | null {
  const { minFrequency = 65, maxFrequency = 1400, minRms = 0.008, threshold = 0.15 } = options;
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 ||
      !Number.isFinite(minFrequency) || !Number.isFinite(maxFrequency) ||
      minFrequency <= 0 || maxFrequency <= minFrequency || maxFrequency >= sampleRate / 2 ||
      !Number.isFinite(minRms) || minRms < 0 || !Number.isFinite(threshold) || threshold <= 0 || threshold >= 1) {
    throw new RangeError('Invalid pitch detection range or threshold.');
  }
  const window = Math.floor(samples.length / 2);
  const minLag = Math.max(2, Math.floor(sampleRate / maxFrequency));
  const maxLag = Math.min(window - 1, Math.ceil(sampleRate / minFrequency));
  if (minLag >= maxLag) return null;

  let mean = 0;
  for (const s of samples) {
    if (!Number.isFinite(s)) return null;
    mean += s;
  }
  mean /= samples.length;
  let energy = 0;
  for (const s of samples) energy += (s - mean) ** 2;
  const rms = Math.sqrt(energy / samples.length);
  if (rms < minRms || rms === 0) return null;

  const difference = new Float64Array(maxLag + 1);
  let sum = 0;
  let candidate = -1;
  // Keep a fixed window at every lag so long periods don't get a lower
  // difference merely because fewer samples were compared.
  for (let lag = 1; lag <= maxLag; lag++) {
    let d = 0;
    for (let i = 0; i < window; i++) d += (samples[i]! - samples[i + lag]!) ** 2;
    sum += d;
    difference[lag] = sum === 0 ? 1 : d * lag / sum;
    // Look below minLag too: otherwise a note above maxFrequency can be
    // mistaken for its second period, an octave down inside the range.
    if (lag > 2 && difference[lag - 1]! < threshold && difference[lag]! >= difference[lag - 1]!) {
      candidate = lag - 1;
      break;
    }
  }
  if (candidate < 0) return null;
  const left = difference[candidate - 1]!;
  const center = difference[candidate]!;
  const right = difference[candidate + 1]!;
  const divisor = left - 2 * center + right;
  const period = candidate + (divisor === 0 ? 0 : (left - right) / (2 * divisor));
  const frequency = sampleRate / period;
  if (!Number.isFinite(frequency) || frequency < minFrequency || frequency > maxFrequency) return null;
  const note = frequencyToNote(frequency);
  if (note.midi < 0 || note.midi > 127) return null;
  return { frequency, ...note, confidence: Math.max(0, Math.min(1, 1 - center)), rms };
}
