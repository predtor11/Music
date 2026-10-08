import { readdirSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { ProgressSchema, UnitSchema, type MusicEvent } from '@music/contracts';
import { InMemoryEventBus } from '@music/service-kit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { StaticCatalog } from '../src/catalog.js';

// The real course on main, so the unlock path is checked against the lessons Jayesh will see.
const dir = new URL('../../curriculum/content/units/', import.meta.url);
const units = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => UnitSchema.parse(JSON.parse(readFileSync(new URL(f, dir), 'utf8'))))
  .sort((a, b) => a.order - b.order);

const USER = randomUUID();
const headers = { 'x-user-id': USER };
const ended = (kind: 'lesson' | 'checkpoint', refId: string, passed: boolean | null): MusicEvent => ({
  id: randomUUID(),
  type: 'session.ended',
  occurredAt: new Date().toISOString(),
  source: 'practice',
  data: { sessionId: randomUUID(), userId: USER, kind, refId, passed },
});

describe('unlocks over the real Units 1 and 2', () => {
  const bus = new InMemoryEventBus();
  let app: Awaited<ReturnType<typeof buildApp>>;
  const [unit1, unit2] = units as [(typeof units)[0], (typeof units)[0]];
  const progress = async () => ProgressSchema.parse((await app.inject({ url: '/', headers })).json());
  const statuses = (p: Awaited<ReturnType<typeof progress>>, i: number) => p.units[i]!.lessons.map((l) => l.status);

  beforeAll(async () => {
    app = await buildApp({ logger: false, bus, catalog: new StaticCatalog(units.map(({ id, order, lessonIds }) => ({ id, order, lessonIds }))) });
  });
  afterAll(() => app.close());

  it('starts with only the first lesson open', async () => {
    const p = await progress();
    expect(statuses(p, 0)).toEqual(['available', ...Array(unit1.lessonIds.length - 1).fill('locked')]);
    expect(p.units[1]).toMatchObject({ unlocked: false });
    expect(statuses(p, 1).every((s) => s === 'locked')).toBe(true);
  });

  it('opens each lesson when the one before is finished, and not on a failed try', async () => {
    await bus.publish(ended('lesson', unit1.lessonIds[0]!, true));
    await bus.publish(ended('lesson', unit1.lessonIds[1]!, false));
    expect(statuses(await progress(), 0).slice(0, 3)).toEqual(['done', 'in-progress', 'locked']);

    for (const id of unit1.lessonIds) await bus.publish(ended('lesson', id, true));
    const p = await progress();
    expect(statuses(p, 0).every((s) => s === 'done')).toBe(true);
    // Finishing every lesson does not open Unit 2; the unit test does.
    expect(p.units[1]!.unlocked).toBe(false);
  });

  it('opens Unit 2 only after the Unit 1 test is passed', async () => {
    await bus.publish(ended('checkpoint', unit1.id, false));
    expect((await progress()).units[1]!.unlocked).toBe(false);

    await bus.publish(ended('checkpoint', unit1.id, true));
    const p = await progress();
    expect(p.units[0]!.checkpointPassed).toBe(true);
    expect(p.units[1]!.unlocked).toBe(true);
    expect(statuses(p, 1)).toEqual(['available', ...Array(unit2.lessonIds.length - 1).fill('locked')]);
  });

  it('keeps a finished lesson done when a replay fails', async () => {
    await bus.publish(ended('lesson', unit1.lessonIds[0]!, false));
    expect(statuses(await progress(), 0)[0]).toBe('done');
  });
});
