import { ProgressReportSchema, ProgressSchema, ReviewQueueSchema, type MusicEvent, type StoredAttempt } from '@music/contracts';
import { InMemoryEventBus } from '@music/service-kit';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { CurriculumCatalog, StaticCatalog } from '../src/catalog.js';
import { IST, USER, WEEK_END, realisticWeek, weekBefore } from './fixtures.js';

const UNITS = [
  { id: 'u1', order: 1, lessonIds: ['u1-l1', 'u1-l2'] },
  { id: 'u2', order: 2, lessonIds: ['u2-l1'] },
];
const headers = { 'x-user-id': USER };

const attemptEvent = (a: StoredAttempt): MusicEvent => ({ id: randomUUID(), type: 'attempt.recorded', occurredAt: a.playedAt, source: 'practice', data: a });
const endedEvent = (kind: string, refId: string, passed: boolean | null): MusicEvent => ({
  id: randomUUID(),
  type: 'session.ended',
  occurredAt: '2026-10-11T17:00:00.000Z',
  source: 'practice',
  data: { sessionId: randomUUID(), userId: USER, kind, refId, passed },
});

describe('progress service', () => {
  const bus = new InMemoryEventBus();
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp({ logger: false, bus, catalog: new StaticCatalog(UNITS), now: () => WEEK_END });
    for (const a of [...weekBefore(), ...realisticWeek()]) {
      const e = attemptEvent(a);
      await bus.publish(e);
      await bus.publish(e); // redelivered
    }
  });
  afterAll(() => app.close());

  it('needs a signed-in user', async () => {
    expect((await app.inject({ url: '/' })).statusCode).toBe(401);
  });

  it('unlocks lessons and the next unit from session.ended', async () => {
    const before = ProgressSchema.parse((await app.inject({ url: '/', headers })).json());
    expect(before.units.map((u) => u.unlocked)).toEqual([true, false]);

    await bus.publish(endedEvent('lesson', 'u1-l1', true));
    await bus.publish(endedEvent('lesson', 'u1-l2', false));
    let p = ProgressSchema.parse((await app.inject({ url: '/', headers })).json());
    expect(p.units[0]!.lessons.map((l) => l.status)).toEqual(['done', 'in-progress']);

    await bus.publish(endedEvent('lesson', 'u1-l2', true));
    await bus.publish(endedEvent('checkpoint', 'u1', true));
    p = ProgressSchema.parse((await app.inject({ url: '/', headers })).json());
    expect(p.units[1]).toEqual({ unitId: 'u2', unlocked: true, checkpointPassed: false, lessons: [{ lessonId: 'u2-l1', status: 'available' }] });
  });

  it('keeps piano reports apart from guitar', async () => {
    const guitar = await app.inject({ url: `/reports/weekly?tzOffset=${IST}&instrument=guitar`, headers });
    expect(guitar.statusCode).toBe(200);
    expect(ProgressReportSchema.parse(guitar.json()).accuracyTrend).toEqual([]);
    expect((await app.inject({ url: '/review-queue?instrument=guitar', headers })).json()).toEqual([]);
    expect((await app.inject({ url: '/?instrument=nope', headers })).statusCode).toBe(400);
  });

  it('serves the review queue', async () => {
    const res = await app.inject({ url: '/review-queue', headers });
    const queue = ReviewQueueSchema.parse(res.json());
    // Skills missed in the last session are due; everything right on Sunday is not.
    expect(queue.every((s) => Date.parse(s.dueAt!) <= WEEK_END.getTime())).toBe(true);
    expect(queue.map((s) => s.dueAt)).toEqual([...queue.map((s) => s.dueAt)].sort());
  });

  it('serves the weekly report, counting each redelivered attempt once', async () => {
    const res = await app.inject({ url: `/reports/weekly?tzOffset=${IST}`, headers });
    expect(res.statusCode).toBe(200);
    const report = ProgressReportSchema.parse(res.json());
    expect(report.practice).toMatchObject({ sessions: 7, streakDays: 3 });
    expect(report.accuracyTrend.reduce((n, p) => n + p.attempts, 0)).toBe(realisticWeek().length);
    expect(report.patterns[0]!.id).toBe('interval-mixup:m3-M3');
    expect(report.suggestions.length).toBeGreaterThanOrEqual(2);
    expect(report.suggestions.some((s) => s.lessonId === 'u2-l1')).toBe(true);
  });

  it('reports on an earlier week with ?to=', async () => {
    const report = ProgressReportSchema.parse((await app.inject({ url: '/reports/weekly?to=2026-10-04T18:00:00.000Z', headers })).json());
    expect(report.practice.sessions).toBe(3);
  });

  it('rejects a bad query', async () => {
    expect((await app.inject({ url: '/reports/weekly?to=yesterday', headers })).statusCode).toBe(400);
  });
});

describe('curriculum catalog', () => {
  it('reads units from the curriculum service and keeps the last good copy', async () => {
    let up = true;
    const fetchFn = (async () => {
      if (!up) throw new Error('down');
      return new Response(JSON.stringify([{ id: 'u1', order: 1, title: 'Notes', summary: '', outcome: '', lessonIds: ['a'] }]));
    }) as typeof fetch;
    const catalog = new CurriculumCatalog('http://curriculum', 0, fetchFn);
    expect(await catalog.units()).toEqual([{ id: 'u1', order: 1, lessonIds: ['a'] }]);
    up = false;
    expect(await catalog.units()).toEqual([{ id: 'u1', order: 1, lessonIds: ['a'] }]);
  });

  it('answers 503 when the curriculum service was never reachable', async () => {
    const catalog = new CurriculumCatalog('http://curriculum', 0, (async () => { throw new Error('down'); }) as typeof fetch);
    await expect(catalog.units()).rejects.toMatchObject({ statusCode: 503 });
  });
});
