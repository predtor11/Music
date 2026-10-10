/**
 * The outbox and the sync runner: ordering, retries, replays and giving up.
 * The network is a fake server that remembers what it was sent, keyed by the
 * ids in the bodies, like the real practice service.
 */

import type { Attempt } from '@music/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ANONYMOUS, LocalStorageStore, MemoryStore, openOutboxStore, type OutboxOp, type OutboxStore } from '../src/offline/outbox.js';
import { SyncRunner, classify, type Identity } from '../src/offline/sync.js';
import { chipFor } from '../src/offline/useSyncStatus.js';

class HttpError extends Error {
  constructor(readonly status: number) {
    super(`status ${status}`);
  }
}

/** A practice service that stores each session and attempt once, whatever the number of times it is sent. */
class FakeServer {
  sessions = new Map<string, { id: string; ended: boolean }>();
  attempts = new Map<string, { id: string; sessionId: string }>();
  log: string[] = [];
  /** Throw this for the next matching sends. */
  failures: Array<{ when: (op: OutboxOp) => boolean; error: () => Error; times: number; afterApplying?: boolean }> = [];

  send = async (op: OutboxOp): Promise<unknown> => {
    const failure = this.failures.find((f) => f.times > 0 && f.when(op));
    if (failure && !failure.afterApplying) {
      failure.times -= 1;
      throw failure.error();
    }
    this.log.push(`${op.kind}:${op.kind === 'attempt' ? op.payload.itemId : op.sessionId}`);
    if (op.kind === 'createSession') {
      if (!this.sessions.has(op.payload.id)) this.sessions.set(op.payload.id, { id: op.payload.id, ended: false });
    } else if (op.kind === 'attempt') {
      const session = this.sessions.get(op.sessionId);
      if (!session) throw new HttpError(404);
      if (session.ended && !this.attempts.has(op.payload.id)) throw new HttpError(409);
      this.attempts.set(op.payload.id, { id: op.payload.id, sessionId: op.sessionId });
    } else {
      const session = this.sessions.get(op.sessionId);
      if (!session) throw new HttpError(404);
      session.ended = true;
    }
    if (failure) {
      // The server did the work but the reply was lost.
      failure.times -= 1;
      throw failure.error();
    }
    return { ok: true };
  };
}

function setup(options: { identity?: Identity; store?: OutboxStore; server?: FakeServer } = {}) {
  const server = options.server ?? new FakeServer();
  const store = options.store ?? new MemoryStore();
  const state = { identity: options.identity ?? ({ userId: 'u1', canSync: true } as Identity) };
  const timers: Array<{ fn: () => void; ms: number; handle: number }> = [];
  let nextHandle = 1;
  let uuid = 0;
  const warn = vi.fn();
  const runner = new SyncRunner({
    store,
    send: server.send,
    identity: () => state.identity,
    setTimer: (fn, ms) => {
      const handle = nextHandle++;
      timers.push({ fn, ms, handle });
      return handle;
    },
    clearTimer: (handle) => {
      const i = timers.findIndex((t) => t.handle === handle);
      if (i >= 0) timers.splice(i, 1);
    },
    uuid: () => `op-${++uuid}`,
    random: () => 1,
    log: { warn },
    backoff: { baseMs: 1_000, maxMs: 8_000 },
  });
  return { runner, server, store, state, timers, warn };
}

const sessionBody = (id: string) => ({ id, kind: 'lesson' as const, refId: 'l1' });
const attemptBody = (sessionId: string, itemId: string, id = `${sessionId}-${itemId}`): Attempt & { id: string } => ({
  id,
  sessionId,
  itemId,
  itemKind: 'find-note',
  skill: 'note:C',
  expected: [0],
  played: [0],
  correct: true,
  retried: false,
  mistake: null,
  timeMs: 10,
  playedAt: '2026-01-01T00:00:00.000Z',
});

async function fillSession(runner: SyncRunner, sessionId: string, items: string[]) {
  await runner.enqueue('createSession', sessionId, sessionBody(sessionId));
  for (const item of items) await runner.enqueue('attempt', sessionId, attemptBody(sessionId, item));
  await runner.enqueue('endSession', sessionId, {});
}

afterEach(() => vi.restoreAllMocks());

