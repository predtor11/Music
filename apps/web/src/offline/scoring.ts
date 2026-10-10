/**
 * Scoring a practice session in the browser, for when the server can't be
 * reached. This is a copy of services/practice/src/scoring.ts (plus
 * lessonItems from services/practice/src/app.ts) written against the shapes
 * the app has locally. test/offline-scoring.test.ts runs both side by side so
 * they can't drift apart.
 */

import type { Lesson, SessionSummary, TestItem } from '@music/contracts';

/** Pass mark for lesson quizzes; the service's LESSON_PASS_PERCENT. */
export const LESSON_PASS_PERCENT = 80;

/** What scoring needs to know about an attempt. */
export interface ScoredAttempt {
  itemId: string;
  correct: boolean;
  retried: boolean;
}

/** The items a lesson tests, in step order: play-along items, then the quiz. */
export function lessonItems(lesson: Lesson): TestItem[] {
  const seen = new Set<string>();
  const items: TestItem[] = [];
  for (const step of lesson.steps) {
    if (step.type !== 'play-along' && step.type !== 'quiz') continue;
    for (const item of step.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
    }
  }
  return items;
}

/** First attempt per item, in the order the items were answered. */
export function firstAttempts<A extends ScoredAttempt>(attempts: A[]): Map<string, A> {
  const first = new Map<string, A>();
  for (const attempt of attempts) if (!first.has(attempt.itemId)) first.set(attempt.itemId, attempt);
  return first;
}

/** The first item with no attempt yet, or null when every item has one. */
export function nextItem(items: TestItem[], attempts: ScoredAttempt[]): TestItem | null {
  const answered = firstAttempts(attempts);
  return items.find((item) => !answered.has(item.id)) ?? null;
}

/**
 * Scores a session on first-try accuracy. Unanswered items count as wrong, so
 * ending early can't pass a checkpoint.
 */
export function summarize(items: TestItem[], attempts: ScoredAttempt[], passPercent: number | null): SessionSummary {
  const first = firstAttempts(attempts);
  const total = items.length;
  const answered = items.filter((item) => first.has(item.id)).length;
  const firstTryCorrect = items.filter((item) => {
    const attempt = first.get(item.id);
    return attempt !== undefined && attempt.correct && !attempt.retried;
  }).length;
  const accuracy = total === 0 ? null : (firstTryCorrect / total) * 100;
  const passed = passPercent === null || accuracy === null ? null : accuracy >= passPercent;
  return { total, answered, firstTryCorrect, accuracy, passed };
}

/** A lesson's items and pass mark, as the service sets them when the session starts. */
export function lessonPlan(lesson: Lesson): { items: TestItem[]; passPercent: number | null } {
  const items = lessonItems(lesson);
  return { items, passPercent: items.length > 0 ? LESSON_PASS_PERCENT : null };
}
