import { describe, expect, it } from 'vitest';
import { AttemptSchema, ChordQuerySchema, TestItemSchema, UserSettingsSchema } from '../src/index.js';

describe('contracts', () => {
  it('fills settings defaults', () => {
    expect(UserSettingsSchema.parse({})).toEqual({ noteNaming: 'western', keyboardSize: 61, lowestNote: 36, currentKey: 'C', midiInputId: null });
  });

  it('accepts a chord test item', () => {
    const item = TestItemSchema.parse({ kind: 'build-chord', id: 'u4-eb-minor', prompt: 'Play E flat minor', pitchClasses: [3, 6, 10] });
    expect(item.kind === 'build-chord' && item.bassPc).toBeNull();
  });

  it('rejects an unknown item kind', () => {
    expect(TestItemSchema.safeParse({ kind: 'dance', id: 'x', prompt: 'x' }).success).toBe(false);
  });

  it('parses the chord query string', () => {
    expect(ChordQuerySchema.parse({ notes: '60, 64,67' })).toEqual({ notes: [60, 64, 67], key: 'C' });
  });

  it('validates an attempt', () => {
    const ok = AttemptSchema.safeParse({
      sessionId: '6f1c5f5e-6a43-4b3b-9d3c-0d6c2f8f2f11',
      itemId: 'u1-f-sharp',
      itemKind: 'find-note',
      skill: 'note:F#',
      expected: [6],
      played: [65],
      correct: false,
      mistake: 'wrong-note',
      timeMs: 1800,
      playedAt: '2026-10-08T06:00:00.000Z',
    });
    expect(ok.success).toBe(true);
  });
});
