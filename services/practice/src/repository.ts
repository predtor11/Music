import type { Session, StoredAttempt, TestItem } from '@music/contracts';

/** A session as stored: the public fields plus the items and pass mark fixed at start. */
export interface SessionRecord extends Session {
  /** Items in the order they are asked; empty for review and free sessions. */
  items: TestItem[];
  /** First-try accuracy needed to pass, or null when the session is not graded. */
  passPercent: number | null;
  /** Set when the session ends. */
  passed: boolean | null;
}

/** Storage for sessions and attempts. In memory without a database, Postgres (schema `practice`) with one. */
export interface PracticeRepository {
  createSession(session: SessionRecord): Promise<void>;
  getSession(id: string): Promise<SessionRecord | null>;
  /** Marks the session ended. Returns false when it had already ended, so callers publish once. */
  endSession(id: string, endedAt: string, passed: boolean | null): Promise<boolean>;
  addAttempt(attempt: StoredAttempt): Promise<void>;
  /** Attempts for a session, oldest first. */
  listAttempts(sessionId: string): Promise<StoredAttempt[]>;
  close(): Promise<void>;
}

export class InMemoryPracticeRepository implements PracticeRepository {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly attempts: StoredAttempt[] = [];

  async createSession(session: SessionRecord): Promise<void> {
    this.sessions.set(session.id, structuredClone(session));
  }

  async getSession(id: string): Promise<SessionRecord | null> {
    const session = this.sessions.get(id);
    return session ? structuredClone(session) : null;
  }

  async endSession(id: string, endedAt: string, passed: boolean | null): Promise<boolean> {
    const session = this.sessions.get(id);
    if (!session || session.endedAt) return false;
    session.endedAt = endedAt;
    session.passed = passed;
    return true;
  }

  async addAttempt(attempt: StoredAttempt): Promise<void> {
    this.attempts.push(structuredClone(attempt));
  }

  async listAttempts(sessionId: string): Promise<StoredAttempt[]> {
    return this.attempts.filter((a) => a.sessionId === sessionId).map((a) => structuredClone(a));
  }

  async close(): Promise<void> {}
}
