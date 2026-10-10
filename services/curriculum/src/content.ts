import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INSTRUMENTS, LessonSchema, UnitSchema, instrumentOf, type Lesson, type TestItem, type Unit } from '@music/contracts';
import type { z } from 'zod';
import { OPEN_CHORD_SHAPES } from '@music/theory';
import { GlossarySchema, type GlossaryTerm } from './glossary.js';

/** Where the lesson content ships: services/curriculum/content. */
export const DEFAULT_CONTENT_DIR = fileURLToPath(new URL('../content', import.meta.url));

export interface Curriculum {
  /** Sorted by `order`. */
  units: Unit[];
  unitsById: Map<string, Unit>;
  lessonsById: Map<string, Lesson>;
  /** In teaching order: by unit, then lesson, then file order. */
  glossary: GlossaryTerm[];
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

function readOne<T>(file: string, root: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>, problems: string[]): T | undefined {
  const name = relative(root, file);
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    problems.push(`${name}: not valid JSON (${(error as Error).message})`);
    return undefined;
  }
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  for (const issue of result.error.issues) problems.push(`${name}: ${issue.path.join('.') || '(root)'}: ${issue.message}`);
  return undefined;
}

function readAll<T>(dir: string, root: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>, problems: string[]): T[] {
  return jsonFiles(dir).flatMap((file) => {
    const value = readOne(file, root, schema, problems);
    return value === undefined ? [] : [value];
  });
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
 * Read and validate every unit (content/units), lesson (content/lessons) and
 * glossary term (content/glossary.json). Files must match their schemas, and
 * they must agree with each other: ids unique, every listed lesson exists in
 * its unit, orders run 1, 2, 3, and every term names a real lesson.
 */
export function loadCurriculum(dir: string = DEFAULT_CONTENT_DIR): Curriculum {
  const problems: string[] = [];
  // Piano first, then the other instruments; each instrument's units are numbered 1, 2, 3 on their own.
  const units = readAll(join(dir, 'units'), dir, UnitSchema, problems).sort(
    (a, b) => INSTRUMENTS.indexOf(instrumentOf(a)) - INSTRUMENTS.indexOf(instrumentOf(b)) || a.order - b.order,
  );
  const lessons = readAll(join(dir, 'lessons'), dir, LessonSchema, problems);

  const unitsById = new Map<string, Unit>();
  const unitsPerInstrument = new Map<string, number>();
  for (const unit of units) {
    if (unitsById.has(unit.id)) problems.push(`unit ${unit.id} appears twice`);
    unitsById.set(unit.id, unit);
    const count = (unitsPerInstrument.get(instrumentOf(unit)) ?? 0) + 1;
    unitsPerInstrument.set(instrumentOf(unit), count);
    if (unit.order !== count) problems.push(`unit ${unit.id} has order ${unit.order}, expected ${count}`);
  }
  for (const lesson of lessons) {
    const unit = unitsById.get(lesson.unitId);
    if (lesson.guitarChord && !OPEN_CHORD_SHAPES.some((s) => s.name === lesson.guitarChord)) {
      problems.push(`lesson ${lesson.id} names unknown guitar chord shape ${lesson.guitarChord}`);
    }
    if (unit && instrumentOf(lesson) !== instrumentOf(unit)) problems.push(`lesson ${lesson.id} is for ${instrumentOf(lesson)}, but unit ${unit.id} is for ${instrumentOf(unit)}`);
  }

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

  const glossaryFile = join(dir, 'glossary.json');
  const terms = existsSync(glossaryFile) ? (readOne(glossaryFile, dir, GlossarySchema, problems) ?? []) : [];
  const lessonRank = new Map(units.flatMap((unit) => unit.lessonIds).map((id, i) => [id, i]));
  const termIds = new Set<string>();
  for (const term of terms) {
    if (termIds.has(term.id)) problems.push(`glossary term ${term.id} appears twice`);
    termIds.add(term.id);
    if (!lessonRank.has(term.lessonId)) problems.push(`glossary term ${term.id} names lesson ${term.lessonId}, which doesn't exist`);
  }
  const glossary = terms
    .map((term, i) => ({ term, i }))
    .sort((a, b) => (lessonRank.get(a.term.lessonId) ?? 0) - (lessonRank.get(b.term.lessonId) ?? 0) || a.i - b.i)
    .map(({ term }) => term);

  if (problems.length > 0) throw new ContentError(problems);
  return { units, unitsById, lessonsById, glossary };
}
