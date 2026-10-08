import { describe, expect, it } from 'vitest';
import { MidiFileError, decodeMidiFile, encodeMidiFile } from '../src/index.js';
import { chord, take } from './helpers.js';

describe('MIDI files', () => {
  it('round-trips a take, pedal included, to within a millisecond', () => {
    const t = take([...chord(0, 900, 'C3 E3 G3'), ...chord(1000, 450, 'F3 A3 C4', 64), { midi: 72, start: 1234, dur: 321, velocity: 127 }], [
      { at: 10, down: true },
      { at: 980, down: false },
    ]);
    const bytes = encodeMidiFile(t, 'My song');
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('MThd');
    const back = decodeMidiFile(bytes);
    expect(back.title).toBe('My song');
    expect(back.take.notes).toHaveLength(t.notes.length);
    back.take.notes.forEach((n, i) => {
      const o = t.notes[i]!;
      expect(n.midi).toBe(o.midi);
      expect(n.velocity).toBe(o.velocity);
      expect(Math.abs(n.start - o.start)).toBeLessThanOrEqual(1);
      expect(Math.abs(n.dur - o.dur)).toBeLessThanOrEqual(2);
    });
    expect(back.take.pedal.map((p) => p.down)).toEqual([true, false]);
    expect(Math.abs(back.take.durationMs - t.durationMs)).toBeLessThanOrEqual(2);
  });

  it('reads format 1 with a tempo change, running status, note-on velocity 0 and drums', () => {
    // 96 ticks per beat. Track 1: tempo 120 BPM, then 60 BPM from tick 96.
    const vl = (n: number) => (n < 128 ? [n] : [0x80 | (n >> 7), n & 0x7f]);
    const track = (body: number[]) => [0x4d, 0x54, 0x72, 0x6b, 0, 0, (body.length >> 8) & 0xff, body.length & 0xff, ...body];
    const tempo = track([0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20, ...vl(96), 0xff, 0x51, 3, 0x0f, 0x42, 0x40, 0, 0xff, 0x2f, 0]);
    const notes = track([
      0, 0x90, 60, 100, // C4 on at 0
      ...vl(96), 60, 0, // running status, velocity 0 = off at tick 96 (500 ms)
      0, 64, 90, // E4 on at tick 96
      ...vl(96), 0x80, 64, 0, // off at tick 192 (500 + 1000 ms)
      0, 0x99, 36, 100, // a kick drum on channel 10
      ...vl(10), 0x89, 36, 0,
      0, 0xff, 0x2f, 0,
    ]);
    const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, 2, 0, 96];
    const r = decodeMidiFile(new Uint8Array([...header, ...tempo, ...notes]));
    expect(r.take.notes).toEqual([
      { midi: 60, start: 0, dur: 500, velocity: 100 },
      { midi: 64, start: 500, dur: 1000, velocity: 90 },
    ]);
    expect(r.skippedDrumNotes).toBe(1);
  });

  it('explains files it cannot read', () => {
    expect(() => decodeMidiFile(new TextEncoder().encode('hello, not a midi file'))).toThrow(MidiFileError);
    expect(() => decodeMidiFile(new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96, 0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, 9, 0, 0x90, 60]))).toThrow(
      /ends in the middle/,
    );
  });
});
