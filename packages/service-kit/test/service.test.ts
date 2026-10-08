import { describe, expect, it } from 'vitest';
import { InMemoryEventBus, createService, requireUserId } from '../src/index.js';

describe('createService', () => {
  it('answers /health', async () => {
    const app = createService({ name: 'theory', logger: false });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.json()).toEqual({ service: 'theory', status: 'ok', version: '0.1.0' });
  });

  it('returns 401 without a user id', async () => {
    const app = createService({ name: 'practice', logger: false });
    app.get('/me', async (req) => ({ id: requireUserId(req) }));
    expect((await app.inject({ url: '/me' })).statusCode).toBe(401);
    const ok = await app.inject({ url: '/me', headers: { 'x-user-id': 'u1' } });
    expect(ok.json()).toEqual({ id: 'u1' });
  });
});

describe('InMemoryEventBus', () => {
  it('delivers events to subscribers', async () => {
    const bus = new InMemoryEventBus();
    const seen: string[] = [];
    await bus.subscribe('user.created', 'progress', async (e) => {
      seen.push(e.data.displayName);
    });
    await bus.publish({
      id: '6f1c5f5e-6a43-4b3b-9d3c-0d6c2f8f2f11',
      type: 'user.created',
      occurredAt: '2026-10-08T06:00:00.000Z',
      source: 'identity',
      data: { userId: '6f1c5f5e-6a43-4b3b-9d3c-0d6c2f8f2f12', displayName: 'Jayesh' },
    });
    expect(seen).toEqual(['Jayesh']);
  });
});
