import { describe, expect, it } from 'vitest';
import { beatFingers, handsAt, steadiness } from '../src/hands/fingering.js';

const RH_C = { hand: 'right' as const, keys: [60, 62, 64, 65, 67] };
const RH_F = { hand: 'right' as const, keys: [65, 67, 69, 71, 72] };
const LH_C = { hand: 'left' as const, keys: [55, 53, 52, 50, 48] };
const note = (midi: number, finger: number) => ({ midi, hand: 'right' as const, finger });

describe('handsAt', () => {
  const beats = [{ notes: [note(64, 3)] }, { move: [RH_F], notes: [note(65, 1)] }, { notes: [note(67, 2)] }];

  it('keeps the start position until a move', () => {
    expect(handsAt([RH_C], beats, 0)).toEqual([RH_C]);
  });

  it('applies the move on its own beat and keeps it after', () => {
    expect(handsAt([RH_C], beats, 1)).toEqual([RH_F]);
    expect(handsAt([RH_C], beats, 2)).toEqual([RH_F]);
  });

  it('lists the left hand first', () => {
    expect(handsAt([RH_C, LH_C], beats, 0).map((h) => h.hand)).toEqual(['left', 'right']);
  });
});

describe('beatFingers', () => {
  it('names each finger of a beat', () => {
    expect([...beatFingers({ notes: [note(60, 1), note(64, 3)] })]).toEqual(['right-1', 'right-3']);
  });
});

describe('steadiness', () => {
  it('is 100 for perfectly even gaps', () => {
    expect(steadiness([0, 500, 1000, 1500])).toBe(100);
  });

  it('drops when the gaps vary', () => {
    const s = steadiness([0, 300, 1100, 1300])!;
    expect(s).toBeLessThan(60);
    expect(s).toBeGreaterThanOrEqual(0);
  });

  it('needs at least three beats', () => {
    expect(steadiness([0, 400])).toBeNull();
  });
});
