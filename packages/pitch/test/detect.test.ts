import { describe, expect, it } from 'vitest';
import { detectPitch, frequencyToNote } from '../src/index.js';

function wave(frequency: number, rate = 48000, harmonic = false) {
  return Float32Array.from({ length: 4096 }, (_, i) => {
    const phase = 2 * Math.PI * frequency * i / rate;
    return harmonic ? 0.12 * Math.sin(phase) + 0.35 * Math.sin(2 * phase) + 0.1 * Math.sin(3 * phase) : 0.4 * Math.sin(phase);
  });
}

describe('monophonic pitch detection', () => {
  it.each([40, 45, 50, 55, 59, 64, 76])('hears guitar MIDI note %i at both browser sample rates', (midi) => {
    for (const rate of [44100, 48000]) {
      const frequency = 440 * 2 ** ((midi - 69) / 12);
      const pitch = detectPitch(wave(frequency, rate), rate)!;
      expect(pitch.midi).toBe(midi);
      expect(Math.abs(pitch.cents)).toBeLessThan(2);
      expect(pitch.confidence).toBeGreaterThan(0.95);
    }
  });

  it('finds the fundamental even when a guitar harmonic is louder', () => {
    const pitch = detectPitch(wave(110, 48000, true), 48000)!;
    expect(pitch.midi).toBe(45);
    expect(Math.abs(pitch.cents)).toBeLessThan(2);
  });

  it('reports sharp and flat notes relative to the nearest semitone', () => {
    for (const cents of [-35, 25]) {
      const pitch = detectPitch(wave(440 * 2 ** (cents / 1200)), 48000)!;
      expect(pitch.midi).toBe(69);
      expect(pitch.cents).toBeCloseTo(cents, 0);
    }
  });

  it('rejects silence, DC offset, weak sound and nonperiodic noise', () => {
    expect(detectPitch(new Float32Array(4096), 48000)).toBeNull();
    expect(detectPitch(new Float32Array(4096).fill(0.2), 48000)).toBeNull();
    expect(detectPitch(wave(220).map((x) => x * 0.001), 48000)).toBeNull();
    let seed = 123;
    const noise = Float32Array.from({ length: 4096 }, () => {
      seed = (1664525 * seed + 1013904223) >>> 0;
      return seed / 2 ** 32 - 0.5;
    });
    expect(detectPitch(noise, 48000)).toBeNull();
  });

  it('handles offsets and rejects notes outside the configured range', () => {
    expect(detectPitch(wave(110).map((x) => x + 0.3), 48000)?.midi).toBe(45);
    expect(detectPitch(wave(55), 48000)).toBeNull();
    expect(detectPitch(wave(2000), 48000)).toBeNull();
  });

  it('rejects malformed PCM and insufficient windows', () => {
    expect(detectPitch(Float32Array.of(NaN, 1), 48000)).toBeNull();
    const samples = wave(440); samples[100] = Infinity;
    expect(detectPitch(samples, 48000)).toBeNull();
    expect(detectPitch(new Float32Array(8), 48000)).toBeNull();
    expect(() => detectPitch(wave(440), 0)).toThrow(RangeError);
    expect(() => detectPitch(wave(440), 48000, { minFrequency: 200, maxFrequency: 100 })).toThrow(RangeError);
  });

  it('converts frequencies without hiding invalid values', () => {
    expect(frequencyToNote(440)).toEqual({ midi: 69, cents: 0 });
    expect(frequencyToNote(220)).toEqual({ midi: 57, cents: 0 });
    expect(() => frequencyToNote(NaN)).toThrow(RangeError);
    expect(() => frequencyToNote(0)).toThrow(RangeError);
  });
});
