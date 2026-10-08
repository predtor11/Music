import { describe, expect, it } from 'vitest';
import { UserCreatedEventSchema, UserSchema } from '@music/contracts';
import { InMemoryEventBus } from '@music/service-kit';
import { buildApp, DEFAULT_DISPLAY_NAME } from '../src/app.js';

const USER = '0b6c3d0e-3c1a-4e0b-9a51-2f1f5f6f7a01';
const OTHER = '7a2d9c41-8e5b-4f3e-b0c2-6d8e9f0a1b22';
const NOW = new Date('2026-10-08T06:30:00.000Z');

function setup() {
  const bus = new InMemoryEventBus();
  const app = buildApp({ logger: false, bus, now: () => NOW });
  const me = (userId = USER) => app.inject({ method: 'GET', url: '/me', headers: { 'x-user-id': userId } });
  const patch = (body: unknown, userId = USER) =>
    app.inject({ method: 'PATCH', url: '/me/settings', headers: { 'x-user-id': userId }, payload: body as object });
  return { app, bus, me, patch };
}

describe('GET /me', () => {
  it('creates the profile with default settings on the first call', async () => {
    const { me } = setup();
    const res = await me();
    expect(res.statusCode).toBe(200);
    const user = UserSchema.parse(res.json());
    expect(user).toEqual({
      id: USER,
      displayName: DEFAULT_DISPLAY_NAME,
      createdAt: NOW.toISOString(),
      settings: { noteNaming: 'western', keyboardSize: 61, lowestNote: 36, currentKey: 'C', midiInputId: null, theme: 'dark' },
    });
  });

  it('returns the same profile on later calls', async () => {
    const { me } = setup();
    const first = (await me()).json();
    expect((await me()).json()).toEqual(first);
  });

  it('keeps each user separate', async () => {
    const { me, patch } = setup();
    await patch({ noteNaming: 'sargam' });
    expect((await me(OTHER)).json().settings.noteNaming).toBe('western');
  });

  it('publishes user.created once, on the first call only', async () => {
    const { me, bus } = setup();
    await me();
    await me();
    expect(bus.published).toHaveLength(1);
    const event = UserCreatedEventSchema.parse(bus.published[0]);
    expect(event).toMatchObject({
      type: 'user.created',
      source: 'identity',
      occurredAt: NOW.toISOString(),
      data: { userId: USER, displayName: DEFAULT_DISPLAY_NAME },
    });
  });

  it('publishes once when two first calls race', async () => {
    const { me, bus } = setup();
    await Promise.all([me(), me(), me()]);
    expect(bus.published).toHaveLength(1);
  });

  it('delivers user.created to subscribers', async () => {
    const { me, bus } = setup();
    const seen: string[] = [];
    // Cast: EventEnvelopeSchema types `type` as string, so EventOf<'user.created'> is never (raised on PR #1).
    await bus.subscribe('user.created', 'progress', async (e) => {
      seen.push(UserCreatedEventSchema.parse(e as unknown).data.userId);
    });
    await me();
    expect(seen).toEqual([USER]);
  });

  it('returns 401 without the gateway header', async () => {
    const { app } = setup();
    expect((await app.inject({ method: 'GET', url: '/me' })).statusCode).toBe(401);
  });

  it('returns 400 when the user id is not a UUID', async () => {
    const { me } = setup();
    expect((await me('not-a-uuid')).statusCode).toBe(400);
  });
});

describe('PATCH /me/settings', () => {
  it('changes only the settings sent and keeps the rest', async () => {
    const { me, patch } = setup();
    await me();
    const res = await patch({ noteNaming: 'both', currentKey: 'Eb' });
    expect(res.statusCode).toBe(200);
    expect(res.json().settings).toEqual({ noteNaming: 'both', keyboardSize: 61, lowestNote: 36, currentKey: 'Eb', midiInputId: null, theme: 'dark' });
    expect((await me()).json().settings.currentKey).toBe('Eb');
  });

  it('applies later patches on top of earlier ones', async () => {
    const { me, patch } = setup();
    await patch({ keyboardSize: 88, lowestNote: 21 });
    await patch({ midiInputId: 'input-1' });
    await patch({ midiInputId: null });
    expect((await me()).json().settings).toEqual({ noteNaming: 'western', keyboardSize: 88, lowestNote: 21, currentKey: 'C', midiInputId: null, theme: 'dark' });
  });

  it('creates the profile and publishes user.created if settings come first', async () => {
    const { patch, bus } = setup();
    const res = await patch({ noteNaming: 'sargam' });
    expect(res.statusCode).toBe(200);
    expect(UserSchema.parse(res.json()).settings.noteNaming).toBe('sargam');
    expect(bus.published.map((e) => e.type)).toEqual(['user.created']);
  });

  it('accepts an empty patch', async () => {
    const { patch } = setup();
    expect((await patch({})).json().settings.keyboardSize).toBe(61);
  });

  it('rejects invalid settings with 400 and changes nothing', async () => {
    const { me, patch } = setup();
    await me();
    expect((await patch({ keyboardSize: 60 })).statusCode).toBe(400);
    expect((await patch({ noteNaming: 'solfege' })).statusCode).toBe(400);
    expect((await patch({ lowestNote: 200 })).statusCode).toBe(400);
    expect((await me()).json().settings).toMatchObject({ keyboardSize: 61, noteNaming: 'western', lowestNote: 36 });
  });

  it('returns 401 without the gateway header', async () => {
    const { app } = setup();
    expect((await app.inject({ method: 'PATCH', url: '/me/settings', payload: {} })).statusCode).toBe(401);
  });
});
