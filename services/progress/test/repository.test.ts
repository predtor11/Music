import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate, PostgresProgressRepository } from '../src/postgres.js';
import { InMemoryProgressRepository, type ProgressRepository } from '../src/repository.js';
import { applyAttempt } from '../src/skills.js';
import { IST, USER, items, realisticWeek, session } from './fixtures.js';

/** The same checks for both storage versions. */
function repositoryContract(name: string, make: () => Promise<ProgressRepository>) {
  describe(name, () => {
    let repo: ProgressRepository;
    beforeAll(async () => {
      repo = await make();
    });

    it('stores an attempt and its skill once, however often the event arrives', async () => {
      const [a] = session('2026-10-01T10:00:00Z', [items.M3()]);
      const eventId = randomUUID();
      expect(await repo.recordAttempt(eventId, a!, (prev) => applyAttempt(prev, a!))).toBe(true);
      expect(await repo.recordAttempt(eventId, a!, (prev) => applyAttempt(prev, a!))).toBe(false);
      // A new event id carrying the same attempt is still a duplicate.
      expect(await repo.recordAttempt(randomUUID(), a!, (prev) => applyAttempt(prev, a!))).toBe(false);
      const [skill] = await repo.getSkills(USER);
      expect(skill).toMatchObject({ skill: 'interval:M3', attempts: 1, firstTryCorrect: 1, streak: 1, dueAt: '2026-10-02T10:00:00.000Z' });
      expect(await repo.getAttempts(USER, new Date('2026-10-01T00:00:00Z'), new Date('2026-10-02T00:00:00Z'))).toEqual([a]);
    });

    it('keeps a full week and returns it in time order', async () => {
      const week = realisticWeek();
      for (const a of week) await repo.recordAttempt(randomUUID(), a, (prev) => applyAttempt(prev, a));
      const got = await repo.getAttempts(USER, new Date('2026-10-04T18:00:00Z'), new Date('2026-10-11T18:00:00Z'));
      expect(got).toHaveLength(week.length);
      expect(got.map((a) => a.playedAt)).toEqual([...got.map((a) => a.playedAt)].sort());
      const skills = await repo.getSkills(USER);
      expect(skills.find((s) => s.skill === 'interval:M3')!.attempts).toBe(1 + week.filter((a) => a.skill === 'interval:M3').length);
    });

    it('lists practice days in local time', async () => {
      const days = await repo.getPracticeDays(USER, IST);
      expect(days).toEqual(['2026-10-01', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-09', '2026-10-10', '2026-10-11']);
      expect(await repo.getPracticeDays(randomUUID(), IST)).toEqual([]);
    });

    it('records lessons and checkpoints, and never undoes a finished lesson', async () => {
      const user = randomUUID();
      const end = (kind: string, refId: string, passed: boolean | null) =>
        repo.recordSessionEnded(randomUUID(), { sessionId: randomUUID(), userId: user, kind, refId, passed }, '2026-10-05T10:00:00.000Z');
      await end('lesson', 'l1', true);
      await end('lesson', 'l1', false);
      await end('lesson', 'l2', false);
      await end('lesson', 'l3', null);
      await end('checkpoint', 'u1', false);
      await end('checkpoint', 'u2', true);
      await end('review', 'x', true);
      const c = await repo.getCompletions(user);
      expect([...c.lessonsDone].sort()).toEqual(['l1', 'l3']);
      expect([...c.lessonsStarted]).toEqual(['l2']);
      expect([...c.checkpointsPassed]).toEqual(['u2']);
    });

    it('ignores a repeated session.ended', async () => {
      const id = randomUUID();
      const data = { sessionId: randomUUID(), userId: randomUUID(), kind: 'lesson', refId: 'l1', passed: true };
      expect(await repo.recordSessionEnded(id, data, '2026-10-05T10:00:00.000Z')).toBe(true);
      expect(await repo.recordSessionEnded(id, data, '2026-10-05T10:00:00.000Z')).toBe(false);
    });
  });
}

repositoryContract('in-memory repository', async () => new InMemoryProgressRepository());

// Real Postgres SQL, run on PGlite (Postgres compiled to WASM) behind a local socket.
let server: PGLiteSocketServer | undefined;
let pgRepo: PostgresProgressRepository | undefined;
repositoryContract('Postgres repository', async () => {
  const db = await PGlite.create();
  server = new PGLiteSocketServer({ db, port: 0, host: '127.0.0.1' });
  await server.start();
  const sql = postgres(`postgres://postgres@${server.getServerConn()}/postgres`, { max: 1, onnotice: () => {} });
  expect(await migrate(sql)).toEqual(['001_init.sql']);
  expect(await migrate(sql)).toEqual([]);
  pgRepo = new PostgresProgressRepository(sql);
  return pgRepo;
});

afterAll(async () => {
  await pgRepo?.close();
  await server?.stop();
});
