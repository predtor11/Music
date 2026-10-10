/**
 * Practice with the network going away and coming back, through the real
 * client calls and the real HTTP layer, against a fake fetch.
 */

import type { Attempt, Lesson, Unit } from '@music/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLesson, getUnit } from '../src/api/curriculum.js';
import { endSession, nextItem, recordAttempt, startSession } from '../src/api/client.js';
import { MemoryStore } from '../src/offline/outbox.js';
import { saveStateOf } from '../src/offline/practice.js';
import { sendOp, setRunnerForTests } from '../src/offline/runtime.js';
import { SyncRunner, type Identity } from '../src/offline/sync.js';

const USER = '00000000-0000-4000-8000-0000000000aa';

const UNIT: Unit = {
  id: 'u1',
  order: 1,
  title: 'Unit',
  summary: '',
  outcome: '',
  lessonIds: ['l1'],
  checkpoint: {
    passPercent: 50,
    items: [
      { kind: 'find-note', id: 'c1', prompt: 'Play C.', pc: 0 },
      { kind: 'find-note', id: 'c2', prompt: 'Play D.', pc: 2 },
    ],
  },
};

const LESSON: Lesson = {
  id: 'l1',
  unitId: 'u1',
  order: 1,
  title: 'Lesson',
  summary: '',
  minutes: 1,
  steps: [
    { type: 'play-along', title: 'Along', items: [{ kind: 'find-note', id: 'p1', prompt: 'Play E.', pc: 4 }] },
    { type: 'quiz', title: 'Quiz', items: [{ kind: 'find-note', id: 'p1', prompt: 'Play E.', pc: 4 }, { kind: 'find-note', id: 'q1', prompt: 'Play F.', pc: 5 }] },
  ],
};

interface Server {
  online: boolean;
  requests: Array<{ method: string; path: string; body: Record<string, unknown> | null }>;
  /** Replies for POSTs once online. */
  failWith: number | null;
}

function installFetch(server: Server) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const path = String(input).replace(/^\/api/, '');
      const method = init?.method ?? 'GET';
      const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
      if (method === 'GET' && path === `/curriculum/units/${UNIT.id}`) return json(UNIT);
      if (method === 'GET' && path === `/curriculum/lessons/${LESSON.id}`) return json(LESSON);
      if (!server.online) throw new TypeError('Failed to fetch');
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
      server.requests.push({ method, path, body });
      if (server.failWith) return json({ message: 'nope' }, server.failWith);
      if (path === '/practice/sessions') return json({ id: body!.id, userId: USER, kind: body!.kind, refId: body!.refId ?? null, startedAt: new Date().toISOString(), endedAt: null }, 201);
      if (path === '/practice/attempts') return json({}, 201);
      if (path.endsWith('/end')) return json({ session: { id: path.split('/')[3], userId: USER, kind: 'checkpoint', refId: 'u1', startedAt: new Date().toISOString(), endedAt: new Date().toISOString() }, summary: { total: 2, answered: 2, firstTryCorrect: 2, accuracy: 100, passed: true } });
      if (path.endsWith('/next-item')) return json(UNIT.checkpoint.items[1]);
      return json({ message: 'no fake' }, 404);
    }),
  );
}

const attempt = (sessionId: string, itemId: string, correct = true, retried = false): Attempt => ({
  sessionId,
  itemId,
  itemKind: 'find-note',
  skill: 'note:C',
  expected: [0],
  played: [0],
  correct,
  retried,
  mistake: null,
  timeMs: 100,
  playedAt: '2026-01-01T00:00:00.000Z',
});

let server: Server;
let runner: SyncRunner;
let identity: Identity;

