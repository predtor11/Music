import type { InstrumentId, Progress } from '@music/contracts';

/** The parts of the curriculum this service needs: units in order, each with its lessons in order. */
export interface CatalogUnit {
  id: string;
  /** Units unlock in order within one instrument. */
  instrument?: InstrumentId;
  order: number;
  lessonIds: string[];
}

/** What a learner has finished, built from session.ended events. */
export interface Completions {
  /** Lessons with a session that ended without passing. */
  lessonsStarted: ReadonlySet<string>;
  lessonsDone: ReadonlySet<string>;
  checkpointsPassed: ReadonlySet<string>;
}

export const NO_COMPLETIONS: Completions = { lessonsStarted: new Set(), lessonsDone: new Set(), checkpointsPassed: new Set() };

/**
 * Unlock rules. Pure.
 * - Each instrument has its own chain of units; `instrument` picks which one is returned (default piano).
 * - The first unit is open from the start; passing a unit's checkpoint opens the next.
 * - In an open unit, the first lesson is available and each finished lesson opens the next.
 * - Finished work stays finished even if the curriculum changes order later.
 */
export function computeProgress(userId: string, units: readonly CatalogUnit[], done: Completions, instrument: InstrumentId = 'piano'): Progress {
  const ordered = units.filter((u) => (u.instrument ?? 'piano') === instrument).sort((a, b) => a.order - b.order);
  return {
    userId,
    units: ordered.map((unit, i) => {
      const previous = ordered[i - 1];
      const checkpointPassed = done.checkpointsPassed.has(unit.id);
      const unlocked = i === 0 || checkpointPassed || (previous !== undefined && done.checkpointsPassed.has(previous.id));
      return {
        unitId: unit.id,
        unlocked,
        checkpointPassed,
        lessons: unit.lessonIds.map((lessonId, j) => {
          if (done.lessonsDone.has(lessonId)) return { lessonId, status: 'done' as const };
          const open = unlocked && (j === 0 || done.lessonsDone.has(unit.lessonIds[j - 1]!));
          if (!open) return { lessonId, status: 'locked' as const };
          return { lessonId, status: done.lessonsStarted.has(lessonId) ? ('in-progress' as const) : ('available' as const) };
        }),
      };
    }),
  };
}
