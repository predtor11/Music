import type { ProgressReport } from '@music/contracts';
import { describe, expect, it } from 'vitest';
import { loadReport, savedAgo, saveReport } from '../src/progress/cache.js';

const report: ProgressReport = {
  userId: '00000000-0000-4000-8000-000000000001',
  from: '2026-01-01T00:00:00.000Z',
  to: '2026-01-08T00:00:00.000Z',
  practice: { minutes: 12, sessions: 2, streakDays: 1 },
  accuracyTrend: [],
  patterns: [],
  speed: [],
  suggestions: [],
};

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}

describe('the saved progress report', () => {
  it('comes back as it was saved, for the same user only', () => {
    const storage = memoryStorage();
    saveReport('u1', { report, tzOffset: 330, savedAt: '2026-01-08T10:00:00.000Z' }, storage);
    expect(loadReport('u1', storage)).toEqual({ report, tzOffset: 330, savedAt: '2026-01-08T10:00:00.000Z' });
    expect(loadReport('u2', storage)).toBeNull();
  });

  it('ignores a copy that is damaged or from an older shape', () => {
    expect(loadReport('u1', memoryStorage({ 'music.report.v1:u1': '{oops' }))).toBeNull();
    expect(loadReport('u1', memoryStorage({ 'music.report.v1:u1': JSON.stringify({ report: { nope: true }, tzOffset: 0, savedAt: 'x' }) }))).toBeNull();
  });

  it('does not mind a full or blocked storage', () => {
    expect(() =>
      saveReport(
        'u1',
        { report, tzOffset: 0, savedAt: '' },
        {
          setItem: () => {
            throw new Error('quota');
          },
        },
      ),
    ).not.toThrow();
  });

  it('says how old the copy is in plain words', () => {
    const now = new Date('2026-01-10T12:00:00.000Z');
    expect(savedAgo('2026-01-10T08:00:00.000Z', now)).toBe('earlier today');
    expect(savedAgo('2026-01-09T08:00:00.000Z', now)).toBe('yesterday');
    expect(savedAgo('2026-01-06T08:00:00.000Z', now)).toBe('4 days ago');
  });
});
