import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';
import { UserSettingsSchema } from '@music/contracts';
import { InMemoryEventBus } from '@music/service-kit';
import { buildApp } from '../src/app.js';
import { PostgresProfileStore } from '../src/postgres-store.js';

/**
 * Runs against a real Postgres when IDENTITY_TEST_DB_URL is set (it drops and
 * recreates the `identity` schema, so never point it at Supabase). Skipped otherwise.
 */
const url = process.env.IDENTITY_TEST_DB_URL;
const USER = '3e1f0c2a-5b6d-4e7f-8a9b-0c1d2e3f4a5b';

describe.skipIf(!url)('PostgresProfileStore', () => {
  let store: PostgresProfileStore;

  beforeAll(async () => {
    const sql = postgres(url!, { onnotice: () => {} });
    await sql`drop schema if exists identity cascade`;
    await sql.end();
    store = await PostgresProfileStore.connect(url!);
  });

  afterAll(async () => {
    await store?.close();
  });

  it('creates once, merges settings and publishes one event through the app', async () => {
    const bus = new InMemoryEventBus();
    const app = buildApp({ logger: false, store, bus });
    const headers = { 'x-user-id': USER };
    const [a, b] = await Promise.all([app.inject({ url: '/me', headers }), app.inject({ url: '/me', headers })]);
    expect(a.json()).toEqual(b.json());
    expect(a.json().settings).toEqual(UserSettingsSchema.parse({}));
    expect(bus.published).toHaveLength(1);

    await app.inject({ method: 'PATCH', url: '/me/settings', headers, payload: { noteNaming: 'both', keyboardSize: 88 } });
    await app.inject({ method: 'PATCH', url: '/me/settings', headers, payload: { currentKey: 'F#m' } });
    expect((await app.inject({ url: '/me', headers })).json().settings).toEqual({
      ...UserSettingsSchema.parse({}),
      noteNaming: 'both',
      keyboardSize: 88,
      currentKey: 'F#m',
    });
  });

  it('runs migrations only once', async () => {
    const again = await PostgresProfileStore.connect(url!);
    expect(await again.get(USER)).not.toBeNull();
    await again.close();
  });

  it('returns null when updating a missing profile', async () => {
    expect(await store.updateSettings('00000000-0000-4000-8000-000000000000', { currentKey: 'G' })).toBeNull();
  });
});
