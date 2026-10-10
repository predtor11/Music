import { instrumentOf, type SessionEndedEvent, type StoredAttempt } from '@music/contracts';
import type { SkillState } from './skills.js';
import type { Completions } from './unlocks.js';
import { localDate } from './report.js';

export type SessionEnded = SessionEndedEvent['data'];

/**
 * Storage for the progress service. Each write takes the event id and does
 * nothing (returns false) when that event was already handled, so redelivered
 * events are harmless.
 */
export interface ProgressRepository {
  /** Store the attempt and update its skill with `update`, in one step. */
  recordAttempt(eventId: string, attempt: StoredAttempt, update: (prev: SkillState | undefined) => SkillState): Promise<boolean>;
  recordSessionEnded(eventId: string, ended: SessionEnded, occurredAt: string): Promise<boolean>;
  getSkills(userId: string): Promise<SkillState[]>;
  /** Attempts with `from < playedAt <= to`. */
  getAttempts(userId: string, from: Date, to: Date): Promise<StoredAttempt[]>;
  /** Local dates (YYYY-MM-DD) with any attempt. */
  getPracticeDays(userId: string, utcOffsetMinutes: number): Promise<string[]>;
  getCompletions(userId: string): Promise<Completions>;
  close(): Promise<void>;
}

interface UserCompletions {
  lessonsStarted: Set<string>;
  lessonsDone: Set<string>;
  checkpointsPassed: Set<string>;
}

export class InMemoryProgressRepository implements ProgressRepository {
  private readonly events = new Set<string>();
  private readonly attempts = new Map<string, StoredAttempt>();
  private readonly skills = new Map<string, SkillState>();
  private readonly completions = new Map<string, UserCompletions>();

  async recordAttempt(eventId: string, attempt: StoredAttempt, update: (prev: SkillState | undefined) => SkillState): Promise<boolean> {
    if (this.events.has(eventId) || this.attempts.has(attempt.id)) return false;
    this.events.add(eventId);
    this.attempts.set(attempt.id, { ...attempt, instrument: instrumentOf(attempt) });
    const key = `${attempt.userId}|${attempt.skill}`;
    this.skills.set(key, update(this.skills.get(key)));
    return true;
  }

  async recordSessionEnded(eventId: string, ended: SessionEnded): Promise<boolean> {
    if (this.events.has(eventId)) return false;
    this.events.add(eventId);
    if (!ended.refId) return true;
    const c = this.userCompletions(ended.userId);
    if (ended.kind === 'lesson') {
      // A finished lesson stays finished when it's replayed and not passed.
      if (ended.passed === false) {
        if (!c.lessonsDone.has(ended.refId)) c.lessonsStarted.add(ended.refId);
      } else {
        c.lessonsDone.add(ended.refId);
        c.lessonsStarted.delete(ended.refId);
      }
    } else if (ended.kind === 'checkpoint' && ended.passed) {
      c.checkpointsPassed.add(ended.refId);
    }
    return true;
  }

  async getSkills(userId: string): Promise<SkillState[]> {
    return [...this.skills.values()].filter((s) => s.userId === userId);
  }

  async getAttempts(userId: string, from: Date, to: Date): Promise<StoredAttempt[]> {
    return [...this.attempts.values()]
      .filter((a) => a.userId === userId && Date.parse(a.playedAt) > from.getTime() && Date.parse(a.playedAt) <= to.getTime())
      .sort((a, b) => Date.parse(a.playedAt) - Date.parse(b.playedAt));
  }

  async getPracticeDays(userId: string, utcOffsetMinutes: number): Promise<string[]> {
    const days = new Set<string>();
    for (const a of this.attempts.values()) if (a.userId === userId) days.add(localDate(a.playedAt, utcOffsetMinutes));
    return [...days].sort();
  }

  async getCompletions(userId: string): Promise<UserCompletions> {
    return this.userCompletions(userId);
  }

  async close(): Promise<void> {}

  private userCompletions(userId: string): UserCompletions {
    let c = this.completions.get(userId);
    if (!c) {
      c = { lessonsStarted: new Set(), lessonsDone: new Set(), checkpointsPassed: new Set() };
      this.completions.set(userId, c);
    }
    return c;
  }
}
