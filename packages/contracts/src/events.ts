import { z } from 'zod';
import { StoredAttemptSchema } from './practice.js';

/**
 * Events services publish on the bus (Redis Streams in production, in memory
 * in tests). The stream name is the event type. Consumers must tolerate
 * receiving an event twice.
 */
export const EventEnvelopeSchema = <T extends z.ZodTypeAny>(type: string, data: T) =>
  z.object({
    id: z.string().uuid(),
    type: z.literal(type),
    occurredAt: z.string().datetime(),
    source: z.string(),
    data,
  });

export const UserCreatedEventSchema = EventEnvelopeSchema(
  'user.created',
  z.object({ userId: z.string().uuid(), displayName: z.string() }),
);
export type UserCreatedEvent = z.infer<typeof UserCreatedEventSchema>;

export const AttemptRecordedEventSchema = EventEnvelopeSchema('attempt.recorded', StoredAttemptSchema);
export type AttemptRecordedEvent = z.infer<typeof AttemptRecordedEventSchema>;

export const SessionEndedEventSchema = EventEnvelopeSchema(
  'session.ended',
  z.object({ sessionId: z.string().uuid(), userId: z.string().uuid(), kind: z.string(), refId: z.string().nullable(), passed: z.boolean().nullable() }),
);
export type SessionEndedEvent = z.infer<typeof SessionEndedEventSchema>;

export type MusicEvent = UserCreatedEvent | AttemptRecordedEvent | SessionEndedEvent;
export type MusicEventType = MusicEvent['type'];
