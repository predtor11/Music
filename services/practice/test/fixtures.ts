import { LessonSchema, UnitSchema, type Lesson, type Unit } from '@music/contracts';
import type { CurriculumClient } from '../src/curriculum-client.js';

export const lesson: Lesson = LessonSchema.parse({
  id: 'u1-l1',
  unitId: 'u1',
  order: 1,
  title: 'Finding C',
  summary: 'Find C anywhere on the keyboard.',
  minutes: 5,
  steps: [
    { type: 'explain', title: 'C is left of the two black keys', body: '...' },
    { type: 'play-along', title: 'Play C', items: [{ kind: 'find-note', id: 'pa-c', prompt: 'Play any C', pc: 0 }] },
    {
      type: 'quiz',
      title: 'Quiz',
      items: [
        { kind: 'find-note', id: 'q-c', prompt: 'Play any C', pc: 0 },
        { kind: 'find-note', id: 'q-g', prompt: 'Play any G', pc: 7 },
      ],
    },
  ],
});

export const unit: Unit = UnitSchema.parse({
  id: 'u1',
  order: 1,
  title: 'The keyboard',
  summary: 'Find your way around.',
  outcome: 'Name any white key.',
  lessonIds: ['u1-l1'],
  checkpoint: {
    passPercent: 75,
    items: [
      { kind: 'find-note', id: 'cp-c', prompt: 'Play C', pc: 0 },
      { kind: 'find-note', id: 'cp-d', prompt: 'Play D', pc: 2 },
      { kind: 'find-note', id: 'cp-e', prompt: 'Play E', pc: 4 },
      { kind: 'find-note', id: 'cp-f', prompt: 'Play F', pc: 5 },
    ],
  },
});

/** Curriculum client that serves the fixtures and counts calls. */
export class StubCurriculum implements CurriculumClient {
  calls: string[] = [];
  async getLesson(id: string) {
    this.calls.push(`lesson:${id}`);
    return id === lesson.id ? lesson : null;
  }
  async getUnit(id: string) {
    this.calls.push(`unit:${id}`);
    return id === unit.id ? unit : null;
  }
}
