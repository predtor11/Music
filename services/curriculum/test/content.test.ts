import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONTENT_DIR, loadCurriculum } from '../src/content.js';
import { checkItem } from './check-items.js';
import { chordShapeMidi, OPEN_CHORD_SHAPES, fretToMidi, STANDARD_TUNING } from '@music/theory';
import { instrumentOf } from '@music/contracts';

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
 * so only its musical uses count: "the key of G", "what key is it in?". "rest" is
 * also plain English ("the rest"), so only "a rest" or "quarter rest" counts.
 */
const USE_PATTERNS: Record<string, RegExp> = {
  key: /\b(?:the key of|in the key|what key is|which (?:major )?key has)\b/i,
  rest: /\b(?:quarter|half|whole|eighth|a) rests?\b/i,
  // A tuning peg is a physical part, taught before the act of tuning.
  tuning: /\btuning\b(?! pegs?\b)/i,
};

const lessonOrder = curriculum.units.flatMap((unit) => unit.lessonIds.map((id) => ({ unitId: unit.id, id })));

describe('curriculum content', () => {
  it('loads every unit, lesson and glossary file against the schemas', () => {
    expect(curriculum.units.map((u) => u.id)).toEqual(['unit-1', 'unit-2', 'unit-3', 'unit-4', 'unit-5', 'unit-6', 'unit-7', 'unit-8', 'guitar-intro', 'guitar-1', 'guitar-2', 'guitar-3', 'guitar-4']);
    expect(curriculum.lessonsById.size).toBe(149);
    expect(curriculum.glossary.length).toBe(152);
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
      const lesson = curriculum.lessonsById.get(term.lessonId)!;
      const pattern = USE_PATTERNS[term.id] ?? usePattern([term.term, ...term.aliases]);
      const extra = EXTRA_USES[term.id];
      const earlyUses = lessonOrder
        .slice(0, at)
        .filter((l) => instrumentOf(curriculum.lessonsById.get(l.id)!) === instrumentOf(lesson))
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

 describe('guitar scale routes', () => {
  for (const id of ['g3-l8', 'g3-l9']) {
    it(`${id} maps its tab route to the taught scale, in ascending order`, () => {
      const lesson = curriculum.lessonsById.get(id)!;
      const notes = lesson.guitarPattern!.positions.map((p) => fretToMidi(STANDARD_TUNING, p));
      const show = lesson.steps.find((s) => s.type === 'show')!;
      expect(show.type === 'show' && show.highlightMidi).toEqual(notes);
      expect(notes.every((n, i) => i === 0 || n > notes[i - 1]!)).toBe(true);
      const play = lesson.steps.find((s) => s.type === 'play-along')!;
      const item = play.type === 'play-along' && play.items[0];
      expect(item && item.kind === 'play-scale' && item.sequence).toEqual(notes.map((n) => n % 12));
    });
  }
});

describe('guitar chord diagrams', () => {
  for (const lesson of curriculum.lessonsById.values()) {
    if (!lesson.guitarChord) continue;
    it(`${lesson.id} teaches the same notes as its canonical open shape`, () => {
      const shape = OPEN_CHORD_SHAPES.find((s) => s.name === lesson.guitarChord)!;
      const notes = chordShapeMidi(STANDARD_TUNING, shape);
      const show = lesson.steps.find((s) => s.type === 'show')!;
      expect(show.type === 'show' && show.highlightMidi).toEqual(notes);
      const pcs = [...new Set(notes.map((n) => n % 12))].sort((a, b) => a - b);
      for (const step of lesson.steps) {
        if (step.type !== 'play-along' && step.type !== 'quiz') continue;
        for (const item of step.items) {
          if (item.kind === 'build-chord') expect([...item.pitchClasses].sort((a, b) => a - b)).toEqual(pcs);
        }
      }
    });
  }
});
