import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LessonSchema, UnitListSchema, UnitSchema } from '@music/contracts';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { ContentError, loadCurriculum } from '../src/content.js';
import { GlossarySchema } from '../src/glossary.js';

const app = buildApp({ logger: false });

describe('curriculum service', () => {
  it('lists the units in order without checkpoints', async () => {
    const res = await app.inject({ url: '/units' });
    expect(res.statusCode).toBe(200);
    const units = UnitListSchema.parse(res.json());
    expect(units.map((u) => u.id)).toEqual(['unit-1', 'unit-2', 'unit-3', 'unit-4', 'unit-5', 'unit-6', 'unit-7', 'unit-8', 'guitar-1']);
    expect(res.json()[0]).not.toHaveProperty('checkpoint');
  });

  it('filters units by instrument; content without an instrument is piano', async () => {
    const piano = UnitListSchema.parse((await app.inject({ url: '/units?instrument=piano' })).json());
    expect(piano).toHaveLength(8);
    expect(UnitListSchema.parse((await app.inject({ url: '/units?instrument=guitar' })).json()).map((u) => u.id)).toEqual(['guitar-1']);
    expect((await app.inject({ url: '/units?instrument=kazoo' })).statusCode).toBe(400);
  });

  it('returns a unit with its checkpoint', async () => {
    const res = await app.inject({ url: '/units/unit-2' });
    expect(res.statusCode).toBe(200);
    const unit = UnitSchema.parse(res.json());
    expect(unit.checkpoint.passPercent).toBe(80);
    expect(unit.checkpoint.items.length).toBeGreaterThan(0);
  });

  it('returns every lesson a unit lists', async () => {
    for (const unitId of ['unit-1', 'unit-2', 'unit-3', 'unit-4', 'unit-5', 'unit-6', 'unit-7', 'unit-8', 'guitar-1']) {
      const unit = UnitSchema.parse((await app.inject({ url: `/units/${unitId}` })).json());
      for (const id of unit.lessonIds) {
        const res = await app.inject({ url: `/lessons/${id}` });
        expect(res.statusCode).toBe(200);
        expect(LessonSchema.parse(res.json())).toMatchObject({ id, unitId });
      }
    }
  });

  it('returns the glossary in teaching order', async () => {
    const res = await app.inject({ url: '/glossary' });
    expect(res.statusCode).toBe(200);
    const terms = GlossarySchema.parse(res.json());
    expect(terms[0]).toMatchObject({ id: 'note', lessonId: 'u1-l1' });
    expect(terms.map((t) => t.term)).toContain('half step');
  });

  it('answers 404 for unknown ids', async () => {
    expect((await app.inject({ url: '/units/unit-99' })).statusCode).toBe(404);
    expect((await app.inject({ url: '/lessons/nope' })).statusCode).toBe(404);
  });
});

describe('content loading', () => {
  function contentDir(unit: object, lessons: object[]): string {
    const dir = mkdtempSync(join(tmpdir(), 'curriculum-'));
    mkdirSync(join(dir, 'units'));
    mkdirSync(join(dir, 'lessons'));
    writeFileSync(join(dir, 'units', 'u.json'), JSON.stringify(unit));
    lessons.forEach((l, i) => writeFileSync(join(dir, 'lessons', `${i}.json`), JSON.stringify(l)));
    return dir;
  }
  const lesson = { id: 'l1', unitId: 'u', order: 1, title: 'T', summary: 'S', minutes: 1, steps: [{ type: 'explore', title: 'T', body: 'B' }] };
  const unit = {
    id: 'u',
    order: 1,
    title: 'U',
    summary: 'S',
    outcome: 'O',
    lessonIds: ['l1'],
    checkpoint: { items: [{ kind: 'find-note', id: 'i1', prompt: 'Play C.', pc: 0 }] },
  };

  it('loads good content', () => {
    expect(loadCurriculum(contentDir(unit, [lesson])).units).toHaveLength(1);
  });

  it('refuses a file that breaks the schema', () => {
    expect(() => loadCurriculum(contentDir(unit, [{ ...lesson, steps: [] }]))).toThrow(ContentError);
  });

  it('refuses a unit that lists a missing lesson', () => {
    expect(() => loadCurriculum(contentDir({ ...unit, lessonIds: ['l1', 'l2'] }, [lesson]))).toThrow(/l2, which doesn't exist/);
  });

  it('refuses a glossary term for a missing lesson', () => {
    const dir = contentDir(unit, [lesson]);
    const term = { id: 't', term: 'T', meaning: 'M', whyItMatters: 'W', lessonId: 'nope', exampleMidi: [60] };
    writeFileSync(join(dir, 'glossary.json'), JSON.stringify([term]));
    expect(() => loadCurriculum(dir)).toThrow(/lesson nope, which doesn't exist/);
  });

  it('refuses repeated test item ids', () => {
    const item = unit.checkpoint.items[0];
    expect(() => loadCurriculum(contentDir({ ...unit, checkpoint: { items: [item, item] } }, [lesson]))).toThrow(/i1 appears twice/);
  });

  it('numbers units on their own for each instrument, and keeps a lesson with its unit instrument', () => {
    const dir = contentDir(unit, [lesson]);
    const guitarUnit = { ...unit, id: 'g', instrument: 'guitar', lessonIds: ['gl1'], checkpoint: { items: [{ ...unit.checkpoint.items[0], id: 'i2' }] } };
    writeFileSync(join(dir, 'units', 'g.json'), JSON.stringify(guitarUnit));
    const guitarLesson = { ...lesson, id: 'gl1', unitId: 'g', instrument: 'guitar' };
    writeFileSync(join(dir, 'lessons', 'g.json'), JSON.stringify(guitarLesson));
    expect(loadCurriculum(dir).units.map((u) => u.id)).toEqual(['u', 'g']);
    writeFileSync(join(dir, 'lessons', 'g.json'), JSON.stringify({ ...guitarLesson, instrument: 'piano' }));
    expect(() => loadCurriculum(dir)).toThrow(/lesson gl1 is for piano, but unit g is for guitar/);
  });
});
