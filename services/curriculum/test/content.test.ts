import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT_DIR, loadCurriculum, unitItems } from '../src/content.js';
import { checkItem } from './check-items.js';

const curriculum = loadCurriculum();
const STEP_TYPES = ['explain', 'show', 'play-along', 'explore', 'quiz'];

describe('curriculum content', () => {
  it('loads every unit and lesson file against the schemas', () => {
    expect(curriculum.units.map((u) => u.id)).toEqual(['unit-1', 'unit-2']);
    expect(curriculum.lessonsById.size).toBe(11);
  });

  for (const unit of curriculum.units) {
    describe(unit.title, () => {
      it('has 4 to 6 lessons', () => {
        expect(unit.lessonIds.length).toBeGreaterThanOrEqual(4);
        expect(unit.lessonIds.length).toBeLessThanOrEqual(6);
      });

      it('has a checkpoint', () => {
        expect(unit.checkpoint.items.length).toBeGreaterThanOrEqual(8);
      });

      for (const id of unit.lessonIds) {
        it(`lesson ${id} has explain, show, play-along, explore and quiz steps`, () => {
          const types = new Set(curriculum.lessonsById.get(id)!.steps.map((s) => s.type));
          expect([...types].sort()).toEqual([...STEP_TYPES].sort());
        });

        it(`lesson ${id} shows every explain and show step on the keyboard`, () => {
          // Read the raw file: `labels` is not in the contract yet, so zod drops it.
          const raw = JSON.parse(readFileSync(join(DEFAULT_CONTENT_DIR, 'lessons', unit.id, `${id}.json`), 'utf8'));
          for (const step of raw.steps as Array<{ type: string; title: string; exampleMidi?: number[]; highlightMidi?: number[]; labels?: Record<string, string> }>) {
            if (step.type !== 'explain' && step.type !== 'show') continue;
            const keys = step.exampleMidi ?? step.highlightMidi ?? [];
            expect(keys.length, `${step.title} has no keys`).toBeGreaterThan(0);
            for (const k of Object.keys(step.labels ?? {})) expect(keys, `${step.title} labels key ${k}, which it doesn't light`).toContain(Number(k));
          }
        });

        it(`lesson ${id} lights only keys on an 88-key keyboard`, () => {
          for (const step of curriculum.lessonsById.get(id)!.steps) {
            const keys = step.type === 'show' ? step.highlightMidi : step.type === 'explain' ? (step.exampleMidi ?? []) : [];
            for (const k of keys) expect(k).toBeGreaterThanOrEqual(21), expect(k).toBeLessThanOrEqual(108);
          }
        });
      }

      for (const item of unitItems(unit, curriculum.lessonsById)) {
        it(`item ${item.id} matches its prompt`, () => {
          expect(checkItem(item)).toEqual([]);
        });
      }
    });
  }
});
