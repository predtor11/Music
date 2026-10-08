/**
 * Reading the progress service's answer for the Lessons list. Pure, so the
 * gating is tested without a browser.
 */

import type { Progress } from '@music/contracts';

export type LessonStatus = Progress['units'][number]['lessons'][number]['status'];

export interface UnitStanding {
  unlocked: boolean;
  checkpointPassed: boolean;
  done: number;
  total: number;
  /** The unit before this one, which must be passed to open it. */
  previousUnitId: string | null;
}

export interface Standing {
  lesson(id: string): LessonStatus;
  unit(id: string): UnitStanding;
  /** The lesson to pick up next: the first started one, else the first open one. */
  next: string | null;
}

/**
 * Statuses by id. Without progress (the service is down) everything is open,
 * so the lessons still work; they just aren't gated or saved.
 */
export function standing(progress: Progress | null): Standing {
  const lessons = new Map<string, LessonStatus>();
  const units = new Map<string, UnitStanding>();
  let started: string | null = null;
  let open: string | null = null;
  progress?.units.forEach((u, i) => {
    let done = 0;
    for (const l of u.lessons) {
      lessons.set(l.lessonId, l.status);
      if (l.status === 'done') done += 1;
      if (l.status === 'in-progress') started ??= l.lessonId;
      if (l.status === 'available') open ??= l.lessonId;
    }
    units.set(u.unitId, {
      unlocked: u.unlocked,
      checkpointPassed: u.checkpointPassed,
      done,
      total: u.lessons.length,
      previousUnitId: progress.units[i - 1]?.unitId ?? null,
    });
  });
  const fallbackUnit: UnitStanding = { unlocked: true, checkpointPassed: false, done: 0, total: 0, previousUnitId: null };
  return {
    lesson: (id) => (progress ? (lessons.get(id) ?? 'locked') : 'available'),
    unit: (id) => (progress ? (units.get(id) ?? { ...fallbackUnit, unlocked: false }) : fallbackUnit),
    next: started ?? open,
  };
}
