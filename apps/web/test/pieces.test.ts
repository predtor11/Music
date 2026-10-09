import { describe, expect, it } from 'vitest';
import { keyName } from '@music/theory';
import { writeMidiFile } from '@music/analysis';
import { analyse } from '../src/pieces/analyse.js';
import { barCount, barOf, pieceFromMidiBytes, type Piece } from '../src/pieces/piece.js';
import { isClean, judgeTimed, judgeWait, nextTempo, steps, troubleBars } from '../src/pieces/loop.js';
import { STARTER_PIECES } from '../src/pieces/starter.js';

const piece = (id: string) => STARTER_PIECES.find((p) => p.id === id)!;

/** A tiny two-track MIDI file builder, for files the app's writer (one track) can't make. */
function varLen(n: number): number[] {
  const out = [n & 0x7f];
  while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80);
  return out;
}
function track(events: number[][]): number[] {
  const body = [...events.flat(), 0, 0xff, 0x2f, 0];
  return [0x4d, 0x54, 0x72, 0x6b, (body.length >> 24) & 255, (body.length >> 16) & 255, (body.length >> 8) & 255, body.length & 255, ...body];
}
function smf(ppq: number, tracks: number[][]): ArrayBuffer {
  return new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, tracks.length, ppq >> 8, ppq & 255, ...tracks.flat()]).buffer;
}

describe('MIDI files', () => {
  const twoTracks = smf(480, [
    track([
      [0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20], // 120 bpm
      [0, 0xff, 0x58, 4, 3, 2, 24, 8], // 3/4
    ]),
    // Right hand: C5 then E5, using running status and a note-on with velocity 0 as the release.
    track([[0, 0x90, 72, 90], [...varLen(480), 72, 0], [0, 76, 90], [...varLen(480), 0x80, 76, 0]]),
    // Left hand: a C3 held two beats.
    track([[0, 0x91, 48, 80], [...varLen(960), 0x81, 48, 0]]),
  ]);

  it('gives the higher track to the right hand, in beats', () => {
    const p = pieceFromMidiBytes(twoTracks, 'my_song.mid', 'x');
    expect(p.title).toBe('my song');
    expect(p.bpm).toBe(120);
    expect(p.timeSignature).toEqual([3, 4]);
    expect(p.notes.map((n) => [n.midi, n.hand, n.start, n.dur])).toEqual([
      [48, 'left', 0, 2],
      [72, 'right', 0, 1],
      [76, 'right', 1, 1],
    ]);
  });

  it('splits a one-track file at middle C', () => {
    const bytes = writeMidiFile([
      { midi: 48, start: 0, end: 0.5, velocity: 0.7 },
      { midi: 67, start: 0, end: 0.5, velocity: 0.7 },
    ]);
    const p = pieceFromMidiBytes(bytes.slice().buffer, 'one.mid', 'y');
    expect(p.notes.map((n) => n.hand)).toEqual(['left', 'right']);
  });

  it('rejects a file that is not MIDI', () => {
    expect(() => pieceFromMidiBytes(new TextEncoder().encode('hello world, not midi').buffer as ArrayBuffer, 'x.mid', 'y')).toThrow();
  });
});

describe('bars', () => {
  it('counts an upbeat as bar 0', () => {
    const p = piece('starter-fur-elise');
    expect(barOf(p, 0)).toBe(0);
    expect(barOf(p, 0.5)).toBe(1);
    expect(barOf(p, 2)).toBe(2);
    expect(barCount(p)).toBe(8);
  });
});

