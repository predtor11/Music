import { randomUUID } from 'node:crypto';
import { LessonSchema, NextItemSchema, type Lesson, type Progress, type SkillScore } from '@music/contracts';
import { InMemoryEventBus } from '@music/service-kit';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { CurriculumClient } from '../src/curriculum-client.js';
import type { ProgressClient } from '../src/progress-client.js';
import { InMemoryPracticeRepository } from '../src/repository.js';
import { candidates, pickReviewItems, reachedContent } from '../src/review.js';
import { lesson, unit } from './fixtures.js';

const score = (skill: string, firstTryAccuracy: number, dueAt = '2026-10-08T06:00:00.000Z'): SkillScore => ({
  skill,
  attempts: 4,
  firstTryAccuracy,
  medianTimeMs: 1500,
  dueAt,
});

/** A second lesson with intervals, so there are several skills to choose from. */
const lesson2: Lesson = LessonSchema.parse({
  id: 'u1-l2',
  unitId: 'u1',
  order: 2,
  title: 'Steps',
  summary: 'Half and whole steps.',
  minutes: 5,
  steps: [
    { type: 'play-along', title: 'Try', items: [{ kind: 'play-interval', id: 'l2-p1', prompt: 'Up a whole step', startMidi: 60, semitones: 2 }] },
    {
      type: 'quiz',
      title: 'Quiz',
      items: [
        { kind: 'play-interval', id: 'l2-q1', prompt: 'Up a half step from E', startMidi: 64, semitones: 1 },
        { kind: 'play-interval', id: 'l2-q2', prompt: 'Up a whole step from D', startMidi: 62, semitones: 2 },
        { kind: 'find-note', id: 'l2-q3', prompt: 'Play any C', pc: 0 },
      ],
    },
  ],
});

const locked: Lesson = LessonSchema.parse({ ...lesson2, id: 'u1-l3', order: 3, steps: [{ type: 'quiz', title: 'Q', items: [{ kind: 'find-note', id: 'l3-q1', prompt: 'Play any C', pc: 0 }] }] });

const progressFor = (userId: string, checkpointPassed = false): Progress => ({
  userId,
  units: [
    {
      unitId: 'u1',
      unlocked: true,
      checkpointPassed,
      lessons: [
        { lessonId: 'u1-l1', status: 'done' },
        { lessonId: 'u1-l2', status: 'in-progress' },
        { lessonId: 'u1-l3', status: 'locked' },
      ],
    },
  ],
});

describe('pickReviewItems', () => {
  it('keeps guitar lesson and checkpoint skills separate from piano', () => {
    const guitarLesson = { ...lesson2, instrument: 'guitar' as const };
    const guitarUnit = { ...unit, instrument: 'guitar' as const };
    const guitarPool = candidates([guitarLesson], [guitarUnit]);
    expect(guitarPool.every((c) => c.skill.startsWith('g:'))).toBe(true);
    expect(pickReviewItems([score('interval:M2', 0.2)], guitarPool)).toEqual([]);
    expect(pickReviewItems([score('g:interval:M2', 0.2)], guitarPool).length).toBeGreaterThan(0);
  });
  const pool = candidates([lesson, lesson2, locked], [unit]);

  it('tags every item with the shared skill names', () => {
    expect(pool.find((c) => c.item.id === 'l2-q1')?.skill).toBe('interval:m2');
    expect(pool.find((c) => c.item.id === 'pa-c')).toMatchObject({ skill: 'note:C', fromQuiz: false });
  });

  it('serves the weakest skill first, one item per skill per round, quiz items first', () => {
    const picked = pickReviewItems([score('note:C', 0.9), score('interval:M2', 0.2), score('interval:m2', 0.5)], pool, 6);
    expect(picked.map((i) => i.id)).toEqual(['l2-q2', 'l2-q1', 'q-c', 'l2-p1', 'l2-q3', 'l3-q1']);
  });

  it('breaks accuracy ties by how long the skill has been due', () => {
    const picked = pickReviewItems([score('interval:M2', 0.5, '2026-10-08T07:00:00.000Z'), score('interval:m2', 0.5, '2026-10-07T07:00:00.000Z')], pool, 2);
    expect(picked.map((i) => i.id)).toEqual(['l2-q1', 'l2-q2']);
  });

  it('stops at the limit and when items run out, and ignores skills with no items', () => {
    expect(pickReviewItems([score('interval:M2', 0.2)], pool, 10).map((i) => i.id)).toEqual(['l2-q2', 'l2-p1']);
    expect(pickReviewItems([score('chord:C-E-G', 0)], pool)).toEqual([]);
    expect(pickReviewItems([score('note:C', 0)], pool, 2)).toHaveLength(2);
  });

  it('reads reached lessons and passed checkpoints from progress', () => {
    expect(reachedContent(progressFor(randomUUID(), true))).toEqual({ lessonIds: ['u1-l1', 'u1-l2'], unitIds: ['u1'] });
    expect(reachedContent(progressFor(randomUUID())).unitIds).toEqual([]);
  });
});

