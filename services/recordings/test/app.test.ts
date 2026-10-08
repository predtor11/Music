import { describe, expect, it } from 'vitest';
import { RecordingListSchema, RecordingSchema } from '@music/contracts';
import { buildApp } from '../src/app.js';

const USER = '3e1f0c2a-5b6d-4e7f-8a9b-0c1d2e3f4a5b';
const OTHER = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const headers = { 'x-user-id': USER };

const TAKE = {
  notes: [
    { midi: 55, start: 0, dur: 900, velocity: 90 },
    { midi: 59, start: 0, dur: 900, velocity: 90 },
    { midi: 62, start: 0, dur: 900, velocity: 90 },
  ],
  pedal: [{ at: 0, down: true }, { at: 950, down: false }],
  durationMs: 1200,
};

function app() {
  let t = Date.parse('2026-10-08T12:00:00.000Z');
  return buildApp({ logger: false, now: () => new Date((t += 1000)) });
}

describe('recordings service', () => {
  it('saves, lists newest first, reads, updates and deletes a take', async () => {
    const a = app();
    const first = await a.inject({ method: 'POST', url: '/takes', headers, payload: { title: 'Evening jam', take: TAKE } });
    expect(first.statusCode).toBe(201);
    const saved = RecordingSchema.parse(first.json());
    expect(saved).toMatchObject({ title: 'Evening jam', source: 'played', noteCount: 3, durationMs: 1200, keyOverride: null, corrections: [] });
    await a.inject({ method: 'POST', url: '/takes', headers, payload: { title: 'Imported', source: 'imported', take: TAKE } });

    const list = RecordingListSchema.parse((await a.inject({ url: '/takes', headers })).json());
    expect(list.map((r) => r.title)).toEqual(['Imported', 'Evening jam']);
    expect(list[0]).not.toHaveProperty('take');

    expect((await a.inject({ url: `/takes/${saved.id}`, headers })).json().take).toEqual(TAKE);

    const patched = await a.inject({
      method: 'PATCH',
      url: `/takes/${saved.id}`,
      headers,
      payload: { title: 'Sunday jam', keyOverride: 'G', corrections: [{ at: 100, rootPc: 7, quality: 'major' }] },
    });
    expect(patched.json()).toMatchObject({ title: 'Sunday jam', keyOverride: 'G', corrections: [{ at: 100, rootPc: 7, quality: 'major' }] });
    expect(patched.json().updatedAt > saved.updatedAt).toBe(true);

    expect((await a.inject({ method: 'DELETE', url: `/takes/${saved.id}`, headers })).statusCode).toBe(204);
    expect((await a.inject({ url: `/takes/${saved.id}`, headers })).statusCode).toBe(404);
  });

  it("keeps each person's recordings to themselves", async () => {
    const a = app();
    const saved = (await a.inject({ method: 'POST', url: '/takes', headers, payload: { title: 'Mine', take: TAKE } })).json();
    const other = { 'x-user-id': OTHER };
    expect((await a.inject({ url: '/takes', headers: other })).json()).toEqual([]);
    expect((await a.inject({ url: `/takes/${saved.id}`, headers: other })).statusCode).toBe(404);
    expect((await a.inject({ method: 'PATCH', url: `/takes/${saved.id}`, headers: other, payload: { title: 'x' } })).statusCode).toBe(404);
    expect((await a.inject({ method: 'DELETE', url: `/takes/${saved.id}`, headers: other })).statusCode).toBe(404);
  });

  it('needs a signed-in user and a valid body', async () => {
    const a = app();
    expect((await a.inject({ url: '/takes' })).statusCode).toBe(401);
    expect((await a.inject({ method: 'POST', url: '/takes', headers, payload: { title: '', take: TAKE } })).statusCode).toBe(400);
    const badNote = { ...TAKE, notes: [{ midi: 200, start: 0, dur: 1, velocity: 1 }] };
    expect((await a.inject({ method: 'POST', url: '/takes', headers, payload: { title: 'x', take: badNote } })).statusCode).toBe(400);
    expect((await a.inject({ url: '/takes/not-a-uuid', headers })).statusCode).toBe(404);
  });

  it('accepts a long take (more than the 1 MB default body)', async () => {
    const notes = Array.from({ length: 30_000 }, (_, i) => ({ midi: 40 + (i % 40), start: i * 100, dur: 90, velocity: 64 }));
    const res = await buildApp({ logger: false }).inject({
      method: 'POST',
      url: '/takes',
      headers,
      payload: { title: 'Long', take: { notes, pedal: [], durationMs: 3_000_100 } },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().noteCount).toBe(30_000);
  });
});
