import type { TestItem } from '@music/contracts';
import { describe, expect, it } from 'vitest';
import { clipEvents } from '../src/audio/events.js';
import { earClip, earView, isByEar } from '../src/lesson/byEar.js';
import { freshState, gradeChord, pressNote, type ItemState } from '../src/lesson/grade.js';

const play = (item: TestItem, ...notes: number[]): ItemState => notes.reduce((s, n) => pressNote(item, s, n), freshState());

const note: TestItem = { kind: 'find-note', id: 'n', prompt: 'Find the note you hear.', midi: 64, byEar: true };
const anyD: TestItem = { kind: 'find-note', id: 'd', prompt: 'Find it.', pc: 2, byEar: true };
const interval: TestItem = { kind: 'play-interval', id: 'i', prompt: 'Start on C4 and play the second note you hear.', startMidi: 60, semitones: 4, byEar: true };
const freeInterval: TestItem = { kind: 'play-interval', id: 'fi', prompt: 'Play the same jump from any note.', startMidi: null, semitones: 7, byEar: true };
const scale: TestItem = { kind: 'play-scale', id: 's', prompt: 'Play back the notes.', sequence: [0, 2, 4], direction: 'up', byEar: true };
const chord: TestItem = { kind: 'build-chord', id: 'c', prompt: 'Play the chord you hear.', pitchClasses: [0, 4, 7], bassPc: 0, byEar: true };

describe('earClip', () => {
  it('plays the answer for each kind', () => {
    expect(earClip(note)).toEqual({ kind: 'note', notes: [64] });
    expect(earClip(anyD)).toEqual({ kind: 'note', notes: [62] });
    expect(earClip(interval)).toEqual({ kind: 'sequence', notes: [60, 64] });
    expect(earClip(freeInterval)).toEqual({ kind: 'sequence', notes: [60, 67] });
    expect(earClip(scale)).toEqual({ kind: 'sequence', notes: [60, 62, 64] });
    expect(earClip(chord)).toEqual({ kind: 'chord', notes: [60, 64, 67] });
  });

  it('plays nothing for ordinary items', () => {
    const plain: TestItem = { kind: 'find-note', id: 'p', prompt: 'Play E4.', midi: 64 };
    expect(isByEar(plain)).toBe(false);
    expect(earClip(plain)).toBeNull();
  });
});

describe('earView', () => {
  it('hides the answer after a miss and says which way to go', () => {
    const s = play(note, 67);
    const v = earView(note, s, false);
    expect(v.marks.get(67)).toBe('bad');
    expect([...v.marks.values()]).not.toContain('missed');
    expect(v.message).toBe('Not that one. The note you heard is lower.');
    expect(v.message).not.toMatch(/\bE\b/);
  });

  it('shows everything once revealed', () => {
    const s = play(note, 67);
    const v = earView(note, s, true);
    expect(v.marks.get(64)).toBe('missed');
    expect(v.message).toBe(s.verdict!.message);
  });

  it('keeps the right-answer message', () => {
    const s = play(note, 64);
    expect(earView(note, s, false).message).toBe(s.verdict!.message);
  });

  it('does not name the interval in the hint', () => {
    const s = play(interval, 60);
    const v = earView(interval, s, false);
    expect(s.hint).toContain('major 3rd');
    expect(v.hint).toBe('Good. Now the second note you heard.');
    expect(earView(interval, play(interval, 60, 65), false).message).toBe('The second note isn’t right. Listen again.');
  });

  it('counts scale notes without naming the next one', () => {
    const v = earView(scale, play(scale, 60), false);
    expect(v.hint).toBe('1 of 3. Keep going.');
    expect(earView(scale, play(scale, 60, 64), false).message).toBe('Note 2 isn’t right. Listen again from the start.');
  });

  it('says how close a chord was without naming notes', () => {
    const near = gradeChord(chord as Extract<TestItem, { kind: 'build-chord' }>, [60, 63, 67])!;
    expect(earView(chord, near, false).message).toBe('Close: 2 of your notes are in it. Listen again.');
    const inverted = gradeChord(chord as Extract<TestItem, { kind: 'build-chord' }>, [64, 67, 72])!;
    expect(earView(chord, inverted, false).message).toContain('lowest note');
  });

  it('leaves ordinary items alone', () => {
    const plain: TestItem = { kind: 'find-note', id: 'p', prompt: 'Play E4.', midi: 64 };
    const s = play(plain, 67);
    expect(earView(plain, s, false)).toEqual({ marks: s.marks, message: s.verdict!.message, hint: null });
  });
});

describe('clipEvents', () => {
  it('spaces a sequence and times the clip', () => {
    const { events, seconds } = clipEvents({ kind: 'sequence', notes: [60, 62, 64] }, { gap: 0.5 });
    expect(events.map((e) => e.at)).toEqual([0, 0.5, 1]);
    expect(seconds).toBeCloseTo(1.9);
  });

  it('starts chord notes together', () => {
    const { events, seconds } = clipEvents({ kind: 'chord', notes: [60, 64, 67] }, { seconds: 2 });
    expect(events.every((e) => e.at === 0 && e.dur === 2)).toBe(true);
    expect(seconds).toBe(2);
  });
});