beforeEach(async () => {
  server = { online: true, requests: [], failWith: null };
  installFetch(server);
  identity = { userId: USER, canSync: true };
  runner = new SyncRunner({ store: new MemoryStore(), send: sendOp, identity: () => identity, backoff: { baseMs: 1, maxMs: 1 }, log: { warn: () => undefined } });
  setRunnerForTests(runner, identity);
  // The page has loaded the unit and lesson while online, as the real screens do.
  await getUnit(UNIT.id);
  await getLesson(LESSON.id);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('practice while offline', () => {
  it('runs a whole unit test with no network, then sends it in order when the network returns', async () => {
    server.online = false;
    const session = await startSession({ kind: 'checkpoint', refId: UNIT.id });
    expect(session.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(session.kind).toBe('checkpoint');

    // Items come from the unit, one at a time.
    expect((await nextItem(session.id))?.id).toBe('c1');
    await recordAttempt(attempt(session.id, 'c1', true));
    expect((await nextItem(session.id))?.id).toBe('c2');
    await recordAttempt(attempt(session.id, 'c2', false));
    expect(await nextItem(session.id)).toBeNull();

    // The score is worked out here: 1 of 2 right first time, and 50% is the pass mark.
    const ended = await endSession(session.id);
    expect(ended.summary).toEqual({ total: 2, answered: 2, firstTryCorrect: 1, accuracy: 50, passed: true });
    expect(ended.session.endedAt).not.toBeNull();
    expect(saveStateOf(session.id, runner.getSnapshot())).toBe('offline');
    expect(server.requests).toEqual([]);
    expect(runner.getSnapshot().pending).toBe(4);

    server.online = true;
    await runner.retryNow();
    expect(server.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      'POST /practice/sessions',
      'POST /practice/attempts',
      'POST /practice/attempts',
      `POST /practice/sessions/${session.id}/end`,
    ]);
    expect(server.requests[0]!.body).toMatchObject({ id: session.id, kind: 'checkpoint', refId: UNIT.id });
    expect(server.requests.slice(1, 3).map((r) => r.body!.itemId)).toEqual(['c1', 'c2']);
    expect(server.requests.slice(1, 3).every((r) => typeof r.body!.id === 'string')).toBe(true);
    expect(runner.getSnapshot().pending).toBe(0);
    expect(saveStateOf(session.id, runner.getSnapshot())).toBe('saving');
  });

  it('scores a lesson like the service: de-duplicated items, 80% to pass', async () => {
    server.online = false;
    const session = await startSession({ kind: 'lesson', refId: LESSON.id });
    await recordAttempt(attempt(session.id, 'p1', true));
    await recordAttempt(attempt(session.id, 'q1', true, true)); // right only after a retry
    const { summary } = await endSession(session.id);
    expect(summary).toEqual({ total: 2, answered: 2, firstTryCorrect: 1, accuracy: 50, passed: false });
  });

  it('uses the server score when everything got through', async () => {
    const session = await startSession({ kind: 'checkpoint', refId: UNIT.id });
    await recordAttempt(attempt(session.id, 'c1'));
    const { summary } = await endSession(session.id);
    expect(summary).toMatchObject({ accuracy: 100, passed: true });
    expect(server.requests.map((r) => r.path)).toEqual(['/practice/sessions', '/practice/attempts', `/practice/sessions/${session.id}/end`]);
  });

  it('asks the server for the next item only when nothing is waiting', async () => {
    const session = await startSession({ kind: 'checkpoint', refId: UNIT.id });
    await vi.waitFor(() => expect(runner.getSnapshot().pending).toBe(0));
    expect((await nextItem(session.id))?.id).toBe('c2'); // the fake server's answer
    server.online = false;
    expect((await nextItem(session.id))?.id).toBe('c1'); // falls back to the unit
  });

  it('sends the same ids again after a failed try instead of making new ones', async () => {
    server.failWith = 503;
    const session = await startSession({ kind: 'checkpoint', refId: UNIT.id });
    await recordAttempt(attempt(session.id, 'c1'));
    await runner.flush();
    const failed = server.requests.length;
    expect(failed).toBeGreaterThan(0); // the session, refused with a 503; its attempt waited behind it
    server.failWith = null;
    await runner.retryNow();
    const bodiesAt = (path: string) => server.requests.filter((r) => r.path === path).map((r) => r.body);
    const sessionBodies = bodiesAt('/practice/sessions');
    expect(sessionBodies.length).toBeGreaterThan(1);
    expect(new Set(sessionBodies.map((b) => JSON.stringify(b))).size).toBe(1); // same body, same id, every time
    expect(bodiesAt('/practice/attempts')[0]).toMatchObject({ itemId: 'c1', id: expect.any(String) });
    expect(runner.getSnapshot().pending).toBe(0);
  });

  it('keeps a signed-out learner\'s practice, and sends nothing until someone signs in', async () => {
    identity = { userId: null, canSync: false };
    setRunnerForTests(runner, identity);
    server.online = true;
    const session = await startSession({ kind: 'checkpoint', refId: UNIT.id });
    await recordAttempt(attempt(session.id, 'c1'));
    const { summary } = await endSession(session.id);
    expect(summary.firstTryCorrect).toBe(1);
    expect(saveStateOf(session.id, runner.getSnapshot())).toBe('signed-out');
    expect(server.requests).toEqual([]);
    expect(runner.getSnapshot().pending).toBe(3);

    identity = { userId: USER, canSync: true };
    await runner.claimAnonymous(USER);
    await runner.retryNow();
    expect(server.requests).toHaveLength(3);
    expect(runner.getSnapshot().pending).toBe(0);
  });

  it('needs a connection to start a review, because the server picks the questions', async () => {
    server.online = false;
    await expect(startSession({ kind: 'review' })).rejects.toMatchObject({ status: 0 });
    identity = { userId: null, canSync: false };
    setRunnerForTests(runner, identity);
    await expect(startSession({ kind: 'review' })).rejects.toMatchObject({ status: 401 });
  });
});