describe('ordering', () => {
  it('sends a session, its attempts and its end in the order they were made', async () => {
    const { runner, server, store } = setup();
    await fillSession(runner, 's1', ['a', 'b', 'c']);
    expect(runner.getSnapshot().pending).toBe(5);
    await runner.flush();
    expect(server.log).toEqual(['createSession:s1', 'attempt:a', 'attempt:b', 'attempt:c', 'endSession:s1']);
    expect(await store.load()).toEqual([]);
    expect(runner.getSnapshot()).toMatchObject({ pending: 0, syncing: false, stopped: null });
  });

  it('keeps going from where an earlier visit left off', async () => {
    const store = new MemoryStore();
    const first = setup({ store });
    await fillSession(first.runner, 's1', ['a', 'b']);
    // Closed before anything was sent; a new page opens the same storage.
    const second = setup({ store });
    await second.runner.init();
    expect(second.runner.getSnapshot().pending).toBe(4);
    await second.runner.flush();
    expect(second.server.log).toEqual(['createSession:s1', 'attempt:a', 'attempt:b', 'endSession:s1']);
  });

  it('runs overlapping flushes as one, never sending anything twice', async () => {
    const { runner, server } = setup();
    await fillSession(runner, 's1', ['a']);
    await Promise.all([runner.flush(), runner.flush(), runner.flush()]);
    expect(server.log).toEqual(['createSession:s1', 'attempt:a', 'endSession:s1']);
  });

  it('sends what was added while a flush was running', async () => {
    const { runner, server } = setup();
    await runner.enqueue('createSession', 's1', sessionBody('s1'));
    const running = runner.flush();
    await runner.enqueue('attempt', 's1', attemptBody('s1', 'late'));
    await runner.flush();
    await running;
    expect(server.log).toEqual(['createSession:s1', 'attempt:late']);
  });
});

describe('retrying', () => {
  it('keeps everything when the network is down, and retries with growing waits', async () => {
    const { runner, server, timers, store } = setup();
    server.failures.push({ when: () => true, error: () => new HttpError(0), times: 3 });
    await fillSession(runner, 's1', ['a']);

    await runner.flush();
    expect(runner.getSnapshot()).toMatchObject({ pending: 3, stopped: 'network', retrying: true });
    expect(timers.map((t) => t.ms)).toEqual([1_000]);
    expect((await store.load()).find((o) => o.kind === 'createSession')?.tries).toBe(1);

    timers.pop()!.fn(); // the retry fires, still down
    await vi.waitFor(() => expect(timers.map((t) => t.ms)).toEqual([2_000]));
    timers.pop()!.fn();
    await vi.waitFor(() => expect(timers.map((t) => t.ms)).toEqual([4_000]));
    timers.pop()!.fn(); // the network is back
    await vi.waitFor(() => expect(runner.getSnapshot().pending).toBe(0));
    expect(server.log).toEqual(['createSession:s1', 'attempt:a', 'endSession:s1']);
    expect(runner.getSnapshot()).toMatchObject({ stopped: null, retrying: false });
    expect(timers).toEqual([]);
  });

  it('caps the wait between retries', async () => {
    const { runner, server, timers } = setup();
    server.failures.push({ when: () => true, error: () => new HttpError(0), times: 99 });
    await runner.enqueue('createSession', 's1', sessionBody('s1'));
    await runner.flush();
    for (let i = 0; i < 6; i++) {
      timers.pop()!.fn();
      await vi.waitFor(() => expect(timers.length).toBe(1));
    }
    expect(timers[0]!.ms).toBe(8_000);
  });

  it('retries at once when told the network is back, without waiting out the timer', async () => {
    const { runner, server, timers } = setup();
    server.failures.push({ when: () => true, error: () => new HttpError(0), times: 1 });
    await fillSession(runner, 's1', []);
    await runner.flush();
    expect(runner.getSnapshot().pending).toBe(2);
    await runner.retryNow();
    expect(runner.getSnapshot().pending).toBe(0);
    expect(timers).toEqual([]);
  });

  it('holds back only the session that hit a server error', async () => {
    const { runner, server, timers } = setup();
    server.failures.push({ when: (op) => op.sessionId === 's1' && op.kind === 'attempt', error: () => new HttpError(503), times: 1 });
    await fillSession(runner, 's1', ['a']);
    await fillSession(runner, 's2', ['b']);
    await runner.flush();
    // s2 went through; s1's end waited behind its failed attempt, so order is kept.
    expect(server.log).toEqual(['createSession:s1', 'createSession:s2', 'attempt:b', 'endSession:s2']);
    expect(runner.getSnapshot()).toMatchObject({ pending: 2, retrying: true });
    expect(timers).toHaveLength(1);
    await runner.retryNow();
    expect(server.log.slice(4)).toEqual(['attempt:a', 'endSession:s1']);
    expect(runner.getSnapshot().pending).toBe(0);
  });

  it.each([408, 425, 429, 500, 502, 504])('treats %i as worth retrying', (status) => {
    expect(classify(new HttpError(status))).not.toBe('permanent');
  });
});

