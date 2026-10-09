import { parseMidi } from '@music/theory';
import { describe, expect, it } from 'vitest';
import { analyzeMidiFile, analyzeNotes, applyPedal, parseMidiFile, writeMidiFile, type Analysis, type NoteEvent, type PedalChange } from '../src/index.js';

/** Notes by name struck together: chord(0, 1000, 'G2 B3 D4'), times in ms. */
const chord = (startMs: number, ms: number, names: string, velocity = 0.7): NoteEvent[] =>
  names.split(' ').map((n) => ({ midi: parseMidi(n)!, start: startMs / 1000, end: (startMs + ms) / 1000, velocity }));

/** Notes one after another, `step` ms apart and `ms` long. */
const line = (startMs: number, step: number, ms: number, names: string): NoteEvent[] =>
  names.split(' ').map((n, i) => ({ midi: parseMidi(n)!, start: (startMs + i * step) / 1000, end: (startMs + i * step + ms) / 1000, velocity: 0.6 }));

/** Small, repeatable timing and loudness wobble, like a real player. */
function humanise(notes: NoteEvent[], seed = 7): NoteEvent[] {
  let x = seed;
  const rnd = () => (x = (x * 16807) % 2147483647) / 2147483647;
  return notes.map((n) => {
    const shift = (rnd() - 0.5) * 0.06;
    return { ...n, start: Math.max(0, n.start + shift), end: n.end + shift, velocity: 0.4 + rnd() * 0.5 };
  });
}

const symbols = (a: Analysis) => a.segments.filter((s) => s.chord).map((s) => s.chord!.symbol);

/** The opening of the Moonlight Sonata: bass octaves, triplets on top, the pedal changed with each chord. */
function moonlight(): { notes: NoteEvent[]; pedal: PedalChange[] } {
  const bars: Array<[string, string]> = [
    ['C#2 C#3', 'G#3 C#4 E4'],
    ['B1 B2', 'G#3 C#4 E4'],
    ['A1 A2', 'A3 C#4 E4'],
    ['F#1 F#2', 'A3 D4 F#4'],
    ['G#1 G#2', 'G#3 B#3 F#4'],
    ['C#2 C#3', 'G#3 C#4 E4'],
  ];
  const notes: NoteEvent[] = [];
  const pedal: PedalChange[] = [];
  for (const [i, [lh, rh]] of bars.entries()) {
    const t = i * 2400;
    notes.push(...chord(t, 2300, lh));
    for (let k = 0; k < 12; k++) notes.push(...line(t + k * 200, 200, 150, rh.split(' ')[k % 3]!));
    pedal.push({ time: (t + 30) / 1000, down: true }, { time: (t + 2380) / 1000, down: false });
  }
  return { notes: humanise(notes), pedal };
}

describe('the sustain pedal', () => {
  it('keeps notes ringing until the pedal lifts or the key is struck again', () => {
    const notes: NoteEvent[] = [
      { midi: 60, start: 0, end: 0.1, velocity: 0.7 },
      { midi: 64, start: 0.2, end: 0.3, velocity: 0.7 },
      { midi: 60, start: 0.6, end: 0.7, velocity: 0.7 },
      { midi: 67, start: 1.2, end: 1.3, velocity: 0.7 },
    ];
    const rang = applyPedal(notes, [
      { time: 0.05, down: true },
      { time: 1, down: false },
    ]);
    expect(rang.map((n) => n.end)).toEqual([0.6, 1, 1, 1.3]);
  });

  it('follows the Moonlight Sonata only when the pedal is heard', () => {
    const { notes, pedal } = moonlight();
    const a = analyzeNotes(notes, { pedal });
    expect(a.key.key).toMatchObject({ mode: 'minor', tonic: { letter: 'C', accidental: 1 } });
    expect(symbols(a)).toEqual(['C♯m', 'C♯m7/B', 'A', 'D/F♯', 'G♯7', 'C♯m']);
  });

  it('is written to and read from MIDI files, and the file analysis uses it', () => {
    const { notes, pedal } = moonlight();
    const file = parseMidiFile(writeMidiFile(notes, { pedal, duration: 14.4 }));
    expect(file.pedal).toHaveLength(pedal.length);
    expect(file.pedal[0]!.time).toBeCloseTo(pedal[0]!.time, 2);
    expect(file.duration).toBeCloseTo(14.4, 1);
    expect(symbols(analyzeMidiFile(writeMidiFile(notes, { pedal })))).toEqual(['C♯m', 'C♯m7/B', 'A', 'D/F♯', 'G♯7', 'C♯m']);
  });
});

describe('single notes', () => {
  it('names broken chords played without the pedal', () => {
    const notes = [...line(0, 300, 280, 'A2 E3 A3 C4 E3 A3'), ...line(1800, 300, 280, 'F2 C3 F3 A3 C3 F3'), ...line(3600, 300, 280, 'C3 G3 C4 E4 G3 C4')];
    expect(symbols(analyzeNotes(notes))).toEqual(['Am', 'F', 'C']);
  });

  it("doesn't name a tune played one note at a time as a chord", () => {
    const notes = [...chord(0, 1000, 'E3 G3 C4'), ...chord(1000, 1000, 'G2 B3 D4 F4'), ...line(3000, 400, 380, 'C5 D5 E5 G5 E5 D5 C5')];
    const a = analyzeNotes(notes);
    expect(symbols(a)).toEqual(['C/E', 'G7']);
    expect(a.segments.at(-1)!.chord).toBeNull();
  });
});
