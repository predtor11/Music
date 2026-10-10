import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import type { InstrumentId, MistakeKind, StoredAttempt, TestItemKind } from '@music/contracts';
import type { ProgressRepository, SessionEnded } from './repository.js';
import type { SkillState } from './skills.js';
import type { Completions } from './unlocks.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations/', import.meta.url));
/** Arbitrary constant so two copies of the service don't migrate at once. */
const MIGRATION_LOCK = 4004;

type Sql = postgres.Sql;

/** Apply migrations/*.sql in name order, each once, inside the "progress" schema. */
export async function migrate(sql: Sql, dir = MIGRATIONS_DIR): Promise<string[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const applied: string[] = [];
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(${MIGRATION_LOCK})`;
    await tx`create schema if not exists progress`;
    await tx`create table if not exists progress.schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
    const done = new Set((await tx<{ name: string }[]>`select name from progress.schema_migrations`).map((r) => r.name));
    for (const file of files) {
      if (done.has(file)) continue;
      await tx.unsafe(await readFile(`${dir}${file}`, 'utf8'));
      await tx`insert into progress.schema_migrations (name) values (${file})`;
      applied.push(file);
    }
  });
  return applied;
}

interface SkillRow {
  user_id: string;
  instrument: InstrumentId;
  skill: string;
  attempts: number;
  first_try_correct: number;
  recent_times_ms: number[];
  ease: number;
  interval_ms: string | number;
  streak: number;
  due_at: Date | null;
  last_scheduled_at: Date | null;
}

const toSkill = (r: SkillRow): SkillState => ({
  userId: r.user_id,
  instrument: r.instrument,
  skill: r.skill,
  attempts: r.attempts,
  firstTryCorrect: r.first_try_correct,
  recentTimesMs: r.recent_times_ms,
  ease: r.ease,
  intervalMs: Number(r.interval_ms),
  streak: r.streak,
  dueAt: r.due_at?.toISOString() ?? null,
  lastScheduledAt: r.last_scheduled_at?.toISOString() ?? null,
});

interface AttemptRow {
  id: string;
  instrument: InstrumentId;
  user_id: string;
  session_id: string;
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

const toAttempt = (r: AttemptRow): StoredAttempt => ({
  id: r.id,
  userId: r.user_id,
  instrument: r.instrument,
  sessionId: r.session_id,
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
});

/** Postgres storage in the "progress" schema of the Supabase database. */
export class PostgresProgressRepository implements ProgressRepository {
  constructor(readonly sql: Sql) {}

  static connect(url: string, options: { max?: number } = {}): PostgresProgressRepository {
    return new PostgresProgressRepository(postgres(url, { prepare: false, onnotice: () => {}, ...(options.max ? { max: options.max } : {}) }));
  }

  /** Marks the event handled; false when it already was. */
  private async claim(tx: postgres.TransactionSql, eventId: string, type: string): Promise<boolean> {
    const rows = await tx`insert into progress.processed_events (event_id, type) values (${eventId}, ${type}) on conflict do nothing returning event_id`;
    return rows.length === 1;
  }