describe('replays are harmless', () => {
  it('sends an operation again after its reply was lost, and the server keeps one copy', async () => {
    const { runner, server } = setup();
    server.failures.push({ when: (op) => op.kind === 'attempt', error: () => new HttpError(0), times: 1, afterApplying: true });
    await fillSession(runner, 's1', ['a', 'b']);
    await runner.flush(); // attempt a saved, reply lost
    expect(runner.getSnapshot().pending).toBe(3);
    await runner.retryNow();
    expect(server.attempts.size).toBe(2);
    expect(server.sessions.get('s1')?.ended).toBe(true);
    expect(server.log.filter((l) => l === 'attempt:a')).toHaveLength(2); // sent twice, stored once
    expect(runner.getSnapshot().pending).toBe(0);
  });

  it('can replay a whole session after the page was closed before it knew it had been sent', async () => {
    const server = new FakeServer();
    const one = setup({ server });
    await fillSession(one.runner, 's1', ['a']);
    await one.runner.flush();
    // Removing the operations from storage never finished, so the next visit sends them all again.
    const again = setup({ server, store: new MemoryStore() });
    await fillSession(again.runner, 's1', ['a']);
    await again.runner.flush();
    expect(server.log).toHaveLength(6);
    expect(server.sessions.size).toBe(1);
    expect(server.attempts.size).toBe(1);
  });
});

describe('giving up', () => {
  it('drops an operation the server refuses for good, says so, and carries on', async () => {
    const { runner, server, warn } = setup();
    server.failures.push({ when: (op) => op.kind === 'attempt' && op.payload.itemId === 'bad', error: () => new HttpError(400), times: 1 });
    await fillSession(runner, 's1', ['a', 'bad', 'c']);
    await runner.flush();
    expect(server.log).toEqual(['createSession:s1', 'attempt:a', 'attempt:c', 'endSession:s1']);
    expect(runner.getSnapshot()).toMatchObject({ pending: 0, dropped: 1, retrying: false });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('attempt');
  });

  it('drops the rest of a session whose creation was refused, but not other sessions', async () => {
    const { runner, server, warn } = setup();
    server.failures.push({ when: (op) => op.kind === 'createSession' && op.sessionId === 's1', error: () => new HttpError(404), times: 1 });
    await fillSession(runner, 's1', ['a', 'b']);
    await fillSession(runner, 's2', ['c']);
    await runner.flush();
    expect(server.log).toEqual(['createSession:s2', 'attempt:c', 'endSession:s2']);
    expect(runner.getSnapshot()).toMatchObject({ pending: 0, dropped: 4 });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(runner.takeResult('op-1')).toMatchObject({ ok: false });
  });

  it('classifies other 4xx as permanent and 401 as a pause', () => {
    for (const status of [400, 403, 404, 409, 413, 422]) expect(classify(new HttpError(status))).toBe('permanent');
    expect(classify(new HttpError(401))).toBe('auth');
    expect(classify(new HttpError(0))).toBe('network');
    expect(classify(new Error('no status'))).toBe('network');
  });

  it('pauses on 401 without dropping anything or scheduling retries', async () => {
    const { runner, server, timers } = setup();
    server.failures.push({ when: () => true, error: () => new HttpError(401), times: 1 });
    await fillSession(runner, 's1', ['a']);
    await runner.flush();
    expect(runner.getSnapshot()).toMatchObject({ pending: 3, dropped: 0, stopped: 'auth', retrying: false });
    expect(timers).toEqual([]);
    await runner.retryNow(); // signed in again
    expect(runner.getSnapshot().pending).toBe(0);
  });
});

describe('who it belongs to', () => {
  it('sends nothing while signed out and keeps it for the next person who signs in', async () => {
    const { runner, server, state, store } = setup({ identity: { userId: null, canSync: false } });
    await fillSession(runner, 's1', ['a']);
    await runner.flush();
    expect(server.log).toEqual([]);
    expect(runner.getSnapshot()).toMatchObject({ pending: 3, stopped: 'identity' });
    expect((await store.load()).every((o) => o.userId === ANONYMOUS)).toBe(true);

    state.identity = { userId: 'u2', canSync: true };
    await runner.claimAnonymous('u2');
    await runner.retryNow();
    expect(server.log).toEqual(['createSession:s1', 'attempt:a', 'endSession:s1']);
    expect(await store.load()).toEqual([]);
  });

  it("keeps each user's operations apart: another account's are not sent", async () => {
    const { runner, server, state, store } = setup({ identity: { userId: 'u1', canSync: true } });
    await fillSession(runner, 's1', ['a']);
    state.identity = { userId: 'u2', canSync: true };
    await fillSession(runner, 's2', ['b']);
    await runner.flush();
    expect(server.log).toEqual(['createSession:s2', 'attempt:b', 'endSession:s2']);
    expect((await store.load()).map((o) => o.userId)).toEqual(['u1', 'u1', 'u1']);
    expect(runner.getSnapshot().pending).toBe(0); // counts the current user's only

    state.identity = { userId: 'u1', canSync: true };
    runner.refresh();
    expect(runner.getSnapshot().pending).toBe(3);
    await runner.flush();
    expect(server.log.slice(3)).toEqual(['createSession:s1', 'attempt:a', 'endSession:s1']);
  });

  it('does not hand a signed-in user\'s operations to anyone else when claiming', async () => {
    const { runner, store } = setup({ identity: { userId: 'u1', canSync: true } });
    await runner.enqueue('createSession', 's1', sessionBody('s1'));
    await runner.claimAnonymous('u2');
    expect((await store.load())[0]!.userId).toBe('u1');
  });
});