describe('review sessions', () => {
  const lessons = new Map([lesson, lesson2, locked].map((l) => [l.id, l]));
  const curriculum: CurriculumClient = {
    getLesson: async (id) => lessons.get(id) ?? null,
    getUnit: async (id) => (id === unit.id ? unit : null),
  };

  function setup(queue: SkillScore[], checkpointPassed = false) {
    const seen: string[] = [];
    const progress: ProgressClient = {
      getReviewQueue: async (userId) => (seen.push(userId), queue),
      getProgress: async (userId) => progressFor(userId, checkpointPassed),
    };
    const app = buildApp({ repo: new InMemoryPracticeRepository(), bus: new InMemoryEventBus(), curriculum, progress, logger: false });
    return { app, seen };
  }

  async function startReview(app: ReturnType<typeof buildApp>, userId: string) {
    const headers = { 'x-user-id': userId };
    const res = await app.inject({ method: 'POST', url: '/sessions', headers, payload: { kind: 'review' } });
    expect(res.statusCode).toBe(201);
    const id = res.json().id as string;
    const next = async () => NextItemSchema.parse((await app.inject({ url: `/sessions/${id}/next-item`, headers })).json());
    return { id, headers, next };
  }

  async function drain(app: ReturnType<typeof buildApp>, review: Awaited<ReturnType<typeof startReview>>): Promise<string[]> {
    const ids: string[] = [];
    for (let item = await review.next(); item; item = await review.next()) {
      ids.push(item.id);
      const attempt = { sessionId: review.id, itemId: item.id, itemKind: item.kind, skill: 'note:C', expected: [0], played: [60], correct: true, timeMs: 900, playedAt: '2026-10-08T07:00:00.000Z' };
      expect((await app.inject({ method: 'POST', url: '/attempts', headers: review.headers, payload: attempt })).statusCode).toBe(201);
    }
    return ids;
  }

  it('serves items for the due skills from reached content only, and is ungraded', async () => {
    const userId = randomUUID();
    const { app, seen } = setup([score('note:C', 0.3)]);
    const review = await startReview(app, userId);
    expect(seen).toEqual([userId]);
    // l3-q1 is in a locked lesson and cp-c in a checkpoint not yet passed.
    expect(await drain(app, review)).toEqual(['q-c', 'l2-q3', 'pa-c']);

    const ended = await app.inject({ method: 'POST', url: `/sessions/${review.id}/end`, headers: review.headers });
    expect(ended.json().summary).toMatchObject({ total: 3, firstTryCorrect: 3, passed: null });
  });

  it('includes checkpoint items once the checkpoint is passed', async () => {
    const { app } = setup([score('note:C', 0.3)], true);
    expect(await drain(app, await startReview(app, randomUUID()))).toEqual(['q-c', 'l2-q3', 'cp-c', 'pa-c']);
  });

  it('has no items when nothing is due', async () => {
    const { app } = setup([]);
    const { next } = await startReview(app, randomUUID());
    expect(await next()).toBeNull();
  });
});
