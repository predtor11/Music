import { C_MAJOR, gradeRhythm, parseKey } from '@music/theory';
import { describe, expect, it } from 'vitest';
import { gradeReading, writtenName } from '../src/notation/read.js';
import { barsFor, rhythmTokens } from '../src/notation/rhythm.js';
import { clefFor, vexKey, vexKeySignature } from '../src/notation/spell.js';
import { offsetText, rhythmMarks } from '../src/rhythm/marks.js';

const key = (k: string) => parseKey(k)!;

describe('spelling notes for the staff', () => {
  it('writes white keys and middle C', () => {
    expect(vexKey(60)).toBe('c/4');
    expect(vexKey(62)).toBe('d/4');
    expect(vexKey(48)).toBe('c/3');
  });

  it('spells black keys the way the key does', () => {
    expect(vexKey(70, key('F'))).toBe('bb/4');
    expect(vexKey(70, key('E'))).toBe('a#/4');
    expect(vexKey(61)).toBe('c#/4');
    expect(vexKey(63)).toBe('eb/4');
  });

  it('keeps the octave with the letter (C♭, B♯)', () => {
    expect(vexKey(71, key('Gb'))).toBe('cb/5');
    expect(vexKey(60, key('C#'))).toBe('b#/3');
  });

  it('names key signatures for VexFlow and picks a clef', () => {
    expect(vexKeySignature(key('Bb'))).toBe('Bb');
    expect(vexKeySignature(key('F#m'))).toBe('F#m');
    expect(vexKeySignature(C_MAJOR)).toBe('C');
    expect(clefFor([48, 52])).toBe('bass');
    expect(clefFor([60, 64])).toBe('treble');
  });
});

describe('grading what was read', () => {
  it('passes the note on the staff', () => {
    expect(gradeReading([62], [62])).toEqual({ correct: true, message: "Yes, that's D4.", mistake: null });
  });

  it('explains a wrong note and a wrong octave', () => {
    expect(gradeReading([62], [64])).toMatchObject({ correct: false, mistake: 'wrong-note', message: 'You played E4. The staff shows D4, lower.' });
    expect(gradeReading([62], [74])).toMatchObject({ mistake: 'wrong-octave', message: 'Right note, wrong octave. The staff shows D4, one octave lower than you played.' });
  });

  it('grades chords note for note, in the key’s spelling', () => {
    const bb = key('Bb');
    expect(gradeReading([46, 50, 53], [53, 46, 50], bb).correct).toBe(true);
    expect(gradeReading([46, 50, 53], [58, 62, 65], bb).mistake).toBe('wrong-octave');
    expect(gradeReading([46, 50, 53], [46, 50], bb)).toMatchObject({ mistake: 'missing-notes', message: 'Missing F3.' });
    expect(gradeReading([46, 50, 53], [46, 50, 53, 55], bb)).toMatchObject({ mistake: 'extra-notes', message: "G3 isn't on the staff." });
    expect(writtenName(46, bb)).toBe('B♭2');
  });
});

describe('writing rhythms', () => {
  const ts = [4, 4] as const;

  it('fills the bar with notes and rests', () => {
    const t = rhythmTokens({ timeSignature: ts, onsets: [0, 1, 2, 2.5, 3] })!;
    expect(t.map((x) => [x.rest, x.duration, x.dots])).toEqual([
      [false, 'q', 0],
      [false, 'q', 0],
      [false, '8', 0],
      [false, '8', 0],
      [false, 'q', 0],
    ]);
    expect(t.map((x) => x.onset)).toEqual([0, 1, 2, 3, 4]);
  });

  it('adds rests for gaps and dots for dotted notes', () => {
    const t = rhythmTokens({ timeSignature: ts, onsets: [1, 2], durations: [1, 1.5] })!;
    expect(t.map((x) => (x.rest ? `r${x.duration}` : x.duration + '.'.repeat(x.dots)))).toEqual(['rq', 'q', 'q.', 'r8']);
  });

  it('splits and ties a note across the bar line', () => {
    const t = rhythmTokens({ timeSignature: ts, onsets: [0, 3], durations: [3, 2] })!;
    expect(t.map((x) => [x.bar, x.duration, x.dots, x.tie])).toEqual([
      [0, 'h', 1, false],
      [0, 'q', 0, true],
      [1, 'q', 0, false],
      [1, 'h', 1, false],
    ]);
    expect(barsFor({ timeSignature: ts, onsets: [0, 3], durations: [3, 2] })).toBe(2);
  });

  it('counts eighth-note beats in 6/8', () => {
    const t = rhythmTokens({ timeSignature: [6, 8], onsets: [0, 3] , durations: [3, 3] })!;
    expect(t.map((x) => [x.duration, x.dots])).toEqual([
      ['q', 1],
      ['q', 1],
    ]);
  });

  it('gives up on lengths shorter than a sixteenth', () => {
    expect(rhythmTokens({ timeSignature: ts, onsets: [0, 0.1] })).toBeNull();
  });
});

describe('rhythm timeline marks', () => {
  it('places taps and says how early or late they were', () => {
    // 120 bpm: 500 ms a beat, beat 0 at 1000 ms.
    const taps = [1000, 1530, 2000 + 250 + 200];
    const g = gradeRhythm([0, 1, 2], taps, 120, 1000, 120);
    const { taps: marks, targets } = rhythmMarks(g, taps, 1000, 500);
    expect(targets.map((t) => t.hit)).toEqual([true, true, false]);
    expect(marks.map((m) => [m.good, m.offsetMs, m.onset])).toEqual([
      [true, 0, 0],
      [true, 30, 1],
      [false, 450, 2],
    ]);
    expect(offsetText(30)).toBe('30 ms late');
    expect(offsetText(-45)).toBe('45 ms early');
    expect(offsetText(5)).toBe('On time');
  });
});
