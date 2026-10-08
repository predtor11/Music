import { describe, expect, expectTypeOf, it } from 'vitest';
import { AttemptSchema, ChordQuerySchema, LessonStepSchema, TestItemSchema, UserCreatedEventSchema, UserSettingsSchema, type MusicEvent } from '../src/index.js';

describe('contracts', () => {
  it('fills settings defaults', () => {
    expect(UserSettingsSchema.parse({})).toEqual({ noteNaming: 'western', keyboardSize: 61, lowestNote: 36, currentKey: 'C', midiInputId: null, theme: 'dark' });
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

describe('event types', () => {
  it('keeps each event type as a literal, so handlers get the right payload', () => {
    const type: 'user.created' = UserCreatedEventSchema.shape.type.value;
    expect(type).toBe('user.created');
    expectTypeOf<Extract<MusicEvent, { type: 'attempt.recorded' }>['data']['skill']>().toEqualTypeOf<string>();
  });
});

describe('lesson steps', () => {
  it('keeps key labels on show steps', () => {
    const step = LessonStepSchema.parse({ type: 'show', title: 't', body: 'b', highlightMidi: [60], labels: { '60': 'Sa' } });
    expect(step.type === 'show' && step.labels).toEqual({ '60': 'Sa' });
  });
});

describe('charts and analysis', () => {
  it('accepts a band chart with slash chords and a repeat', async () => {
    const { ChordChartSchema } = await import('../src/index.js');
    const chart = ChordChartSchema.safeParse({
      version: 1,
      id: 'axis',
      title: '1-5-6-4',
      key: 'G',
      timeSignature: '4/4',
      updatedAt: '2026-10-08T16:00:00.000Z',
      sections: [{ id: 's1', name: 'Verse 1', kind: 'verse', repeat: 2, bars: [{ chords: [{ symbol: 'G' }] }, { chords: [{ symbol: 'D/F#', beats: 2 }, { symbol: 'Em', beats: 2 }] }] }],
    });
    expect(chart.success).toBe(true);
    expect(ChordChartSchema.safeParse({ ...chart.data, timeSignature: 'four' }).success).toBe(false);
  });

  it('validates an analysis request and rejects a silent note', async () => {
    const { SongAnalysisRequestSchema } = await import('../src/index.js');
    expect(SongAnalysisRequestSchema.safeParse({ notes: [{ midi: 60, velocity: 80, startMs: 0, durationMs: 400 }], keyHint: 'C' }).success).toBe(true);
    expect(SongAnalysisRequestSchema.safeParse({ notes: [{ midi: 60, velocity: 0, startMs: 0, durationMs: 400 }] }).success).toBe(false);
  });
});
