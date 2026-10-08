import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LessonSchema, UnitSchema, type Lesson, type TestItem, type Unit } from '@music/contracts';
import type { z } from 'zod';

/** Where the lesson content ships: services/curriculum/content. */
export const DEFAULT_CONTENT_DIR = fileURLToPath(new URL('../content', import.meta.url));

export interface Curriculum {
  /** Sorted by `order`. */
  units: Unit[];
  unitsById: Map<string, Unit>;
  lessonsById: Map<string, Lesson>;
}

/** Thrown at start-up when the content is broken; lists every problem found. */
export class ContentError extends Error {
  constructor(readonly problems: string[]) {
    super(`Curriculum content is invalid:\n- ${problems.join('\n- ')}`);
  }
}

function jsonFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => join(dir, name));
}

function readAll<T>(dir: string, root: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>, problems: string[]): T[] {
  const out: T[] = [];
  for (const file of jsonFiles(dir)) {
    const name = relative(root, file);
    let data: unknown;
    try {
      data = JSON.parse(readFileSync(file, 'utf8'));
    } catch (error) {
      problems.push(`${name}: not valid JSON (${(error as Error).message})`);
      continue;
    }
    const result = schema.safeParse(data);
    if (result.success) out.push(result.data);
    else for (const issue of result.error.issues) problems.push(`${name}: ${issue.path.join('.') || '(root)'}: ${issue.message}`);
  }
  return out;
}

/** Every test item in a unit's lessons and checkpoint, for checks and grading. */
export function unitItems(unit: Unit, lessonsById: Map<string, Lesson>): TestItem[] {
  const items = [...unit.checkpoint.items];
  for (const id of unit.lessonIds) {
    for (const step of lessonsById.get(id)?.steps ?? []) {
      if (step.type === 'play-along' || step.type === 'quiz') items.push(...step.items);
    }
  }
  return items;
}

/**
 * Read and validate every unit (content/units) and lesson (content/lessons).
 * Files must match UnitSchema and LessonSchema, and they must agree with each
 * other: ids unique, every listed lesson exists in its unit, orders run 1, 2, 3.
 */
export function loadCurriculum(dir: string = DEFAULT_CONTENT_DIR): Curriculum {
  const problems: string[] = [];
  const units = readAll(join(dir, 'units'), dir, UnitSchema, problems).sort((a, b) => a.order - b.order);
  const lessons = readAll(join(dir, 'lessons'), dir, LessonSchema, problems);

  const unitsById = new Map<string, Unit>();
  units.forEach((unit, i) => {
    if (unitsById.has(unit.id)) problems.push(`unit ${unit.id} appears twice`);
    unitsById.set(unit.id, unit);
    if (unit.order !== i + 1) problems.push(`unit ${unit.id} has order ${unit.order}, expected ${i + 1}`);
  });

  const lessonsById = new Map<string, Lesson>();
  for (const lesson of lessons) {
    if (lessonsById.has(lesson.id)) problems.push(`lesson ${lesson.id} appears twice`);
    lessonsById.set(lesson.id, lesson);
    const unit = unitsById.get(lesson.unitId);
    if (!unit) problems.push(`lesson ${lesson.id} names unit ${lesson.unitId}, which doesn't exist`);
    else if (!unit.lessonIds.includes(lesson.id)) problems.push(`lesson ${lesson.id} is not listed in unit ${unit.id}`);
  }

  const itemIds = new Set<string>();
  for (const unit of units) {
    unit.lessonIds.forEach((id, i) => {
      const lesson = lessonsById.get(id);
      if (!lesson) problems.push(`unit ${unit.id} lists lesson ${id}, which doesn't exist`);
      else if (lesson.unitId !== unit.id) problems.push(`unit ${unit.id} lists lesson ${id}, which belongs to ${lesson.unitId}`);
      else if (lesson.order !== i + 1) problems.push(`lesson ${id} has order ${lesson.order}, expected ${i + 1}`);
    });
    for (const item of unitItems(unit, lessonsById)) {
      if (itemIds.has(item.id)) problems.push(`test item ${item.id} appears twice`);
      itemIds.add(item.id);
    }
  }

  if (problems.length > 0) throw new ContentError(problems);
  return { units, unitsById, lessonsById };
}
