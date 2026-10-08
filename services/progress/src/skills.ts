import type { SkillScore, StoredAttempt } from '@music/contracts';

/**
 * Per-skill standing plus spaced-repetition state. A skill is a concept tag
 * such as "interval:M3"; every attempt carries one.
 */
export interface SkillState {
  userId: string;
  skill: string;
  attempts: number;
  /** Attempts right on the first try (correct and not retried). */
  firstTryCorrect: number;
  /** Times of the latest correct answers, newest last, for the median. */
  recentTimesMs: number[];
  /** How fast the review interval grows after a success (SM-2 style). */
  ease: number;
  intervalMs: number;
  /** First-try successes in a row, counting only spaced ones. */
  streak: number;
  dueAt: string | null;
  /** When the schedule last moved, so drilling in one sitting doesn't count as many reviews. */
  lastScheduledAt: string | null;
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

const RECENT_TIMES = 20;
const START_EASE = 2.5;
const MIN_EASE = 1.3;
const MAX_EASE = 2.8;
/** A missed skill comes back soon, in the same sitting if possible. */
const RELEARN_INTERVAL = 10 * MINUTE;

export function newSkillState(userId: string, skill: string): SkillState {
  return {
    userId,
    skill,
    attempts: 0,
    firstTryCorrect: 0,
    recentTimesMs: [],
    ease: START_EASE,
    intervalMs: 0,
    streak: 0,
    dueAt: null,
    lastScheduledAt: null,
  };
}

/** Right on the first try: correct and not after a retry. */
export function isFirstTry(attempt: Pick<StoredAttempt, 'correct' | 'retried'>): boolean {
  return attempt.correct && !attempt.retried;
}

/**
 * Fold one attempt into a skill's state. Pure.
 *
 * Scheduling: a first-try success moves the review out (1 day, 3 days, then
 * interval × ease), but only once at least half the current interval has
 * passed since the schedule last moved, so ten right answers in one session
 * count as one review. A success after a retry shrinks the interval; a miss
 * resets it to 10 minutes.
 */
export function applyAttempt(prev: SkillState | undefined, attempt: StoredAttempt): SkillState {
  const state: SkillState = prev ? { ...prev, recentTimesMs: [...prev.recentTimesMs] } : newSkillState(attempt.userId, attempt.skill);
  const t = Date.parse(attempt.playedAt);
  state.attempts += 1;
  if (attempt.correct) state.recentTimesMs = [...state.recentTimesMs, attempt.timeMs].slice(-RECENT_TIMES);

  const schedule = (intervalMs: number) => {
    state.intervalMs = intervalMs;
    state.dueAt = new Date(t + intervalMs).toISOString();
    state.lastScheduledAt = attempt.playedAt;
  };

  if (isFirstTry(attempt)) {
    state.firstTryCorrect += 1;
    const since = state.lastScheduledAt ? t - Date.parse(state.lastScheduledAt) : Infinity;
    if (since >= state.intervalMs / 2) {
      state.streak += 1;
      const next = state.streak === 1 ? DAY : state.streak === 2 ? 3 * DAY : Math.round(Math.max(state.intervalMs, DAY) * state.ease);
      state.ease = Math.min(MAX_EASE, state.ease + 0.05);
      schedule(next);
    }
  } else if (attempt.correct) {
    state.ease = Math.max(MIN_EASE, state.ease - 0.15);
    schedule(Math.max(RELEARN_INTERVAL, Math.round(state.intervalMs / 2)));
  } else {
    state.streak = 0;
    state.ease = Math.max(MIN_EASE, state.ease - 0.2);
    schedule(RELEARN_INTERVAL);
  }
  return state;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

export function toSkillScore(state: SkillState): SkillScore {
  return {
    skill: state.skill,
    attempts: state.attempts,
    firstTryAccuracy: state.attempts ? state.firstTryCorrect / state.attempts : 0,
    medianTimeMs: median(state.recentTimesMs),
    dueAt: state.dueAt,
  };
}

/** Skills due at `now`, the longest overdue first. */
export function reviewQueue(states: readonly SkillState[], now: Date, limit = 20): SkillScore[] {
  return states
    .filter((s) => s.dueAt !== null && Date.parse(s.dueAt) <= now.getTime())
    .sort((a, b) => Date.parse(a.dueAt!) - Date.parse(b.dueAt!) || a.skill.localeCompare(b.skill))
    .slice(0, limit)
    .map(toSkillScore);
}