  async recordAttempt(eventId: string, a: StoredAttempt, update: (prev: SkillState | undefined) => SkillState): Promise<boolean> {
    return this.sql.begin(async (tx) => {
      if (!(await this.claim(tx, eventId, 'attempt.recorded'))) return false;
      const inserted = await tx`
        insert into progress.attempts
          (id, user_id, instrument, session_id, item_id, item_kind, skill, expected, played, correct, retried, mistake, time_ms, played_at)
        values
          (${a.id}, ${a.userId}, ${a.instrument ?? 'piano'}, ${a.sessionId}, ${a.itemId}, ${a.itemKind}, ${a.skill}, ${tx.array(a.expected)}::int[], ${tx.array(a.played)}::int[],
           ${a.correct}, ${a.retried}, ${a.mistake}, ${a.timeMs}, ${a.playedAt})
        on conflict (id) do nothing
        returning id`;
      if (inserted.length === 0) return false;
      const [row] = await tx<SkillRow[]>`select * from progress.skills where user_id = ${a.userId} and skill = ${a.skill} for update`;
      const s = update(row ? toSkill(row) : undefined);
      await tx`
        insert into progress.skills
          (user_id, instrument, skill, attempts, first_try_correct, recent_times_ms, ease, interval_ms, streak, due_at, last_scheduled_at, updated_at)
        values
          (${s.userId}, ${s.instrument}, ${s.skill}, ${s.attempts}, ${s.firstTryCorrect}, ${tx.array(s.recentTimesMs)}::int[], ${s.ease}, ${s.intervalMs},
           ${s.streak}, ${s.dueAt}, ${s.lastScheduledAt}, now())
        on conflict (user_id, skill) do update set
          attempts = excluded.attempts, first_try_correct = excluded.first_try_correct, recent_times_ms = excluded.recent_times_ms,
          ease = excluded.ease, interval_ms = excluded.interval_ms, streak = excluded.streak, due_at = excluded.due_at,
          last_scheduled_at = excluded.last_scheduled_at, updated_at = now()`;
      return true;
    });
  }

  async recordSessionEnded(eventId: string, ended: SessionEnded, occurredAt: string): Promise<boolean> {
    return this.sql.begin(async (tx) => {
      if (!(await this.claim(tx, eventId, 'session.ended'))) return false;
      if (!ended.refId) return true;
      if (ended.kind === 'lesson') {
        const status = ended.passed === false ? 'in-progress' : 'done';
        // A finished lesson stays finished when it's replayed and not passed.
        await tx`
          insert into progress.lessons (user_id, lesson_id, status, updated_at)
          values (${ended.userId}, ${ended.refId}, ${status}, ${occurredAt})
          on conflict (user_id, lesson_id) do update set
            status = case when progress.lessons.status = 'done' then 'done' else excluded.status end,
            updated_at = excluded.updated_at`;
      } else if (ended.kind === 'checkpoint' && ended.passed) {
        await tx`
          insert into progress.checkpoints (user_id, unit_id, passed_at) values (${ended.userId}, ${ended.refId}, ${occurredAt})
          on conflict do nothing`;
      }
      return true;
    });
  }

  async getSkills(userId: string): Promise<SkillState[]> {
    return (await this.sql<SkillRow[]>`select * from progress.skills where user_id = ${userId}`).map(toSkill);
  }

  async getAttempts(userId: string, from: Date, to: Date): Promise<StoredAttempt[]> {
    const rows = await this.sql<AttemptRow[]>`
      select * from progress.attempts
      where user_id = ${userId} and played_at > ${from.toISOString()} and played_at <= ${to.toISOString()}
      order by played_at`;
    return rows.map(toAttempt);
  }

  async getPracticeDays(userId: string, utcOffsetMinutes: number): Promise<string[]> {
    const rows = await this.sql<{ day: string }[]>`
      select distinct to_char((played_at at time zone 'UTC') + make_interval(mins => ${utcOffsetMinutes}::int), 'YYYY-MM-DD') as day
      from progress.attempts where user_id = ${userId} order by day`;
    return rows.map((r) => r.day);
  }

  async getCompletions(userId: string): Promise<Completions> {
    const lessons = await this.sql<{ lesson_id: string; status: string }[]>`select lesson_id, status from progress.lessons where user_id = ${userId}`;
    const checkpoints = await this.sql<{ unit_id: string }[]>`select unit_id from progress.checkpoints where user_id = ${userId}`;
    return {
      lessonsStarted: new Set(lessons.filter((l) => l.status === 'in-progress').map((l) => l.lesson_id)),
      lessonsDone: new Set(lessons.filter((l) => l.status === 'done').map((l) => l.lesson_id)),
      checkpointsPassed: new Set(checkpoints.map((c) => c.unit_id)),
    };
  }

  async close(): Promise<void> {
    await this.sql.end();
  }
}
