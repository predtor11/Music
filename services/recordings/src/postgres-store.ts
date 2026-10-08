import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { ChordCorrectionSchema, TakeSchema, type Recording, type RecordingSummary, type UpdateRecording } from '@music/contracts';
import type { RecordingStore } from './store.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations/', import.meta.url));

interface SummaryRow {
  id: string;
  title: string;
  source: 'played' | 'imported';
  duration_ms: number;
  note_count: number;
  key_override: string | null;
  created_at: Date;
  updated_at: Date;
}

interface FullRow extends SummaryRow {
  take: unknown;
  corrections: unknown;
}

const toSummary = (row: SummaryRow): RecordingSummary => ({
  id: row.id,
  title: row.title,
  source: row.source,
  durationMs: row.duration_ms,
  noteCount: row.note_count,
  keyOverride: row.key_override,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});

const toRecording = (row: FullRow): Recording => ({
  ...toSummary(row),
  take: TakeSchema.parse(row.take),
  corrections: ChordCorrectionSchema.array().parse(row.corrections ?? []),
});

/** Recordings in the `recordings` schema of the Supabase Postgres database. */
export class PostgresRecordingStore implements RecordingStore {
  private constructor(private readonly sql: postgres.Sql) {}

  static async connect(url: string): Promise<PostgresRecordingStore> {
    const sql = postgres(url, { onnotice: () => {} });
    await migrate(sql);
    return new PostgresRecordingStore(sql);
  }

  async list(userId: string): Promise<RecordingSummary[]> {
    const rows = await this.sql<SummaryRow[]>`
      select id, title, source, duration_ms, note_count, key_override, created_at, updated_at
      from recordings.takes where user_id = ${userId} order by created_at desc`;
    return rows.map(toSummary);
  }

  async get(userId: string, id: string): Promise<Recording | null> {
    const [row] = await this.sql<FullRow[]>`
      select * from recordings.takes where user_id = ${userId} and id = ${id}`;
    return row ? toRecording(row) : null;
  }

  async create(userId: string, r: Recording): Promise<Recording> {
    const [row] = await this.sql<FullRow[]>`
      insert into recordings.takes (id, user_id, title, source, duration_ms, note_count, key_override, take, corrections, created_at, updated_at)
      values (${r.id}, ${userId}, ${r.title}, ${r.source}, ${r.durationMs}, ${r.noteCount}, ${r.keyOverride},
              ${this.sql.json(r.take)}, ${this.sql.json(r.corrections)}, ${r.createdAt}, ${r.updatedAt})
      returning *`;
    return toRecording(row!);
  }

  async update(userId: string, id: string, patch: UpdateRecording, updatedAt: string): Promise<Recording | null> {
    const existing = await this.get(userId, id);
    if (!existing) return null;
    const next = { ...existing, ...patch };
    const [row] = await this.sql<FullRow[]>`
      update recordings.takes
      set title = ${next.title}, key_override = ${next.keyOverride}, corrections = ${this.sql.json(next.corrections)}, updated_at = ${updatedAt}
      where user_id = ${userId} and id = ${id}
      returning *`;
    return row ? toRecording(row) : null;
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const rows = await this.sql`delete from recordings.takes where user_id = ${userId} and id = ${id} returning id`;
    return rows.length > 0;
  }

  async count(userId: string): Promise<number> {
    const [row] = await this.sql<{ n: number }[]>`select count(*)::int as n from recordings.takes where user_id = ${userId}`;
    return row?.n ?? 0;
  }

  async close(): Promise<void> {
    await this.sql.end();
  }
}

/** Applies migrations/*.sql in name order, once each, recorded in recordings.schema_migrations. */
export async function migrate(sql: postgres.Sql): Promise<void> {
  await sql`create schema if not exists recordings`;
  await sql`create table if not exists recordings.schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
  const applied = new Set((await sql<{ name: string }[]>`select name from recordings.schema_migrations`).map((r) => r.name));
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const body = await readFile(MIGRATIONS_DIR + file, 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into recordings.schema_migrations (name) values (${file})`;
    });
  }
}