describe('answers for waiting callers', () => {
  it('hands back the server reply of an operation once', async () => {
    const { runner } = setup();
    await runner.enqueue('createSession', 's1', sessionBody('s1'));
    const end = await runner.enqueue('endSession', 's1', {});
    await runner.flush();
    expect(runner.takeResult(end.id)).toEqual({ ok: true, response: { ok: true } });
    expect(runner.takeResult(end.id)).toBeUndefined();
  });

  it('gives no answer for an operation that is still waiting', async () => {
    const { runner, server } = setup();
    server.failures.push({ when: () => true, error: () => new HttpError(0), times: 1 });
    const end = await runner.enqueue('endSession', 's1', {});
    await runner.flush();
    const result = runner.takeResult(end.id);
    expect(result).toMatchObject({ ok: false });
    expect(runner.pendingFor('s1')).toBe(1);
  });

  it('tells subscribers when the queue changes', async () => {
    const { runner } = setup();
    const seen: number[] = [];
    runner.subscribe(() => seen.push(runner.getSnapshot().pending));
    await runner.enqueue('createSession', 's1', sessionBody('s1'));
    await runner.flush();
    expect(seen).toContain(1);
    expect(seen.at(-1)).toBe(0);
  });
});

describe('storage', () => {
  const op: OutboxOp = { id: 'x', seq: 1, userId: 'u', sessionId: 's', createdAt: '2026-01-01T00:00:00.000Z', tries: 0, kind: 'endSession', payload: {} };

  it('keeps operations in localStorage as a JSON list', async () => {
    const data = new Map<string, string>();
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
    const store = new LocalStorageStore(storage);
    await store.put(op);
    await store.put({ ...op, id: 'y', seq: 2 });
    await store.put({ ...op, tries: 3 }); // replaces x
    expect((await store.load()).map((o) => [o.id, o.tries])).toEqual([
      ['y', 0],
      ['x', 3],
    ]);
    await store.remove('y');
    expect((await new LocalStorageStore(storage).load()).map((o) => o.id)).toEqual(['x']);
  });

  it('survives damaged localStorage', async () => {
    const storage = { getItem: () => '{not json', setItem: () => undefined };
    expect(await new LocalStorageStore(storage).load()).toEqual([]);
  });

  it('falls back from IndexedDB to localStorage to memory', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const data = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) });
    expect((await openOutboxStore()).kind).toBe('localstorage');

    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => undefined,
    });
    expect((await openOutboxStore()).kind).toBe('memory');

    vi.stubGlobal('indexedDB', {
      open: () => {
        throw new Error('no db');
      },
    });
    expect((await openOutboxStore()).kind).toBe('memory');
    vi.unstubAllGlobals();
  });

  it('still works when the saved queue cannot be read', async () => {
    const broken: OutboxStore = {
      kind: 'memory',
      load: async () => {
        throw new Error('disk on fire');
      },
      put: async () => undefined,
      remove: async () => undefined,
    };
    const { runner, server, warn } = setup({ store: broken });
    await fillSession(runner, 's1', []);
    await runner.flush();
    expect(server.log).toEqual(['createSession:s1', 'endSession:s1']);
    expect(warn).toHaveBeenCalled();
  });
});

describe('the status chip', () => {
  const snap = (patch: Partial<ReturnType<SyncRunner['getSnapshot']>> = {}) => ({ pending: 0, syncing: false, stopped: null, retrying: false, dropped: 0, ...patch });

  it('says Online when all is saved', () => {
    expect(chipFor(true, snap(), true)).toMatchObject({ state: 'online', label: 'Online' });
  });
  it('says Offline when there is no network', () => {
    expect(chipFor(false, snap(), true)).toMatchObject({ state: 'offline', label: 'Offline' });
    expect(chipFor(true, snap({ stopped: 'network' }), true).state).toBe('offline');
  });
  it('counts what is waiting to sync', () => {
    expect(chipFor(false, snap({ pending: 4 }), true)).toMatchObject({ state: 'pending', label: '4 to sync' });
    expect(chipFor(true, snap({ pending: 1 }), false).title).toMatch(/Sign in/);
  });
  it('says Syncing… while sending', () => {
    expect(chipFor(true, snap({ pending: 2, syncing: true }), true)).toMatchObject({ state: 'syncing', label: 'Syncing…' });
  });
});
