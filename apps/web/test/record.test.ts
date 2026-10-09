import type { Take } from '@music/contracts';
import { parseMidi } from '@music/theory';
import { describe, expect, it } from 'vitest';
import { TakeRecorder, trimTake } from '../src/record/recorder.js';
import { analyseTake, correct, midiFileName, midiToTake, takeToMidi, uncorrect } from '../src/record/take.js';

/** Plays chords into a recorder: [names, startMs, lengthMs]. */
function played(chords: Array<[string, number, number]>, pedal: Array<[number, boolean]> = []): Take {
  const r = new TakeRecorder(0);
  const events: Array<[number, () => void]> = [];
  for (const [names, start, ms] of chords) {
    for (const n of names.split(' ')) {
      const midi = parseMidi(n)!;
      events.push([start, () => r.noteOn(midi, 90, start)], [start + ms, () => r.noteOff(midi, start + ms)]);
    }
  }
  for (const [at, down] of pedal) events.push([at, () => r.sustain(down, at)]);
  events.sort((a, b) => a[0] - b[0]).forEach(([, f]) => f());
  return r.stop(Math.max(...events.map(([t]) => t)) + 300);
}

/** The 1-5-6-4 in G, twice: a second per chord. */
const axis = () =>
  played(
    ['G2 B3 D4', 'D3 F#3 A3', 'E3 G3 B3', 'C3 E3 G3', 'G2 B3 D4', 'D3 F#3 A3', 'E3 G3 B3', 'C3 E3 G3'].map((c, i) => [c, 1000 + i * 1000, 950] as [string, number, number]),
  );

describe('TakeRecorder', () => {
  it('records notes from the first key, with velocity and the pedal', () => {
    const r = new TakeRecorder(1000);
    r.noteOn(60, 100, 1500);
    r.sustain(true, 1600);
    r.noteOn(64, 80, 1700);
    r.noteOff(60, 2000);
    r.noteOff(64, 2100);
    r.sustain(false, 2500);
    const t = r.stop(3000);
    // The first note came 500 ms in; 200 ms before it is kept.
    expect(t.notes).toEqual([
      { midi: 60, velocity: 100, startMs: 200, durationMs: 500 },
      { midi: 64, velocity: 80, startMs: 400, durationMs: 400 },
    ]);
    expect(t.pedal).toEqual([
      { atMs: 300, down: true },
      { atMs: 1200, down: false },
    ]);
    expect(t.durationMs).toBe(1700);
  });

  it('ends a note struck again before its note-off, and lets go of keys and the pedal at stop', () => {
    const r = new TakeRecorder(0);
    r.noteOn(60, 90, 200);
    r.noteOn(60, 70, 600);
    r.sustain(true, 700);
    const t = r.stop(1200);
    expect(t.notes.map((n) => [n.startMs, n.durationMs, n.velocity])).toEqual([
      [200, 400, 90],
      [600, 600, 70],
    ]);
    expect(t.pedal.at(-1)).toEqual({ atMs: 1200, down: false });
  });

  it('an empty take stays empty', () => {
    expect(new TakeRecorder(0).stop(5000)).toEqual({ notes: [], pedal: [], durationMs: 0 });
    expect(trimTake({ notes: [], pedal: [], durationMs: 10 })).toEqual({ notes: [], pedal: [], durationMs: 0 });
  });
});

describe('analysing a take', () => {
  it('names the key and the chords as names and numbers', () => {
    const a = analyseTake(axis(), 'Axis', null, []);
    expect(a.key.key).toMatchObject({ mode: 'major', tonic: { letter: 'G' } });
    const chords = a.segments.filter((s) => s.chord).map((s) => s.chord!);
    expect(chords.map((c) => c.symbol).slice(0, 4)).toEqual(['G', 'D', 'Em', 'C']);
    expect(chords.map((c) => c.number).slice(0, 4)).toEqual(['1', '5', '6m', '4']);
    expect(chords[0]!.sargam).toBe('Sa');
  });

  it('counts from the key the learner picked, and keeps their chord fixes', () => {
    const take = axis();
    const first = analyseTake(take, 'Axis', null, []);
    const d = first.segments.findIndex((s) => s.chord?.symbol === 'D');
    const fixes = correct([], first, d, { rootPc: 2, quality: '7' });
    const fixed = analyseTake(take, 'Axis', 'Em', fixes);
    expect(fixed.segments[d]!.chord!.symbol).toBe('D7');
    expect(fixed.segments[d]!.edited).toBe(true);
    // In E minor, G is the 3 chord.
    expect(fixed.segments.find((s) => s.chord?.symbol === 'G')!.chord!.number).toBe('3');
    // A second fix of the same chord replaces the first; undo goes back to the app's guess.
    expect(correct(fixes, first, d, { rootPc: null, quality: null })).toHaveLength(1);
    expect(analyseTake(take, 'Axis', null, uncorrect(fixes, first, d)).segments[d]!.chord!.symbol).toBe('D');
  });

  it('exports a MIDI file and imports it back, pedal included', () => {
    const take = played(
      [
        ['C3 E3 G3', 0, 400],
        ['F3 A3 C4', 1000, 400],
      ],
      [
        [50, true],
        [900, false],
      ],
    );
    const back = midiToTake(takeToMidi(take, 'Round trip'));
    expect(back.title).toBe('Round trip');
    expect(back.take.notes.map((n) => n.midi)).toEqual(take.notes.map((n) => n.midi));
    back.take.notes.forEach((n, i) => expect(Math.abs(n.startMs - take.notes[i]!.startMs)).toBeLessThanOrEqual(2));
    expect(back.take.pedal.map((p) => p.down)).toEqual([true, false]);
    expect(Math.abs(back.take.durationMs - take.durationMs)).toBeLessThanOrEqual(2);
  });

  it('explains a file that is not MIDI, and names files safely', () => {
    expect(() => midiToTake(new TextEncoder().encode('not a midi file at all'))).toThrow(/MIDI/);
    expect(midiFileName('Jam: 8/10')).toBe('Jam  8 10.mid');
    expect(midiFileName('  ')).toBe('Recording.mid');
  });
});
