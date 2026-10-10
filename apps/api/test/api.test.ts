import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApi } from '../src/compose.js';

let api: Awaited<ReturnType<typeof createApi>>;
beforeAll(async () => {
  api = await createApi({ devMode: true, publicSupabaseUrl: 'https://s.example', publicSupabaseAnonKey: 'pub' });
});
afterAll(async () => api.close());

async function call(method: string, url: string, body?: unknown) {
  const res = await api.handle({
    method,
    url,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = res.body.toString('utf8');
  return { status: res.status, json: text ? (JSON.parse(text) as any) : null };
}

describe('serverless api', () => {
  it('answers health and unknown paths', async () => {
    expect((await call('GET', '/api/health')).json.status).toBe('ok');
    expect((await call('GET', '/api/nope')).status).toBe(404);
  });

  it('never lets personal answers be cached, and always sends nosniff', async () => {
    const me = await api.handle({ method: 'GET', url: '/api/identity/me', headers: {} });
    expect(me.headers['cache-control']).toBe('private, no-store');
    expect(me.headers['x-content-type-options']).toBe('nosniff');
    const units = await api.handle({ method: 'GET', url: '/api/curriculum/units', headers: {} });
    expect(units.headers['cache-control']).toBeUndefined();
    expect((await api.handle({ method: 'GET', url: '/api/health', headers: {} })).headers['x-content-type-options']).toBe('nosniff');
  });

  it('hands out only the public sign-in settings', async () => {
    expect((await call('GET', '/api/config')).json).toEqual({ supabaseUrl: 'https://s.example', supabaseAnonKey: 'pub' });
  });

  it('serves every service in one process', async () => {
    const units = await call('GET', '/api/curriculum/units');
    expect(units.status).toBe(200);
    expect(units.json.length).toBeGreaterThan(0);
    expect((await call('GET', '/api/identity/me')).json.displayName).toBe('Pianist');
    expect((await call('GET', '/api/progress')).status).toBe(200);
    expect((await call('GET', '/api/recordings/takes')).status).toBe(200);
    expect((await call('GET', '/api/theory/health')).status).toBe(200);
  });

  it('opens the first unit of each instrument from the start', async () => {
    const piano = (await call('GET', '/api/progress')).json;
    expect(piano.units[0].unlocked).toBe(true);
    const guitar = (await call('GET', '/api/progress?instrument=guitar')).json;
    expect(guitar.units.map((u: any) => u.unitId)).toEqual(['guitar-1']);
    expect(guitar.units[0].unlocked).toBe(true);
    expect(guitar.units[0].lessons[0].status).toBe('available');
  });

  it('records a lesson, scores it into progress, and is safe to repeat', async () => {
    const lessonId = (await call('GET', '/api/curriculum/units')).json[0].lessonIds[0] as string;
    const lesson = (await call('GET', `/api/curriculum/lessons/${lessonId}`)).json;
    const sessionId = randomUUID();
    const body = { id: sessionId, kind: 'lesson', refId: lessonId };
    const first = await call('POST', '/api/practice/sessions', body);
    expect(first.status).toBe(201);
    expect(first.json.id).toBe(sessionId);
    // The same id again is the same session, not a second one.
    const again = await call('POST', '/api/practice/sessions', body);
    expect(again.json.id).toBe(sessionId);

    const item = lesson.steps.flatMap((s: any) => s.items ?? [])[0];
    const attempt = {
      id: randomUUID(),
      sessionId,
      itemId: item.id,
      itemKind: item.kind,
      skill: item.skill ?? 'test:skill',
      expected: [60],
      played: [60],
      correct: true,
      timeMs: 900,
      playedAt: new Date().toISOString(),
    };
    expect((await call('POST', '/api/practice/attempts', attempt)).status).toBe(201);
    expect((await call('POST', '/api/practice/attempts', attempt)).status).toBe(200);

    const ended = await call('POST', `/api/practice/sessions/${sessionId}/end`, {});
    expect(ended.status).toBe(200);
    // A retry that arrives after the session ended is still fine.
    expect((await call('POST', '/api/practice/attempts', attempt)).status).toBe(200);
    expect((await call('POST', `/api/practice/sessions/${sessionId}/end`, {})).status).toBe(200);

    const report = await call('GET', '/api/progress/reports/weekly');
    expect(report.status).toBe(200);
    expect(JSON.stringify(report.json)).toContain(attempt.skill);
  });

  it('refuses to start without a way to check logins', async () => {
    await expect(createApi({})).rejects.toThrow(/SUPABASE_URL/);
  });
});
