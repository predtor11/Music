import type { StoredAttempt, TestItem } from '@music/contracts';

export interface SessionSummary {
  total: number;
  answered: number;
  /** Items whose first attempt was right without a retry. */
  firstTryCorrect: number;
  /** firstTryCorrect / total as a percentage, or null for a session with no items. */
  accuracy: number | null;
  passed: boolean | null;
}

/** First attempt per item, in the order the items were answered. */
export function firstAttempts(attempts: StoredAttempt[]): Map<string, StoredAttempt> {
  const first = new Map<string, StoredAttempt>();
  for (const attempt of attempts) if (!first.has(attempt.itemId)) first.set(attempt.itemId, attempt);
  return first;
}

/** The first item with no attempt yet, or null when every item has one. */
export function nextItem(items: TestItem[], attempts: StoredAttempt[]): TestItem | null {
  const answered = firstAttempts(attempts);
  return items.find((item) => !answered.has(item.id)) ?? null;
}

/**
 * Scores a session on first-try accuracy. Unanswered items count as wrong, so
 * ending early can't pass a checkpoint.
 */
export function summarize(items: TestItem[], attempts: StoredAttempt[], passPercent: number | null): SessionSummary {
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
