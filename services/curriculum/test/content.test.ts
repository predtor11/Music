import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT_DIR, loadCurriculum } from '../src/content.js';
import { checkItem } from './check-items.js';

const curriculum = loadCurriculum();
const STEP_TYPES = ['explain', 'show', 'play-along', 'explore', 'quiz'];

interface RawStep {
  type: string;
  title: string;
  body?: string;
  exampleMidi?: number[];
  highlightMidi?: number[];
  labels?: Record<string, string>;
  items?: Array<{ prompt: string; choices?: string[] }>;
}

/** The lesson file as written, so the check sees every word the learner sees. */
function rawLesson(unitId: string, id: string): { title: string; summary: string; steps: RawStep[] } {
  return JSON.parse(readFileSync(join(DEFAULT_CONTENT_DIR, 'lessons', unitId, `${id}.json`), 'utf8'));
}

function lessonText(unitId: string, id: string): string {
  const raw = rawLesson(unitId, id);
  const parts = [raw.title, raw.summary];
  for (const step of raw.steps) {
    parts.push(step.title, step.body ?? '', ...Object.values(step.labels ?? {}));
    for (const item of step.items ?? []) parts.push(item.prompt, ...(item.choices ?? []));
  }
  return parts.join('\n');
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Matches a term or one of its aliases as a word (plurals too), or a symbol alias anywhere. */
function usePattern(words: string[]): RegExp {
  const alternatives = words.map((w) => (/^\W+$/.test(w) ? escape(w) : `(?<![\\w-])${escape(w)}(?:s|es)?(?![\\w-])`));
  return new RegExp(alternatives.join('|'), 'i');
}

/** ASCII spellings in prompts and choices: "F#" uses a sharp, "Bb" a flat. */
const EXTRA_USES: Record<string, RegExp> = { sharp: /[A-G]#/, flat: /(?<![A-Za-z])[A-G]b(?![A-Za-z])/ };

/**
 * Terms whose plain word means something else too. "key" is also a piano key,
 * so only its musical uses count: "the key of G", "what key is it in?".
 */
const USE_PATTERNS: Record<string, RegExp> = { key: /\b(?:the key of|in the key|what key is|which (?:major )?key has)\b/i };

const lessonOrder = curriculum.units.flatMap((unit) => unit.lessonIds.map((id) => ({ unitId: unit.id, id })));

describe('curriculum content', () => {
  it('loads every unit, lesson and glossary file against the schemas', () => {
    expect(curriculum.units.map((u) => u.id)).toEqual(['unit-1', 'unit-2', 'unit-3', 'unit-4', 'unit-5', 'unit-6', 'unit-7']);
    expect(curriculum.lessonsById.size).toBe(89);
    expect(curriculum.glossary.length).toBe(108);
  });

  for (const unit of curriculum.units) {
    describe(unit.title, () => {
      it('has at least 4 lessons', () => {
        expect(unit.lessonIds.length).toBeGreaterThanOrEqual(4);
      });

      it('has a checkpoint', () => {
        expect(unit.checkpoint.items.length).toBeGreaterThanOrEqual(8);
      });

      for (const item of unit.checkpoint.items) {
        it(`checkpoint item ${item.id} matches its prompt`, () => {
          expect(checkItem(item)).toEqual([]);
        });
      }

      for (const id of unit.lessonIds) {
        const lesson = curriculum.lessonsById.get(id)!;

        it(`lesson ${id} has explain, show, play-along, explore and quiz steps`, () => {
          const types = new Set(lesson.steps.map((s) => s.type));
          expect([...types].sort()).toEqual([...STEP_TYPES].sort());
        });

        it(`lesson ${id} shows every explain and show step on the keyboard`, () => {
          for (const step of rawLesson(unit.id, id).steps) {
            if (step.type !== 'explain' && step.type !== 'show') continue;
            const keys = step.exampleMidi ?? step.highlightMidi ?? [];
            expect(keys.length, `${step.title} has no keys`).toBeGreaterThan(0);
            for (const k of keys) expect(k).toBeGreaterThanOrEqual(21), expect(k).toBeLessThanOrEqual(108);
            for (const k of Object.keys(step.labels ?? {})) expect(keys, `${step.title} labels key ${k}, which it doesn't light`).toContain(Number(k));
          }
        });

        for (const step of lesson.steps) {
          if (step.type !== 'play-along' && step.type !== 'quiz') continue;
          for (const item of step.items) {
            it(`item ${item.id} matches its prompt`, () => {
              expect(checkItem(item, step.type)).toEqual([]);
            });
          }
        }
      }
    });
  }
});

describe('glossary', () => {
  for (const term of curriculum.glossary) {
    const at = lessonOrder.findIndex((l) => l.id === term.lessonId);

    it(`"${term.term}" is introduced in bold in ${term.lessonId}`, () => {
      const lesson = curriculum.lessonsById.get(term.lessonId)!;
      const bold = new RegExp(`\\*\\*${escape(term.term)}(?:s|es)?\\*\\*`, 'i');
      expect(lesson.steps.some((s) => s.type === 'explain' && bold.test(s.body))).toBe(true);
    });

    it(`"${term.term}" is not used before ${term.lessonId}`, () => {
      const pattern = USE_PATTERNS[term.id] ?? usePattern([term.term, ...term.aliases]);
      const extra = EXTRA_USES[term.id];
      const earlyUses = lessonOrder
        .slice(0, at)
        .filter((l) => {
          const text = lessonText(l.unitId, l.id);
          return pattern.test(text) || (extra?.test(text) ?? false);
        })
        .map((l) => l.id);
      expect(earlyUses).toEqual([]);
    });
  }

  it('lists terms in teaching order', () => {
    const ranks = curriculum.glossary.map((t) => lessonOrder.findIndex((l) => l.id === t.lessonId));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });
});
