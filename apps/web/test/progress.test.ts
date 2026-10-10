import type { ProgressReport } from '@music/contracts';
import { describe, expect, it } from 'vitest';
import {
  isEmptyReport,
  overallAccuracy,
  rangeLabel,
  skillLabel,
  speedChange,
  suggestionLink,
  topicLabel,
  topicSummaries,
  weekDays,
} from '../src/progress/format.js';

const report: ProgressReport = {
  userId: '00000000-0000-4000-8000-000000000001',
  from: '2026-10-01T18:00:00.000Z',
  to: '2026-10-08T18:00:00.000Z',
  practice: { minutes: 42.5, sessions: 5, streakDays: 3 },
  accuracyTrend: [
    { topic: 'interval', date: '2026-10-06', firstTryAccuracy: 0.5, attempts: 10 },
    { topic: 'interval', date: '2026-10-08', firstTryAccuracy: 0.8, attempts: 10 },
    { topic: 'note', date: '2026-10-08', firstTryAccuracy: 1, attempts: 4 },
  ],
  patterns: [],
  speed: [],
  suggestions: [],
};

describe('progress format', () => {
  it('names topics and skills in plain words', () => {
    expect(topicLabel('interval')).toBe('Intervals');
    expect(topicLabel('ear-training')).toBe('Ear training');
    expect(skillLabel('interval:M3')).toBe('Intervals: major 3rd');
    expect(skillLabel('interval:P11')).toBe('Intervals: perfect 11th');
    expect(skillLabel('note:F#')).toBe('Note names: F♯');
    expect(skillLabel('g:note:F#')).toBe('Note names: F♯');
    expect(skillLabel('chord:C-Eb-G')).toBe('Chords: C E♭ G');
  });

  it('lists the seven local days ending on the report day', () => {
    // 18:00 UTC is 23:30 in India, still the 8th.
    const days = weekDays(report, 330);
    expect(days.map((d) => d.date)).toEqual(['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08']);
    expect(days.at(-1)!.short).toBe('Thu');
    expect(weekDays(report, 360).at(-1)!.date).toBe('2026-10-09');
    expect(rangeLabel(days)).toBe('2 – 8 October');
  });

  it('summarises each topic, most practised first', () => {
    const days = weekDays(report, 330);
    const [first, second] = topicSummaries(report, days);
    expect(first).toMatchObject({ topic: 'interval', attempts: 20, accuracy: 0.65 });
    expect(first!.change).toBeCloseTo(0.3);
    expect(first!.points.map((p) => p.slot)).toEqual([4, 6]);
    expect(first!.points[0]!.label).toBe('Tue: 50% of 10');
    expect(second).toMatchObject({ topic: 'note', change: null });
    expect(overallAccuracy(report)).toBeCloseTo((5 + 8 + 4) / 24);
  });

  it('words speed changes, faster is good', () => {
    expect(speedChange(-12.4)).toEqual({ text: '12% faster', tone: 'good' });
    expect(speedChange(20)).toEqual({ text: '20% slower', tone: 'warn' });
    expect(speedChange(0.3).text).toBe('Same speed');
    expect(speedChange(null).text).toBe('New this week');
  });

  it('links suggestions to a lesson, a unit test or a review', () => {
    expect(suggestionLink({ text: 'Start your next lesson.', lessonId: 'u1-l3', unitId: 'u1' }).href).toBe('#/lesson/u1-l3');
    expect(suggestionLink({ text: 'Take the checkpoint.', unitId: 'u1' }).href).toBe('#/checkpoint/u1');
    expect(suggestionLink({ text: '3 skills are due for review.' }).href).toBe('#/review');
    expect(suggestionLink({ text: 'You often mix up M3 and m3.' }).href).toBe('#/review');
    expect(suggestionLink({ text: 'Play for ten minutes today to start a new streak.' }).href).toBe('#/lessons');
    expect(suggestionLink({ text: 'Try free play.' }).href).toBe('#/');
  });

  it('knows an empty week', () => {
    expect(isEmptyReport(report)).toBe(false);
    expect(isEmptyReport({ ...report, practice: { minutes: 0, sessions: 0, streakDays: 0 }, accuracyTrend: [] })).toBe(true);
  });
});
