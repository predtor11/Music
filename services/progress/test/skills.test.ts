import { describe, expect, it } from 'vitest';
import { DAY, MINUTE, applyAttempt, median, reviewQueue, toSkillScore, type SkillState } from '../src/skills.js';
import { items, session } from './fixtures.js';

const at = (iso: string, spec = items.M3()) => session(iso, [spec])[0]!;
const fold = (attempts: ReturnType<typeof at>[]) => attempts.reduce<SkillState | undefined>((s, a) => applyAttempt(s, a), undefined)!;

describe('spaced repetition', () => {
  it('schedules 1 day, then 3 days, then grows by the ease', () => {
    const s1 = fold([at('2026-10-01T10:00:00Z')]);
    expect(s1.dueAt).toBe('2026-10-02T10:00:00.000Z');
    const s2 = applyAttempt(s1, at('2026-10-02T10:00:00Z'));
    expect(s2.intervalMs).toBe(3 * DAY);
    const s3 = applyAttempt(s2, at('2026-10-05T10:00:00Z'));
    expect(s3.streak).toBe(3);
    expect(s3.intervalMs).toBeGreaterThan(7 * DAY);
  });

  it('counts drilling in one sitting as one review', () => {
    const s = fold([at('2026-10-01T10:00:00Z'), at('2026-10-01T10:01:00Z'), at('2026-10-01T10:02:00Z')]);
    expect(s.streak).toBe(1);
    expect(s.dueAt).toBe('2026-10-02T10:00:00.000Z');
    expect(s.attempts).toBe(3);
    expect(s.firstTryCorrect).toBe(3);
  });

  it('brings a missed skill back in 10 minutes and lowers the ease', () => {
    const s = fold([at('2026-10-01T10:00:00Z'), at('2026-10-05T10:00:00Z', items.M3(false))]);
    expect(s.streak).toBe(0);
    expect(s.intervalMs).toBe(10 * MINUTE);
    expect(s.dueAt).toBe('2026-10-05T10:10:00.000Z');
    expect(s.ease).toBeCloseTo(2.35);
  });

  it('shrinks the interval after a success that needed a retry', () => {
    const s0 = fold([at('2026-10-01T10:00:00Z'), at('2026-10-02T10:00:00Z')]);
    const s = applyAttempt(s0, at('2026-10-05T10:00:00Z', { ...items.M3(), retried: true }));
    expect(s.intervalMs).toBe(1.5 * DAY);
    expect(s.firstTryCorrect).toBe(2);
  });

  it('does not change the state it was given', () => {
    const s1 = fold([at('2026-10-01T10:00:00Z')]);
    const copy = structuredClone(s1);
    applyAttempt(s1, at('2026-10-03T10:00:00Z', items.M3(false)));
    expect(s1).toEqual(copy);
  });
});

describe('scores and review queue', () => {
  it('reports first-try accuracy and the median time of correct answers', () => {
    const s = fold(session('2026-10-01T10:00:00Z', [items.M3(), items.M3(false), items.M3(), { ...items.M3(), retried: true }]));
    expect(toSkillScore(s)).toMatchObject({ skill: 'interval:M3', attempts: 4, firstTryAccuracy: 0.5, medianTimeMs: 2500 });
  });

  it('lists due skills, the longest overdue first', () => {
    const a = fold([at('2026-10-01T10:00:00Z')]); // due 2 Oct
    const b = fold([at('2026-10-03T10:00:00Z', items.m3())]); // due 4 Oct
    const c = fold([at('2026-10-05T10:00:00Z', items.P5())]); // due 6 Oct, not yet
    const q = reviewQueue([b, c, a], new Date('2026-10-05T12:00:00Z'));
    expect(q.map((s) => s.skill)).toEqual(['interval:M3', 'interval:m3']);
  });

  it('takes the median', () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 10])).toBe(3);
  });
});
