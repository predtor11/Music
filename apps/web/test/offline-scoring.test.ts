/**
 * The browser scores a session when the server can't be reached, so its rules
 * must match services/practice exactly. These tests run both on the same
 * lessons, units and attempts (the real course content) and compare.
 */

import { LessonSchema, UnitSchema, type Lesson, type StoredAttempt, type TestItem, type Unit } from '@music/contracts';
import { describe, expect, it } from 'vitest';
import { firstAttempts, LESSON_PASS_PERCENT, lessonItems, lessonPlan, nextItem, summarize, type ScoredAttempt } from '../src/offline/scoring.js';

// The service's own code, loaded by path so this app's type check doesn't pull in the server's.
const scoringPath = '../../../services/practice/src/scoring.ts';
const appPath = '../../../services/practice/src/app.ts';
const server = (await import(/* @vite-ignore */ scoringPath)) as {
  summarize(items: TestItem[], attempts: StoredAttempt[], pass: number | null): unknown;
  nextItem(items: TestItem[], attempts: StoredAttempt[]): TestItem | null;
  firstAttempts(attempts: StoredAttempt[]): Map<string, StoredAttempt>;
};
const serverApp = (await import(/* @vite-ignore */ appPath)) as { lessonItems(lesson: Lesson): TestItem[]; LESSON_PASS_PERCENT: number };

const lessonFiles = import.meta.glob('../../../services/curriculum/content/lessons/*/*.json', { eager: true, import: 'default' });
const unitFiles = import.meta.glob('../../../services/curriculum/content/units/*.json', { eager: true, import: 'default' });
const lessons = Object.values(lessonFiles).map((raw) => LessonSchema.parse(raw));
const units = Object.values(unitFiles).map((raw) => UnitSchema.parse(raw));

/** Small deterministic generator, so a failure repeats. */
function rng(seed: number) {
  let x = seed;
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}

function attemptsFor(items: TestItem[], seed: number): StoredAttempt[] {
  const random = rng(seed);
  const out: StoredAttempt[] = [];
  const pool = items.length > 0 ? items : [{ id: 'x' } as TestItem];
  const count = Math.floor(random() * (pool.length * 2 + 1));
  for (let i = 0; i < count; i++) {
    const item = pool[Math.floor(random() * pool.length)]!;
    out.push({
      id: `a${i}`,
      userId: 'u',
      sessionId: 's',
      itemId: item.id,
      itemKind: item.kind ?? 'find-note',
      skill: 'x',
      expected: [],
      played: [],
      correct: random() < 0.6,
      retried: random() < 0.3,
      mistake: null,
      timeMs: 100,
      playedAt: '2026-01-01T00:00:00.000Z',
    } as StoredAttempt);
  }
  return out;
}

describe('the course content is there to compare against', () => {
  it('has lessons and units', () => {
    expect(lessons.length).toBeGreaterThan(50);
    expect(units.length).toBeGreaterThanOrEqual(8);
  });
});

describe('local scoring matches the practice service', () => {
  it('uses the same lesson pass mark', () => {
    expect(LESSON_PASS_PERCENT).toBe(serverApp.LESSON_PASS_PERCENT);
  });

  it('picks the same items for every lesson (play-along, then quiz, de-duplicated)', () => {
    for (const lesson of lessons) expect(lessonItems(lesson), lesson.id).toEqual(serverApp.lessonItems(lesson));
  });

  it('plans a lesson like the service does when it starts one', () => {
    for (const lesson of lessons) {
      const items = serverApp.lessonItems(lesson);
      expect(lessonPlan(lesson), lesson.id).toEqual({ items, passPercent: items.length > 0 ? serverApp.LESSON_PASS_PERCENT : null });
    }
  });

  it('scores lessons and unit tests the same for many answer patterns', () => {
    const cases: Array<{ name: string; items: TestItem[]; pass: number | null }> = [
      ...lessons.map((l) => ({ name: l.id, items: lessonItems(l), pass: lessonPlan(l).passPercent })),
      ...units.map((u: Unit) => ({ name: `${u.id} test`, items: u.checkpoint.items, pass: u.checkpoint.passPercent })),
      { name: 'free play', items: [], pass: null },
    ];
    for (const { name, items, pass } of cases) {
      for (let seed = 1; seed <= 12; seed++) {
        const attempts = attemptsFor(items, seed * 7919 + items.length);
        expect(summarize(items, attempts, pass), `${name} seed ${seed}`).toEqual(server.summarize(items, attempts, pass));
        expect(nextItem(items, attempts)?.id, `${name} seed ${seed} next`).toBe(server.nextItem(items, attempts)?.id);
      }
    }
  });

  it('counts only the first attempt, and unanswered items as wrong', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }] as TestItem[];
    const attempts: ScoredAttempt[] = [
      { itemId: 'a', correct: false, retried: false },
      { itemId: 'a', correct: true, retried: true },
      { itemId: 'b', correct: true, retried: true },
      { itemId: 'c', correct: true, retried: false },
    ];
    expect(summarize(items, attempts, 50)).toEqual({ total: 4, answered: 3, firstTryCorrect: 1, accuracy: 25, passed: false });
    expect(nextItem(items, attempts)?.id).toBe('d');
    expect([...firstAttempts(attempts).keys()]).toEqual([...server.firstAttempts(attempts as StoredAttempt[]).keys()]);
  });

  it('says nothing about passing a session with no items or no pass mark', () => {
    expect(summarize([], [], 80)).toEqual({ total: 0, answered: 0, firstTryCorrect: 0, accuracy: null, passed: null });
    expect(summarize([{ id: 'a' }] as TestItem[], [{ itemId: 'a', correct: true, retried: false }], null).passed).toBeNull();
  });
});
