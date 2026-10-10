/**
 * Lessons and units. Each one that loads is kept in memory, so a practice
 * session can score itself from it if the connection drops mid-lesson. Across
 * visits it is the service worker's cache that makes them load offline.
 */

import { LessonSchema, UnitSchema, type Lesson, type Unit } from '@music/contracts';
import { call } from './http.js';
import { instrumentId, instrumentPath, type InstrumentId } from '../instruments/model.js';

const lessons = new Map<string, Lesson>();
const units = new Map<string, Unit>();

export async function getLesson(id: string, instrument: InstrumentId = 'piano'): Promise<Lesson> {
  const raw = await call(instrumentPath(`/curriculum/lessons/${encodeURIComponent(id)}`, instrument));
  const lesson = LessonSchema.parse(raw);
  if (instrumentId((raw as { instrument?: unknown }).instrument) !== instrument) throw new Error('This lesson belongs to another instrument. Open Lessons to choose one for your instrument.');
  lessons.set(`${instrument}:${id}`, lesson);
  return lesson;
}

export async function getUnit(id: string, instrument: InstrumentId = 'piano'): Promise<Unit> {
  const raw = await call(instrumentPath(`/curriculum/units/${encodeURIComponent(id)}`, instrument));
  const unit = UnitSchema.parse(raw);
  if (instrumentId((raw as { instrument?: unknown }).instrument) !== instrument) throw new Error('This unit belongs to another instrument. Open Lessons to choose one for your instrument.');
  units.set(`${instrument}:${id}`, unit);
  return unit;
}

/** The lesson if it was loaded in this visit, else fetched (the service worker may answer offline). */
export async function lessonForPractice(id: string, instrument: InstrumentId = 'piano'): Promise<Lesson> {
  return lessons.get(`${instrument}:${id}`) ?? getLesson(id, instrument);
}

export async function unitForPractice(id: string, instrument: InstrumentId = 'piano'): Promise<Unit> {
  return units.get(`${instrument}:${id}`) ?? getUnit(id, instrument);
}
