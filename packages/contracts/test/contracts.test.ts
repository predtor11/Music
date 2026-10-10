import { describe, expect, expectTypeOf, it } from 'vitest';
import { AttemptSchema, ChordQuerySchema, LessonSchema, LessonStepSchema, TestItemSchema, UserCreatedEventSchema, UserSettingsSchema, type MusicEvent } from '../src/index.js';

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

describe('recordings', () => {
  it('accepts a take in the analysis note shape, with the pedal and corrections', async () => {
    const { CreateRecordingSchema, TakeSchema } = await import('../src/index.js');
    const take = { notes: [{ midi: 60, velocity: 80, startMs: 0, durationMs: 400 }], pedal: [{ atMs: 0, down: true }], durationMs: 600 };
    expect(TakeSchema.safeParse(take).success).toBe(true);
    const parsed = CreateRecordingSchema.parse({ title: 'Jam', take, corrections: [{ atMs: 100, rootPc: 0, quality: 'major' }] });
    expect(parsed).toMatchObject({ source: 'played', keyOverride: null });
    expect(CreateRecordingSchema.safeParse({ title: 'Jam', take, corrections: [{ atMs: 1, rootPc: 0, quality: 'power' }] }).success).toBe(false);
  });
});

describe('guitar contracts', () => {
  it('accepts a standard tuning and a muted-string chord shape', async () => {
    const { GuitarTuningSchema, ChordShapeSchema, FretPositionSchema } = await import('../src/index.js');
    expect(GuitarTuningSchema.parse({ id: 'standard', name: 'Standard', strings: [40, 45, 50, 55, 59, 64] }).strings).toHaveLength(6);
    expect(ChordShapeSchema.parse({ name: 'A', frets: [null, 0, 2, 2, 2, 0], fingers: [null, null, 1, 2, 3, null], baseFret: 1 }).name).toBe('A');
    expect(() => FretPositionSchema.parse({ string: 0, fret: 0 })).toThrow();
  });
});

describe('instrument contracts', () => {
  it('treats a missing instrument as piano and rejects unknown ones', async () => {
    const { InstrumentIdSchema, instrumentOf, UserSettingsSchema } = await import('../src/index.js');
    expect(instrumentOf({})).toBe('piano');
    expect(instrumentOf({ instrument: 'guitar' })).toBe('guitar');
    expect(() => InstrumentIdSchema.parse('kazoo')).toThrow();
    expect(UserSettingsSchema.parse({ instrument: 'guitar' }).instrument).toBe('guitar');
    expect(UserSettingsSchema.parse({}).instrument).toBeUndefined();
  });
});

describe('input bounds', () => {
  const attempt = { sessionId: '00000000-0000-4000-8000-000000000001', itemId: 'i', itemKind: 'name-it', skill: 's', expected: [60], played: [60], correct: true, timeMs: 1000, playedAt: '2026-01-01T00:00:00.000Z' };
  it('accepts a normal attempt and rejects oversized ones', () => {
    expect(() => AttemptSchema.parse(attempt)).not.toThrow();
    expect(() => AttemptSchema.parse({ ...attempt, played: Array(513).fill(60) })).toThrow();
    expect(() => AttemptSchema.parse({ ...attempt, skill: 'x'.repeat(101) })).toThrow();
    expect(() => AttemptSchema.parse({ ...attempt, timeMs: 3_000_000_000 })).toThrow();
  });
  it('limits free-text settings', () => {
    expect(() => UserSettingsSchema.parse({ currentKey: 'k'.repeat(17) })).toThrow();
    expect(() => UserSettingsSchema.parse({ midiInputId: 'm'.repeat(257) })).toThrow();
  });
});

it('preserves old lessons and validates an optional guitar route', () => {
  const old = { id: 'old', unitId: 'unit-1', order: 1, title: 'Notes', summary: '', minutes: 1, steps: [{ type: 'explore', title: '', body: '' }] };
  expect(LessonSchema.parse(old).guitarPattern).toBeUndefined();
  const pattern = { title: 'Route', positions: [{ string: 6, fret: 3 }, { string: 6, fret: 5 }] };
  expect(LessonSchema.parse({ ...old, instrument: 'guitar', guitarPattern: pattern }).guitarPattern).toEqual(pattern);
  expect(LessonSchema.safeParse({ ...old, guitarPattern: { ...pattern, positions: [{ string: 0, fret: -1 }] } }).success).toBe(false);
});

it('accepts an additive named guitar chord guide without changing old lessons', () => {
  const old = { id: 'old', unitId: 'unit-1', order: 1, title: '', summary: '', minutes: 1, steps: [{ type: 'explore', title: '', body: '' }] };
  expect(LessonSchema.parse(old).guitarChord).toBeUndefined();
  expect(LessonSchema.parse({ ...old, guitarChord: 'Em' }).guitarChord).toBe('Em');
  expect(LessonSchema.safeParse({ ...old, guitarChord: '' }).success).toBe(false);
});
