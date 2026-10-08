import { describe, expect, it } from 'vitest';
import { TakeRecorder, soundingNotes, trimTake } from '../src/index.js';

describe('TakeRecorder', () => {
  it('records notes relative to the start, with velocity and the pedal', () => {
    const r = new TakeRecorder(1000);
    r.noteOn(60, 100, 1500);
    r.sustain(true, 1600);
    r.noteOn(64, 80, 1700);
    r.noteOff(60, 2000);
    r.noteOff(64, 2100);
    r.sustain(false, 2500);
    const t = r.stop(3000);
    expect(t.notes).toEqual([
      { midi: 60, start: 200, dur: 500, velocity: 100 },
      { midi: 64, start: 400, dur: 400, velocity: 80 },
    ]);
    // Trimmed: the first note came 500 ms in, and 200 ms before it is kept.
    expect(t.pedal).toEqual([
      { at: 300, down: true },
      { at: 1200, down: false },
    ]);
    expect(t.durationMs).toBe(1700);
  });

  it('ends a note struck again before its note-off, and closes keys still down at stop', () => {
    const r = new TakeRecorder(0);
    r.noteOn(60, 90, 0);
    r.noteOn(60, 70, 400);
    r.sustain(true, 500);
    const t = r.stop(1000);
    expect(t.notes.map((n) => [n.start, n.dur, n.velocity])).toEqual([
      [0, 400, 90],
      [400, 600, 70],
    ]);
    expect(t.pedal.at(-1)).toEqual({ at: 1000, down: false });
  });

  it('snapshots without ending the take', () => {
    const r = new TakeRecorder(0);
    r.noteOn(60, 90, 100);
    expect(r.snapshot(600).notes).toEqual([{ midi: 60, start: 100, dur: 500, velocity: 90 }]);
    expect(r.noteCount).toBe(1);
    r.noteOff(60, 800);
    expect(r.stop(900).notes[0]!.dur).toBe(700);
  });

  it('an empty take stays empty', () => {
    expect(new TakeRecorder(0).stop(5000)).toEqual({ notes: [], pedal: [], durationMs: 0 });
    expect(trimTake({ notes: [], pedal: [], durationMs: 10 })).toEqual({ notes: [], pedal: [], durationMs: 0 });
  });
});

describe('soundingNotes', () => {
  it('keeps notes ringing while the pedal is down, until the same key is struck again', () => {
    const notes = soundingNotes({
      notes: [
        { midi: 60, start: 0, dur: 100, velocity: 90 },
        { midi: 64, start: 200, dur: 100, velocity: 90 },
        { midi: 60, start: 600, dur: 100, velocity: 90 },
        { midi: 67, start: 1200, dur: 100, velocity: 90 },
      ],
      pedal: [
        { at: 50, down: true },
        { at: 1000, down: false },
      ],
      durationMs: 1500,
    });
    expect(notes.map((n) => n.end)).toEqual([600, 1000, 1000, 1300]);
  });
});
