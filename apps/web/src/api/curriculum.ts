/**
 * Lessons and units. Each one that loads is kept in memory, so a practice
 * session can score itself from it if the connection drops mid-lesson. Across
 * visits it is the service worker's cache that makes them load offline.
 */

import { LessonSchema, UnitSchema, type Lesson, type Unit } from '@music/contracts';
import { call } from './http.js';

const lessons = new Map<string, Lesson>();
const units = new Map<string, Unit>();

export async function getLesson(id: string): Promise<Lesson> {
  const lesson = LessonSchema.parse(await call(`/curriculum/lessons/${encodeURIComponent(id)}`));
  lessons.set(id, lesson);
  return lesson;
}

export async function getUnit(id: string): Promise<Unit> {
  const unit = UnitSchema.parse(await call(`/curriculum/units/${encodeURIComponent(id)}`));
  units.set(id, unit);
  return unit;
}

/** The lesson if it was loaded in this visit, else fetched (the service worker may answer offline). */
export async function lessonForPractice(id: string): Promise<Lesson> {
  return lessons.get(id) ?? getLesson(id);
}

export async function unitForPractice(id: string): Promise<Unit> {
  return units.get(id) ?? getUnit(id);
}
