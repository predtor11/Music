import { randomUUID } from 'node:crypto';
import { AttemptRecordedEventSchema, NextItemSchema, SessionEndedEventSchema, SessionSchema, StoredAttemptSchema, TestItemSchema, type TestItem } from '@music/contracts';
import { InMemoryEventBus } from '@music/service-kit';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { InMemoryPracticeRepository, type PracticeRepository } from '../src/repository.js';
import { StubCurriculum } from './fixtures.js';

type RepoFactory = () => Promise<PracticeRepository>;

const factories: Array<[string, RepoFactory]> = [['in memory', async () => new InMemoryPracticeRepository()]];

// Runs the same flow against Postgres when a throwaway database is given.
const testDbUrl = process.env.PRACTICE_TEST_DB_URL;
if (testDbUrl) {
  factories.push([
    'postgres',
    async () => {
      const { PostgresPracticeRepository } = await import('../src/postgres.js');
      return PostgresPracticeRepository.connect(testDbUrl);
    },
  ]);
}

describe.each(factories)('session flow (%s)', (_name, makeRepo) => {
  const userId = randomUUID();
  const headers = { 'x-user-id': userId };
  let repo: PracticeRepository;
  let bus: InMemoryEventBus;
  let curriculum: StubCurriculum;
  let app: ReturnType<typeof buildApp>;
  const repos: PracticeRepository[] = [];

  beforeEach(async () => {
    repo = await makeRepo();
    repos.push(repo);
    bus = new InMemoryEventBus();
    curriculum = new StubCurriculum();
    app = buildApp({ repo, bus, curriculum, logger: false });
  });

  afterAll(async () => {
    for (const r of repos) await r.close();
  });

  async function start(kind: string, refId?: string, as = headers) {
    return app.inject({ method: 'POST', url: '/sessions', headers: as, payload: { kind, refId } });
  }

  async function next(sessionId: string): Promise<TestItem | null> {
    const res = await app.inject({ url: `/sessions/${sessionId}/next-item`, headers });
    expect(res.statusCode).toBe(200);
    const body = NextItemSchema.parse(res.json());
    return body === null ? null : TestItemSchema.parse(body);
  }

  function attempt(sessionId: string, itemId: string, correct: boolean, extra: Record<string, unknown> = {}) {
    return app.inject({
      method: 'POST',
      url: '/attempts',
      headers,
      payload: {
        sessionId,
        itemId,
        itemKind: 'find-note',
        skill: 'note:find',
        expected: [60],
        played: correct ? [60] : [62],
        correct,
        mistake: correct ? null : 'wrong-note',
        timeMs: 1200,
        playedAt: '2026-10-08T06:30:00.000Z',
        ...extra,
      },
    });
  }

  it('runs a checkpoint from start to a pass', async () => {
    const res = await start('checkpoint', 'u1');
    expect(res.statusCode).toBe(201);
    const session = SessionSchema.parse(res.json());
    expect(session).toMatchObject({ userId, kind: 'checkpoint', refId: 'u1', endedAt: null });
    expect(curriculum.calls).toEqual(['unit:u1']);

    // Three of four right first time is 75%, exactly the unit's pass mark.
    const answers: Record<string, boolean> = { 'cp-c': true, 'cp-d': true, 'cp-e': false, 'cp-f': true };
    const asked: string[] = [];
    for (let item = await next(session.id); item; item = await next(session.id)) {
      asked.push(item.id);
      const recorded = await attempt(session.id, item.id, answers[item.id]!);
      expect(recorded.statusCode).toBe(201);
      expect(StoredAttemptSchema.parse(recorded.json())).toMatchObject({ itemId: item.id, userId });
    }
    expect(asked).toEqual(['cp-c', 'cp-d', 'cp-e', 'cp-f']);

    const recordedEvents = bus.published.filter((e) => e.type === 'attempt.recorded');
    expect(recordedEvents).toHaveLength(4);
    for (const e of recordedEvents) AttemptRecordedEventSchema.parse(e);

    const end = await app.inject({ method: 'POST', url: `/sessions/${session.id}/end`, headers });
    expect(end.statusCode).toBe(200);
    expect(end.json().summary).toEqual({ total: 4, answered: 4, firstTryCorrect: 3, accuracy: 75, passed: true });
    expect(end.json().session.endedAt).not.toBeNull();

    const ended = bus.published.filter((e) => e.type === 'session.ended');
    expect(ended).toHaveLength(1);
    expect(SessionEndedEventSchema.parse(ended[0]).data).toEqual({ sessionId: session.id, userId, kind: 'checkpoint', refId: 'u1', passed: true });
  });

  it('fails a checkpoint below the pass mark, counting retries and skipped items as wrong', async () => {
    const session = (await start('checkpoint', 'u1')).json();
    await attempt(session.id, 'cp-c', true);
    await attempt(session.id, 'cp-d', true, { retried: true });
    await attempt(session.id, 'cp-e', true);
    // cp-f never answered.
    const end = await app.inject({ method: 'POST', url: `/sessions/${session.id}/end`, headers });
    expect(end.json().summary).toEqual({ total: 4, answered: 3, firstTryCorrect: 2, accuracy: 50, passed: false });
    expect(bus.published.at(-1)).toMatchObject({ type: 'session.ended', data: { passed: false } });
  });

  it('scores on the first attempt when an item is answered twice', async () => {
    const session = (await start('checkpoint', 'u1')).json();
    await attempt(session.id, 'cp-c', false);
    expect((await next(session.id))?.id).toBe('cp-d');
    await attempt(session.id, 'cp-c', true);
    const end = await app.inject({ method: 'POST', url: `/sessions/${session.id}/end`, headers });
    expect(end.json().summary.firstTryCorrect).toBe(0);
  });

  it('takes lesson items from play-along and quiz steps, graded at 80%', async () => {
    const session = (await start('lesson', 'u1-l1')).json();
    expect(curriculum.calls).toEqual(['lesson:u1-l1']);
    const ids: string[] = [];
    for (let item = await next(session.id); item; item = await next(session.id)) {
      ids.push(item.id);
      await attempt(session.id, item.id, true);
    }
    expect(ids).toEqual(['pa-c', 'q-c', 'q-g']);
    const end = await app.inject({ method: 'POST', url: `/sessions/${session.id}/end`, headers });
    expect(end.json().summary).toMatchObject({ firstTryCorrect: 3, passed: true });
  });

  it('runs a free session with no items and no grade', async () => {
    const session = (await start('free')).json();
    expect(curriculum.calls).toEqual([]);
    expect(await next(session.id)).toBeNull();
    expect((await attempt(session.id, 'anything', true)).statusCode).toBe(201);
    const end = await app.inject({ method: 'POST', url: `/sessions/${session.id}/end`, headers });
    expect(end.json().summary).toMatchObject({ total: 0, accuracy: null, passed: null });
    expect(bus.published.at(-1)).toMatchObject({ type: 'session.ended', data: { kind: 'free', refId: null, passed: null } });
  });

  it('publishes session.ended once when ended twice, and refuses attempts after the end', async () => {
    const session = (await start('checkpoint', 'u1')).json();
    await app.inject({ method: 'POST', url: `/sessions/${session.id}/end`, headers });
    const again = await app.inject({ method: 'POST', url: `/sessions/${session.id}/end`, headers });
    expect(again.statusCode).toBe(200);
    expect(again.json().summary.passed).toBe(false);
    expect(bus.published.filter((e) => e.type === 'session.ended')).toHaveLength(1);
    expect((await attempt(session.id, 'cp-c', true)).statusCode).toBe(409);
    expect(await next(session.id)).toBeNull();
  });

  it('rejects bad requests', async () => {
    expect((await app.inject({ method: 'POST', url: '/sessions', payload: { kind: 'free' } })).statusCode).toBe(401);
    expect((await start('quiz')).statusCode).toBe(400);
    expect((await start('lesson')).statusCode).toBe(400);
    expect((await start('lesson', 'nope')).statusCode).toBe(404);
    expect((await start('checkpoint', 'nope')).statusCode).toBe(404);

    const session = (await start('checkpoint', 'u1')).json();
    expect((await attempt(session.id, 'not-in-session', true)).statusCode).toBe(400);
    expect((await attempt(session.id, 'cp-c', true, { timeMs: -1 })).statusCode).toBe(400);
    expect((await attempt(randomUUID(), 'cp-c', true)).statusCode).toBe(404);
    expect((await app.inject({ url: '/sessions/not-a-uuid/next-item', headers })).statusCode).toBe(400);
    expect(bus.published).toHaveLength(0);
  });

  it("hides other users' sessions", async () => {
    const session = (await start('free')).json();
    const other = { 'x-user-id': randomUUID() };
    expect((await app.inject({ url: `/sessions/${session.id}`, headers: other })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/sessions/${session.id}/end`, headers: other })).statusCode).toBe(404);
    expect((await app.inject({ url: `/sessions/${session.id}`, headers })).json()).toMatchObject({ id: session.id });
  });
});
