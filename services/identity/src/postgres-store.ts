import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import type { UpdateSettings, User } from '@music/contracts';
import { readSettings, type ProfileStore } from './store.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations/', import.meta.url));

interface ProfileRow {
  id: string;
  display_name: string;
  settings: unknown;
  created_at: Date;
}

function toUser(row: ProfileRow): User {
  return {
    id: row.id,
    displayName: row.display_name,
    createdAt: row.created_at.toISOString(),
    settings: readSettings(row.settings),
  };
}

/** Profiles in the `identity` schema of the Supabase Postgres database. */
export class PostgresProfileStore implements ProfileStore {
  private constructor(private readonly sql: postgres.Sql) {}

  static async connect(url: string, options: { migrate?: boolean; max?: number } = {}): Promise<PostgresProfileStore> {
    const sql = postgres(url, { prepare: false, onnotice: () => {}, ...(options.max ? { max: options.max } : {}) });
    if (options.migrate !== false) await migrate(sql);
    return new PostgresProfileStore(sql);
  }

  async get(userId: string): Promise<User | null> {
    const [row] = await this.sql<ProfileRow[]>`
      select id, display_name, settings, created_at from identity.profiles where id = ${userId}`;
    return row ? toUser(row) : null;
  }

  async create(user: User): Promise<{ user: User; created: boolean }> {
    const [row] = await this.sql<ProfileRow[]>`
      insert into identity.profiles (id, display_name, settings, created_at)
      values (${user.id}, ${user.displayName}, ${this.sql.json(user.settings)}, ${user.createdAt})
      on conflict (id) do nothing
      returning id, display_name, settings, created_at`;
    if (row) return { user: toUser(row), created: true };
    const existing = await this.get(user.id);
    if (!existing) throw new Error(`profile ${user.id} vanished during create`);
    return { user: existing, created: false };
  }

  async updateSettings(userId: string, patch: UpdateSettings): Promise<User | null> {
    // jsonb `||` merges at the top level, which is what a partial settings patch means.
    const [row] = await this.sql<ProfileRow[]>`
      update identity.profiles
      set settings = settings || ${this.sql.json(patch)}, updated_at = now()
      where id = ${userId}
      returning id, display_name, settings, created_at`;
    return row ? toUser(row) : null;
  }

  async close(): Promise<void> {
    await this.sql.end();
  }
}

/** Applies migrations/*.sql in name order, once each, recorded in identity.schema_migrations. */
export async function migrate(sql: postgres.Sql): Promise<void> {
  await sql`create schema if not exists identity`;
  await sql`create table if not exists identity.schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
  const applied = new Set((await sql<{ name: string }[]>`select name from identity.schema_migrations`).map((r) => r.name));
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const body = await readFile(MIGRATIONS_DIR + file, 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into identity.schema_migrations (name) values (${file})`;
    });
  }
}
