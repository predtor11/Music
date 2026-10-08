import { describe, expect, it } from 'vitest';
import { classifyMistake, detectPatterns } from '../src/patterns.js';
import { items, session } from './fixtures.js';

const one = (spec: Parameters<typeof session>[1][number]) => session('2026-10-10T14:00:00Z', [spec])[0]!;

describe('mistake patterns', () => {
  it('reads interval mix-ups from the notes played', () => {
    expect(classifyMistake(one(items.M3(false)))?.id).toBe('interval-mixup:m3-M3');
    expect(classifyMistake(one(items.m3(false)))?.id).toBe('interval-mixup:m3-M3');
    expect(classifyMistake(one(items.P5(false)))?.id).toBe('interval-mixup:TT-P5');
  });

  it('treats the right interval an octave off as an octave slip', () => {
    const a = one({ ...items.M3(false), played: [62, 78], mistake: 'wrong-octave' });
    expect(classifyMistake(a)?.id).toBe('mistake:wrong-octave');
  });

  it('names the chord tone that was off', () => {
    expect(classifyMistake(one(items.major(false)))?.id).toBe('chord-third');
    expect(classifyMistake(one({ ...items.major(false), played: [60, 64, 68] }))?.id).toBe('chord-fifth');
    const cmaj7 = { skill: 'chord:maj7', itemKind: 'build-chord' as const, expected: [60, 64, 67, 71], played: [60, 64, 67, 70], correct: false };
    expect(classifyMistake(one(cmaj7))?.id).toBe('chord-seventh');
  });

  it('spots a missing sharp in a scale and an extra one', () => {
    expect(classifyMistake(one(items.gMajor(false)))?.id).toBe('scale-missed-accidental');
    const cMajor = [60, 62, 64, 65, 67, 69, 71, 72];
    const spec = { skill: 'scale:C-major', itemKind: 'play-scale' as const, expected: cMajor, played: cMajor.map((n) => (n === 65 ? 66 : n)), correct: false };
    expect(classifyMistake(one(spec))?.id).toBe('scale-extra-accidental');
  });

  it('spots sharp/flat confusion when finding notes', () => {
    expect(classifyMistake(one({ ...items.fSharp(false), played: [67], mistake: 'wrong-note' }))?.id).toBe('note-sharp-flat');
  });

  it('uses the mistake kind of a retried answer', () => {
    expect(classifyMistake(one({ ...items.major(), retried: true, mistake: 'wrong-inversion' }))?.id).toBe('mistake:wrong-inversion');
    expect(classifyMistake(one(items.major()))).toBeNull();
  });

  it('reports only patterns seen at least twice', () => {
    const attempts = session('2026-10-10T14:00:00Z', [items.M3(false), items.P5(false), items.m3(false)]);
    expect(detectPatterns(attempts).map((p) => [p.id, p.occurrences])).toEqual([['interval-mixup:m3-M3', 2]]);
  });
});
