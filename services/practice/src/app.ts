import { randomUUID } from 'node:crypto';
import {
  AttemptSchema,
  CreateSessionSchema,
  type AttemptRecordedEvent,
  type Lesson,
  type Session,
  type SessionEndedEvent,
  type StoredAttempt,
  type TestItem,
} from '@music/contracts';
import { createService, requireUserId, type EventBus } from '@music/service-kit';
import { z } from 'zod';
import type { CurriculumClient } from './curriculum-client.js';
import type { ProgressClient } from './progress-client.js';
import type { PracticeRepository, SessionRecord } from './repository.js';
import { candidates, pickReviewItems, reachedContent } from './review.js';
import { nextItem, summarize, type SessionSummary } from './scoring.js';

/** Pass mark for lesson quizzes. Checkpoints use the unit's own passPercent. */
export const LESSON_PASS_PERCENT = 80;

export interface PracticeDeps {
  repo: PracticeRepository;
  bus: EventBus;
  curriculum: CurriculumClient;
  /** Needed for review sessions; without it a review has no items. */
  progress?: ProgressClient;
  logger?: boolean;
  /** Clock, replaceable in tests. */
  now?: () => Date;
}

const SessionParamsSchema = z.object({ id: z.string().uuid() });

function httpError(statusCode: number, message: string): Error {
  return Object.assign(new Error(message), { statusCode });
}

function toSession(record: SessionRecord): Session {
  const { id, userId, kind, refId, startedAt, endedAt } = record;
  return { id, userId, kind, refId, startedAt, endedAt };
}

/** The items a lesson tests, in step order: play-along items, then the quiz. */
export function lessonItems(lesson: Lesson): TestItem[] {
  const seen = new Set<string>();
  const items: TestItem[] = [];
  for (const step of lesson.steps) {
    if (step.type !== 'play-along' && step.type !== 'quiz') continue;
    for (const item of step.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
    }
  }
  return items;
}

/**
 * The practice service: sessions and attempts. The web app grades MIDI in the
 * browser and posts each result here; this service stores it, publishes
 * attempt.recorded, and scores the session when it ends (session.ended).
 */
export function buildApp(deps: PracticeDeps) {
  const { repo, bus, curriculum, progress } = deps;
  const now = deps.now ?? (() => new Date());
  const app = createService({ name: 'practice', logger: deps.logger });

  /** The caller's session, or 404 (also for someone else's session). */
  async function ownSession(id: string, userId: string): Promise<SessionRecord> {
    const session = await repo.getSession(id);
    if (!session || session.userId !== userId) throw httpError(404, 'session not found');
    return session;
  }

  /**
   * Items for the skills due now, weakest first, taken only from lessons the
   * learner has reached and checkpoints they passed.
   */
  async function reviewItems(userId: string): Promise<TestItem[]> {
    const [queue, standing] = await Promise.all([progress!.getReviewQueue(userId), progress!.getProgress(userId)]);
    if (queue.length === 0) return [];
    const reached = reachedContent(standing);
    const [lessons, units] = await Promise.all([
      Promise.all(reached.lessonIds.map((id) => curriculum.getLesson(id))),
      Promise.all(reached.unitIds.map((id) => curriculum.getUnit(id))),
    ]);
    const present = <T>(x: T | null): x is T => x !== null;
    return pickReviewItems(queue, candidates(lessons.filter(present), units.filter(present)));
  }

  // POST /sessions { kind, refId? } → Session
  app.post('/sessions', async (req, reply): Promise<Session> => {
    const userId = requireUserId(req);
    const body = CreateSessionSchema.parse(req.body);
    let items: TestItem[] = [];
    let passPercent: number | null = null;

    if (body.kind === 'lesson' || body.kind === 'checkpoint') {
      if (!body.refId) throw httpError(400, `${body.kind} sessions need a refId`);
      if (body.kind === 'lesson') {
        const lesson = await curriculum.getLesson(body.refId);
        if (!lesson) throw httpError(404, `lesson ${body.refId} not found`);
        items = lessonItems(lesson);
        passPercent = items.length > 0 ? LESSON_PASS_PERCENT : null;
      } else {
        const unit = await curriculum.getUnit(body.refId);
        if (!unit) throw httpError(404, `unit ${body.refId} not found`);
        items = unit.checkpoint.items;
        passPercent = unit.checkpoint.passPercent;
      }
    } else if (body.kind === 'review' && progress) {
      items = await reviewItems(userId);
    }

    const record: SessionRecord = {
      id: randomUUID(),
      userId,
      kind: body.kind,
      refId: body.refId ?? null,
      startedAt: now().toISOString(),
      endedAt: null,
      items,
      passPercent,
      passed: null,
    };
    await repo.createSession(record);
    reply.status(201);
    return toSession(record);
  });

  // GET /sessions/:id → Session
  app.get('/sessions/:id', async (req): Promise<Session> => {
    const { id } = SessionParamsSchema.parse(req.params);
    return toSession(await ownSession(id, requireUserId(req)));
  });

  // GET /sessions/:id/next-item → TestItem | null (null when the session is done)
  app.get('/sessions/:id/next-item', async (req, reply) => {
    const { id } = SessionParamsSchema.parse(req.params);
    const session = await ownSession(id, requireUserId(req));
    const item: TestItem | null = session.endedAt ? null : nextItem(session.items, await repo.listAttempts(id));
    // Serialized by hand so "done" is a JSON null, not an empty body.
    return reply.type('application/json').send(JSON.stringify(item));
  });

  // POST /attempts (AttemptSchema) → StoredAttempt, publishes attempt.recorded
  app.post('/attempts', async (req, reply): Promise<StoredAttempt> => {
    const userId = requireUserId(req);
    const attempt = AttemptSchema.parse(req.body);
    const session = await ownSession(attempt.sessionId, userId);
    if (session.endedAt) throw httpError(409, 'session has ended');
    if (session.items.length > 0 && !session.items.some((item) => item.id === attempt.itemId)) {
      throw httpError(400, `item ${attempt.itemId} is not part of this session`);
    }

    const stored: StoredAttempt = { ...attempt, id: randomUUID(), userId };
    await repo.addAttempt(stored);
    const event: AttemptRecordedEvent = {
      id: randomUUID(),
      type: 'attempt.recorded',
      occurredAt: now().toISOString(),
      source: 'practice',
      data: stored,
    };
    await bus.publish(event);
    reply.status(201);
    return stored;
  });

  // POST /sessions/:id/end → { session, summary }, publishes session.ended once
  app.post('/sessions/:id/end', async (req): Promise<{ session: Session; summary: SessionSummary }> => {
    const { id } = SessionParamsSchema.parse(req.params);
    const userId = requireUserId(req);
    const session = await ownSession(id, userId);
    const summary = summarize(session.items, await repo.listAttempts(id), session.passPercent);

    const endedAt = now().toISOString();
    if (await repo.endSession(id, endedAt, summary.passed)) {
      const event: SessionEndedEvent = {
        id: randomUUID(),
        type: 'session.ended',
        occurredAt: endedAt,
        source: 'practice',
        data: { sessionId: id, userId, kind: session.kind, refId: session.refId, passed: summary.passed },
      };
      await bus.publish(event);
    }
    // Ending twice returns the first result without publishing again.
    const ended = (await repo.getSession(id))!;
    return { session: toSession(ended), summary: { ...summary, passed: ended.passed } };
  });

  return app;
}