describe('analysis of the starter pieces', () => {
  it('finds each key', () => {
    expect(keyName(analyse(piece('starter-ode-to-joy')).key.key)).toBe('C');
    expect(keyName(analyse(piece('starter-fur-elise')).key.key)).toBe('Am');
    expect(keyName(analyse(piece('starter-prelude-c')).key.key)).toBe('C');
    expect(keyName(analyse(piece('starter-moonlight')).key.key)).toBe('C#m');
  });

  it('names the Prelude in C chord by chord', () => {
    const a = analyse(piece('starter-prelude-c'));
    expect(a.chords.map((c) => c.chord.symbol)).toEqual(['C', 'Dm7/C', 'G7/B', 'C', 'Am/C', 'D7/C', 'G/B', 'Cmaj7/B', 'Am7', 'D7', 'G']);
    expect(a.chords.map((c) => c.roman).slice(0, 4)).toEqual(['I', 'ii7/1', 'V7/7', 'I']);
  });

  it('hears the chords change in Ode to Joy', () => {
    const a = analyse(piece('starter-ode-to-joy'));
    expect(a.chords.map((c) => c.chord.symbol)).toEqual(['C', 'G', 'C', 'G', 'C', 'G', 'C', 'G', 'C']);
  });

  it('follows the Moonlight harmony, including the half-bar change in bar 3', () => {
    const a = analyse(piece('starter-moonlight'));
    const symbols = a.chords.map((c) => `${c.bar}:${c.chord.symbol}`);
    expect(symbols.slice(0, 4)).toEqual(['1:C#m', '2:C#m7/B', '3:A', '3:D/F#']);
    expect(a.chords.find((c) => c.bar === 4)!.chord.root).toBe('G#');
  });

  it('takes the melody from the top of the right hand', () => {
    const m = analyse(piece('starter-ode-to-joy')).melody;
    expect(m.slice(0, 4).map((n) => n.midi)).toEqual([64, 64, 65, 67]);
  });

  it('flags Moonlight left-hand octave jumps', () => {
    const bars = analyse(piece('starter-moonlight')).bars;
    expect(bars.find((b) => b.bar === 3)!.reasons).not.toContain('fast left hand');
  });
});

describe('practice', () => {
  const p: Piece = piece('starter-ode-to-joy');

  it('groups your notes into steps for the hand chosen', () => {
    const right = steps(p, { hands: 'right', fromBar: 1, toBar: 1 });
    expect(right.map((s) => s.notes.map((n) => n.midi))).toEqual([[64], [64], [65], [67]]);
    const left = steps(p, { hands: 'left', fromBar: 1, toBar: 2 });
    expect(left.map((s) => s.notes.length)).toEqual([3, 3]);
    const both = steps(p, { hands: 'both', fromBar: 1, toBar: 1 });
    expect(both[0]!.notes.map((n) => n.midi)).toEqual([48, 52, 55, 64]);
  });

  it('waits for every key of a chord', () => {
    const [first] = steps(p, { hands: 'left', fromBar: 1, toBar: 1 });
    expect(judgeWait(first!, new Set(), 48)).toBe('partial');
    expect(judgeWait(first!, new Set([48, 52]), 55)).toBe('done');
    expect(judgeWait(first!, new Set(), 50)).toBe('slip');
  });

  it('matches a timed press to the nearest note in the window', () => {
    const notes = steps(p, { hands: 'right', fromBar: 1, toBar: 1 }).flatMap((s) => s.notes);
    expect(judgeTimed(notes, new Set(), 64, 0.1, 60)).toBe(0);
    expect(judgeTimed(notes, new Set([0]), 64, 0.9, 60)).toBe(1);
    expect(judgeTimed(notes, new Set(), 64, 0.5, 60)).toBe(-1);
  });

  it('speeds up only after a clean loop', () => {
    const clean = { notes: 20, hit: 20, slips: 0, troubleByBar: new Map() };
    expect(isClean(clean)).toBe(true);
    expect(nextTempo(50, true)).toBe(55);
    expect(nextTempo(100, true)).toBe(100);
    expect(isClean({ ...clean, hit: 15 })).toBe(false);
    expect(nextTempo(50, false)).toBe(50);
  });

  it('lists the worst bars first', () => {
    expect(troubleBars(new Map([[2, 1], [5, 4], [3, 0], [7, 4]]))).toEqual([5, 7, 2]);
  });
});

describe('fitting a piece on your keyboard', () => {
  it('moves notes your keyboard lacks by octaves', async () => {
    const { foldIntoRange } = await import('../src/pieces/loop.js');
    const p = piece('starter-moonlight');
    const { piece: folded, moved } = foldIntoRange(p, 36, 96);
    expect(moved).toBeGreaterThan(0);
    expect(Math.min(...folded.notes.map((n) => n.midi))).toBeGreaterThanOrEqual(36);
    expect(foldIntoRange(p, 21, 108).piece).toBe(p);
  });
});
