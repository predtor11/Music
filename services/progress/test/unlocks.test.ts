import { describe, expect, it } from 'vitest';
import { NO_COMPLETIONS, computeProgress, type CatalogUnit } from '../src/unlocks.js';
import { USER } from './fixtures.js';

export const UNITS: CatalogUnit[] = [
  { id: 'u2', order: 2, lessonIds: ['u2-l1', 'u2-l2'] },
  { id: 'u1', order: 1, lessonIds: ['u1-l1', 'u1-l2', 'u1-l3'] },
  { id: 'u3', order: 3, lessonIds: ['u3-l1'] },
];

const statuses = (p: ReturnType<typeof computeProgress>) =>
  Object.fromEntries(p.units.map((u) => [u.unitId, [u.unlocked, ...u.lessons.map((l) => l.status)]]));

describe('unlocks', () => {
  it('opens only the first lesson of the first unit at the start', () => {
    expect(statuses(computeProgress(USER, UNITS, NO_COMPLETIONS))).toEqual({
      u1: [true, 'available', 'locked', 'locked'],
      u2: [false, 'locked', 'locked'],
      u3: [false, 'locked'],
    });
  });

  it('opens the next lesson when one is done, and marks started ones', () => {
    const p = computeProgress(USER, UNITS, { lessonsDone: new Set(['u1-l1']), lessonsStarted: new Set(['u1-l2']), checkpointsPassed: new Set() });
    expect(statuses(p).u1).toEqual([true, 'done', 'in-progress', 'locked']);
  });

  it('opens the next unit only when the checkpoint is passed', () => {
    const allLessons = { lessonsDone: new Set(['u1-l1', 'u1-l2', 'u1-l3']), lessonsStarted: new Set<string>(), checkpointsPassed: new Set<string>() };
    expect(computeProgress(USER, UNITS, allLessons).units[1]!.unlocked).toBe(false);
    const passed = computeProgress(USER, UNITS, { ...allLessons, checkpointsPassed: new Set(['u1']) });
    expect(statuses(passed)).toMatchObject({ u2: [true, 'available', 'locked'], u3: [false, 'locked'] });
    expect(passed.units[0]!.checkpointPassed).toBe(true);
  });

  it('keeps one chain of units per instrument', () => {
    const units: CatalogUnit[] = [...UNITS, { id: 'g1', instrument: 'guitar', order: 1, lessonIds: ['g1-l1'] }, { id: 'g2', instrument: 'guitar', order: 2, lessonIds: ['g2-l1'] }];
    expect(statuses(computeProgress(USER, units, NO_COMPLETIONS))).toEqual(statuses(computeProgress(USER, UNITS, NO_COMPLETIONS)));
    // Guitar starts at its own first unit, whatever piano has passed.
    const pianoDone = { lessonsDone: new Set(['u1-l1']), lessonsStarted: new Set<string>(), checkpointsPassed: new Set(['u1', 'u2']) };
    expect(statuses(computeProgress(USER, units, pianoDone, 'guitar'))).toEqual({ g1: [true, 'available'], g2: [false, 'locked'] });
    const guitarCheckpoint = { ...pianoDone, checkpointsPassed: new Set(['g1']) };
    expect(statuses(computeProgress(USER, units, guitarCheckpoint, 'guitar')).g2).toEqual([true, 'available']);
  });
});
