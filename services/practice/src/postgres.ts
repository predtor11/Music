import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { MistakeKind, Session, StoredAttempt, TestItem, TestItemKind } from '@music/contracts';
import postgres from 'postgres';
import type { PracticeRepository, SessionRecord } from './repository.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations/', import.meta.url));

/** Applies migrations/*.sql in name order, each once, recorded in practice.schema_migrations. */
export async function migrate(sql: postgres.Sql): Promise<string[]> {
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  const applied: string[] = [];
  await sql.begin(async (tx) => {
    // One migrator at a time when several instances start together.
    await tx`SELECT pg_advisory_xact_lock(hashtext('practice.migrate'))`;
    await tx`CREATE SCHEMA IF NOT EXISTS practice`;
    await tx`CREATE TABLE IF NOT EXISTS practice.schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
    const done = new Set((await tx<{ name: string }[]>`SELECT name FROM practice.schema_migrations`).map((r) => r.name));
    for (const file of files) {
      if (done.has(file)) continue;
      await tx.unsafe(await readFile(MIGRATIONS_DIR + file, 'utf8'));
      await tx`INSERT INTO practice.schema_migrations (name) VALUES (${file})`;
      applied.push(file);
    }
  });
  return applied;
}

interface SessionRow {
  id: string;
  user_id: string;
  kind: Session['kind'];
  ref_id: string | null;
  started_at: Date;
  ended_at: Date | null;
  items: TestItem[];
  pass_percent: string | null;
  passed: boolean | null;
}

interface AttemptRow {
  id: string;
  session_id: string;
  user_id: string;
  item_id: string;
  item_kind: TestItemKind;
  skill: string;
  expected: number[];
  played: number[];
  correct: boolean;
  retried: boolean;
  mistake: MistakeKind | null;
  time_ms: number;
  played_at: Date;
}

/** Sessions and attempts in the `practice` schema of the Supabase Postgres database. */
export class PostgresPracticeRepository implements PracticeRepository {
  constructor(private readonly sql: postgres.Sql) {}

  /** Connects and brings the schema up to date. */
  static async connect(url: string): Promise<PostgresPracticeRepository> {
    // Supabase's pooler runs in transaction mode, which can't keep prepared statements.
    const sql = postgres(url, { prepare: false, onnotice: () => {} });
    await migrate(sql);
    return new PostgresPracticeRepository(sql);
  }

  async createSession(s: SessionRecord): Promise<void> {
    await this.sql`
      INSERT INTO practice.sessions (id, user_id, kind, ref_id, started_at, ended_at, items, pass_percent, passed)
      VALUES (${s.id}, ${s.userId}, ${s.kind}, ${s.refId}, ${s.startedAt}, ${s.endedAt},
              ${this.sql.json(s.items as postgres.JSONValue)}, ${s.passPercent}, ${s.passed})`;
  }

  async getSession(id: string): Promise<SessionRecord | null> {
    const [row] = await this.sql<SessionRow[]>`SELECT * FROM practice.sessions WHERE id = ${id}`;
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      kind: row.kind,
      refId: row.ref_id,
      startedAt: row.started_at.toISOString(),
      endedAt: row.ended_at?.toISOString() ?? null,
      items: row.items,
      passPercent: row.pass_percent === null ? null : Number(row.pass_percent),
      passed: row.passed,
    };
  }

  async endSession(id: string, endedAt: string, passed: boolean | null): Promise<boolean> {
    const rows = await this.sql`
      UPDATE practice.sessions SET ended_at = ${endedAt}, passed = ${passed}
      WHERE id = ${id} AND ended_at IS NULL RETURNING id`;
    return rows.length === 1;
  }

  async addAttempt(a: StoredAttempt): Promise<void> {
    await this.sql`
      INSERT INTO practice.attempts
        (id, session_id, user_id, item_id, item_kind, skill, expected, played, correct, retried, mistake, time_ms, played_at)
      VALUES (${a.id}, ${a.sessionId}, ${a.userId}, ${a.itemId}, ${a.itemKind}, ${a.skill},
              ${this.sql.array(a.expected)}::integer[], ${this.sql.array(a.played)}::integer[],
              ${a.correct}, ${a.retried}, ${a.mistake}, ${a.timeMs}, ${a.playedAt})`;
  }

  async listAttempts(sessionId: string): Promise<StoredAttempt[]> {
    const rows = await this.sql<AttemptRow[]>`
      SELECT * FROM practice.attempts WHERE session_id = ${sessionId} ORDER BY seq`;
    return rows.map((r) => ({
      id: r.id,
      sessionId: r.session_id,
      userId: r.user_id,
      itemId: r.item_id,
      itemKind: r.item_kind,
      skill: r.skill,
      expected: r.expected,
      played: r.played,
      correct: r.correct,
      retried: r.retried,
      mistake: r.mistake,
      timeMs: r.time_ms,
      playedAt: r.played_at.toISOString(),
    }));
  }

  async close(): Promise<void> {
    await this.sql.end();
  }
}
