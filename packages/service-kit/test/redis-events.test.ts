import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { Redis } from 'ioredis';
import type { UserCreatedEvent } from '@music/contracts';
import { InMemoryEventBus, RedisEventBus, createEventBus, type EventBus } from '../src/index.js';

const REDIS_URL = process.env.REDIS_URL;

function userCreated(displayName: string): UserCreatedEvent {
  return {
    id: randomUUID(),
    type: 'user.created',
    occurredAt: new Date().toISOString(),
    source: 'identity',
    data: { userId: randomUUID(), displayName },
  };
}

async function waitFor(check: () => boolean, timeoutMs = 3000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe('createEventBus', () => {
  it('uses memory without a Redis URL', async () => {
    const saved = process.env.REDIS_URL;
    delete process.env.REDIS_URL;
    try {
      const bus = createEventBus();
      expect(bus).toBeInstanceOf(InMemoryEventBus);
      await bus.close();
    } finally {
      if (saved !== undefined) process.env.REDIS_URL = saved;
    }
  });

  it.runIf(REDIS_URL)('uses Redis when a URL is given', async () => {
    const bus = createEventBus({ url: REDIS_URL });
    expect(bus).toBeInstanceOf(RedisEventBus);
    await bus.close();
  });
});

describe.runIf(REDIS_URL)('RedisEventBus', () => {
  const buses: EventBus[] = [];
  const prefixes: string[] = [];

  function bus(prefix: string, consumer = 'test') {
    const b = new RedisEventBus({ url: REDIS_URL!, streamPrefix: prefix, consumer, blockMs: 100, retryDelayMs: 50, log: () => {} });
    buses.push(b);
    return b;
  }

  function newPrefix() {
    const prefix = `test:${randomUUID()}:`;
    prefixes.push(prefix);
    return prefix;
  }

  afterEach(async () => {
    await Promise.all(buses.splice(0).map((b) => b.close()));
    const redis = new Redis(REDIS_URL!);
    for (const prefix of prefixes.splice(0)) {
      const keys = await redis.keys(`${prefix}*`);
      if (keys.length) await redis.del(...keys);
    }
    await redis.quit();
  });

  it('delivers each event once to every consumer group', async () => {
    const prefix = newPrefix();
    const publisher = bus(prefix);
    const progress: string[] = [];
    const practice: string[] = [];
    await bus(prefix, 'a').subscribe('user.created', 'progress', async (e) => void progress.push(e.data.displayName));
    await bus(prefix, 'b').subscribe('user.created', 'practice', async (e) => void practice.push(e.data.displayName));

    await publisher.publish(userCreated('Jayesh'));
    await publisher.publish(userCreated('Asha'));

    await waitFor(() => progress.length === 2 && practice.length === 2);
    expect(progress).toEqual(['Jayesh', 'Asha']);
    expect(practice).toEqual(['Jayesh', 'Asha']);
  });

  it('shares events between consumers in the same group', async () => {
    const prefix = newPrefix();
    const seen: string[] = [];
    await bus(prefix, 'one').subscribe('user.created', 'progress', async (e) => void seen.push(e.data.displayName));
    await bus(prefix, 'two').subscribe('user.created', 'progress', async (e) => void seen.push(e.data.displayName));
    const publisher = bus(prefix);
    for (const name of ['a', 'b', 'c', 'd']) await publisher.publish(userCreated(name));
    await waitFor(() => seen.length === 4);
    await new Promise((r) => setTimeout(r, 200));
    expect(seen.sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('delivers events published before the group subscribed', async () => {
    const prefix = newPrefix();
    await bus(prefix).publish(userCreated('early'));
    const seen: string[] = [];
    await bus(prefix).subscribe('user.created', 'progress', async (e) => void seen.push(e.data.displayName));
    await waitFor(() => seen.length === 1);
    expect(seen).toEqual(['early']);
  });

  it('acknowledges only after the handler succeeds, and retries a failure', async () => {
    const prefix = newPrefix();
    let calls = 0;
    const done: string[] = [];
    await bus(prefix).subscribe('user.created', 'progress', async (e) => {
      calls += 1;
      if (calls === 1) throw new Error('database down');
      done.push(e.data.displayName);
    });
    await bus(prefix).publish(userCreated('retry me'));
    await waitFor(() => done.length === 1);
    expect(calls).toBe(2);

    const redis = new Redis(REDIS_URL!);
    const pending = (await redis.xpending(`${prefix}user.created`, 'progress')) as [number, ...unknown[]];
    await redis.quit();
    expect(pending[0]).toBe(0);
  });

  it('drops malformed events instead of retrying forever', async () => {
    const prefix = newPrefix();
    const seen: string[] = [];
    await bus(prefix).subscribe('user.created', 'progress', async (e) => void seen.push(e.data.displayName));
    const redis = new Redis(REDIS_URL!);
    await redis.xadd(`${prefix}user.created`, '*', 'event', '{"not":"an event"}');
    await redis.quit();
    await bus(prefix).publish(userCreated('good'));
    await waitFor(() => seen.length === 1);
    expect(seen).toEqual(['good']);
  });
});
