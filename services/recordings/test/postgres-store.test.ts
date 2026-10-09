import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { buildApp } from '../src/app.js';
import { PostgresRecordingStore } from '../src/postgres-store.js';

/**
 * Runs against a real Postgres when RECORDINGS_TEST_DB_URL is set (it drops and
 * recreates the `recordings` schema, so never point it at Supabase). Skipped otherwise.
 */
const url = process.env.RECORDINGS_TEST_DB_URL;
const USER = '3e1f0c2a-5b6d-4e7f-8a9b-0c1d2e3f4a5b';

describe.skipIf(!url)('PostgresRecordingStore', () => {
  let store: PostgresRecordingStore;

  beforeAll(async () => {
    const sql = postgres(url!, { onnotice: () => {} });
    await sql`drop schema if exists recordings cascade`;
    await sql.end();
    store = await PostgresRecordingStore.connect(url!);
  });

  afterAll(async () => {
    await store?.close();
  });

  it('stores, updates and deletes through the app', async () => {
    const app = buildApp({ logger: false, store });
    const headers = { 'x-user-id': USER };
    const take = { notes: [{ midi: 60, velocity: 80, startMs: 0, durationMs: 500 }], pedal: [], durationMs: 700 };
    const saved = (await app.inject({ method: 'POST', url: '/takes', headers, payload: { title: 'A', take } })).json();
    expect((await app.inject({ url: '/takes', headers })).json()).toHaveLength(1);
    expect((await app.inject({ url: `/takes/${saved.id}`, headers })).json().take).toEqual(take);
    const patched = await app.inject({ method: 'PATCH', url: `/takes/${saved.id}`, headers, payload: { corrections: [{ atMs: 10, rootPc: null, quality: null }] } });
    expect(patched.json().corrections).toEqual([{ atMs: 10, rootPc: null, quality: null }]);
    expect((await app.inject({ method: 'DELETE', url: `/takes/${saved.id}`, headers })).statusCode).toBe(204);
  });
});
