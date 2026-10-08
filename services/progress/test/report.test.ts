import { ProgressReportSchema, type Progress } from '@music/contracts';
import { describe, expect, it } from 'vitest';
import { accuracyTrend, buildWeeklyReport, localDate, practiceMinutes, speedChanges, streakDays, topicOf } from '../src/report.js';
import { IST, USER, WEEK_END, items, realisticWeek, session, weekBefore } from './fixtures.js';

const week = realisticWeek();
const all = [...weekBefore(), ...week];

const progress: Progress = {
  userId: USER,
  units: [
    { unitId: 'u1', unlocked: true, checkpointPassed: true, lessons: [{ lessonId: 'u1-l1', status: 'done' }] },
    {
      unitId: 'u2',
      unlocked: true,
      checkpointPassed: false,
      lessons: [
        { lessonId: 'u2-l1', status: 'done' },
        { lessonId: 'u2-l2', status: 'in-progress' },
        { lessonId: 'u2-l3', status: 'locked' },
      ],
    },
  ],
};

describe('weekly report on a realistic week', () => {
  const report = buildWeeklyReport({ userId: USER, to: WEEK_END, attempts: all, utcOffsetMinutes: IST, progress, dueReviews: 4 });

  it('validates against ProgressReportSchema', () => {
    expect(() => ProgressReportSchema.parse(report)).not.toThrow();
    expect(report.from).toBe('2026-10-04T18:00:00.000Z');
    expect(report.to).toBe('2026-10-11T18:00:00.000Z');
  });

  it('counts sessions, minutes and the streak in India time', () => {
    expect(report.practice.sessions).toBe(7);
    // 67 answers about 30 s apart, plus each session's first answer.
    expect(report.practice.minutes).toBeGreaterThan(25);
    expect(report.practice.minutes).toBeLessThan(40);
    // Fri, Sat, Sun; Thursday was missed.
    expect(report.practice.streakDays).toBe(3);
  });

  it('leaves out the week before', () => {
    expect(report.accuracyTrend.reduce((n, p) => n + p.attempts, 0)).toBe(week.length);
  });

  it('gives an accuracy point per topic per practice day', () => {
    const intervals = report.accuracyTrend.filter((p) => p.topic === 'interval');
    expect(intervals.map((p) => p.date)).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-09', '2026-10-10', '2026-10-11']);
    // Monday: 12 interval answers, 3 wrong.
    expect(intervals[0]).toEqual({ topic: 'interval', date: '2026-10-05', firstTryAccuracy: 0.75, attempts: 12 });
    expect(intervals.at(-1)!.firstTryAccuracy).toBe(1);
    expect(new Set(report.accuracyTrend.map((p) => p.topic))).toEqual(new Set(['interval', 'chord', 'scale', 'note']));
  });

  it('finds the planted mistake patterns, most frequent first', () => {
    expect(report.patterns).toEqual([
      {
        id: 'interval-mixup:m3-M3',
        description: 'Mixes up the minor 3rd (3 half steps) and the major 3rd (4 half steps)',
        occurrences: 6,
        skills: ['interval:M3', 'interval:m3'],
      },
      { id: 'chord-third', description: expect.stringContaining('wrong 3rd'), occurrences: 3, skills: ['chord:major'] },
      { id: 'scale-missed-accidental', description: expect.stringContaining('sharp or flat'), occurrences: 2, skills: ['scale:G-major'] },
    ]);
  });

  it('shows answers getting faster than the week before', () => {
    const m3 = report.speed.find((s) => s.skill === 'interval:m3')!;
    expect(m3.changePercent).toBeLessThan(-15);
    expect(report.speed.every((s) => s.changePercent === null || s.changePercent < 0)).toBe(true);
    expect(report.speed[0]!.skill).toBe('chord:major'); // most correct answers this week
  });

  it('makes three suggestions, led by the biggest mistake pattern', () => {
    expect(report.suggestions).toHaveLength(3);
    expect(report.suggestions[0]!.text).toMatch(/mix up m3 and M3/);
    expect(report.suggestions.map((s) => s.text).join(' ')).toMatch(/due for review/);
  });
});

