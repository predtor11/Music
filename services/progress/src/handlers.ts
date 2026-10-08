import { AttemptRecordedEventSchema, SessionEndedEventSchema, type AttemptRecordedEvent, type SessionEndedEvent } from '@music/contracts';
import type { EventBus } from '@music/service-kit';
import type { ProgressRepository } from './repository.js';
import { applyAttempt } from './skills.js';

export const CONSUMER_GROUP = 'progress';

/** Returns false when the event was already handled. */
export async function handleAttemptRecorded(repo: ProgressRepository, event: AttemptRecordedEvent): Promise<boolean> {
  const e = AttemptRecordedEventSchema.parse(event);
  return repo.recordAttempt(e.id, e.data, (prev) => applyAttempt(prev, e.data));
}

export async function handleSessionEnded(repo: ProgressRepository, event: SessionEndedEvent): Promise<boolean> {
  const e = SessionEndedEventSchema.parse(event);
  return repo.recordSessionEnded(e.id, e.data, e.occurredAt);
}

export async function subscribe(bus: EventBus, repo: ProgressRepository): Promise<void> {
  await bus.subscribe('attempt.recorded', CONSUMER_GROUP, async (e) => void (await handleAttemptRecorded(repo, e)));
  await bus.subscribe('session.ended', CONSUMER_GROUP, async (e) => void (await handleSessionEnded(repo, e)));
}