describe('suggestions', () => {
  it('points to the checkpoint when every lesson in a unit is done', () => {
    const done: Progress = {
      userId: USER,
      units: [{ unitId: 'u1', unlocked: true, checkpointPassed: false, lessons: [{ lessonId: 'a', status: 'done' }] }],
    };
    const r = buildWeeklyReport({ userId: USER, to: WEEK_END, attempts: [], progress: done });
    expect(r.suggestions).toContainEqual(expect.objectContaining({ unitId: 'u1', text: expect.stringMatching(/checkpoint/) }));
  });

  it('points to the next lesson with its id', () => {
    const r = buildWeeklyReport({ userId: USER, to: WEEK_END, attempts: [], progress: {
      userId: USER,
      units: [{ unitId: 'u1', unlocked: true, checkpointPassed: false, lessons: [{ lessonId: 'a', status: 'done' }, { lessonId: 'b', status: 'available' }] }],
    } });
    expect(r.suggestions).toContainEqual({ text: 'Start your next lesson.', lessonId: 'b', unitId: 'u1' });
  });

  it('names a weak topic', () => {
    const shaky = session('2026-10-10T14:00:00Z', [items.major(false), items.major(false), items.major(), items.minor(), items.major(false), items.minor()]);
    const r = buildWeeklyReport({ userId: USER, to: WEEK_END, attempts: shaky });
    expect(r.suggestions.map((s) => s.text)).toContain('You got 50% of chords right first time this week. A short review session on chords will help.');
  });

  it('always gives at least two, even with no data', () => {
    const r = buildWeeklyReport({ userId: USER, to: WEEK_END, attempts: [] });
    expect(r.suggestions.length).toBeGreaterThanOrEqual(2);
    expect(r.practice).toEqual({ minutes: 0, sessions: 0, streakDays: 0 });
    expect(r.patterns).toEqual([]);
    expect(() => ProgressReportSchema.parse(r)).not.toThrow();
  });
});

describe('report pieces', () => {
  it('takes the topic from the skill tag', () => {
    expect(topicOf('interval:M3')).toBe('interval');
    expect(topicOf('rhythm')).toBe('rhythm');
  });

  it('splits days at local midnight', () => {
    expect(localDate('2026-10-10T19:00:00Z')).toBe('2026-10-10');
    expect(localDate('2026-10-10T19:00:00Z', IST)).toBe('2026-10-11');
  });

  it('counts a streak that is still alive when today has no practice yet', () => {
    expect(streakDays(['2026-10-08', '2026-10-09', '2026-10-10'], '2026-10-11')).toBe(3);
    expect(streakDays(['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'], '2026-10-11')).toBe(4);
    expect(streakDays(['2026-10-08', '2026-10-09'], '2026-10-11')).toBe(0);
    expect(streakDays([], '2026-10-11')).toBe(0);
  });

  it('does not count long breaks inside a session as practice', () => {
    const s = session('2026-10-10T14:00:00Z', [items.m3(), items.m3()], { gapS: 3600 });
    // First answer (~2 s) plus a gap capped at 5 minutes.
    expect(practiceMinutes(s)).toBeCloseTo(5 + 2.2 / 60, 1);
  });

  it('counts retries as not first-try', () => {
    const s = session('2026-10-10T14:00:00Z', [items.m3(), { ...items.m3(), retried: true }]);
    expect(accuracyTrend(s)[0]!.firstTryAccuracy).toBe(0.5);
  });

  it('reports no change when a skill is new this week', () => {
    const s = session('2026-10-10T14:00:00Z', [items.P5()]);
    expect(speedChanges(s, [])).toEqual([{ skill: 'interval:P5', medianTimeMs: 2200, changePercent: null }]);
  });
});
