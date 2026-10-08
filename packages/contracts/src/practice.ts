import { z } from 'zod';
import { TestItemKindSchema, TestItemSchema } from './curriculum.js';

export const SessionKindSchema = z.enum(['lesson', 'checkpoint', 'review', 'free']);

/** POST /api/practice/sessions */
export const CreateSessionSchema = z.object({
  kind: SessionKindSchema,
  /** Lesson or unit id; omitted for review and free play. */
  refId: z.string().optional(),
});
export type CreateSession = z.infer<typeof CreateSessionSchema>;

export const SessionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  kind: SessionKindSchema,
  refId: z.string().nullable(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
});
export type Session = z.infer<typeof SessionSchema>;

/** GET /api/practice/sessions/:id/next-item → the next item, or null when done. */
export const NextItemSchema = TestItemSchema.nullable();

export const MistakeKindSchema = z.enum([
  'wrong-note',
  'wrong-octave',
  'missing-notes',
  'extra-notes',
  'wrong-inversion',
  'wrong-order',
  'wrong-choice',
]);
export type MistakeKind = z.infer<typeof MistakeKindSchema>;

/** POST /api/practice/attempts, sent by the web app after grading in the browser. */
export const AttemptSchema = z.object({
  sessionId: z.string().uuid(),
  itemId: z.string(),
  itemKind: TestItemKindSchema,
  /** Concept tag for reports, for example "interval:M3" or "chord:minor". */
  skill: z.string(),
  expected: z.array(z.number().int()),
  played: z.array(z.number().int()),
  correct: z.boolean(),
  /** True when right only after a retry. */
  retried: z.boolean().default(false),
  mistake: MistakeKindSchema.nullable().default(null),
  /** Milliseconds from prompt shown to answer complete. */
  timeMs: z.number().int().min(0),
  playedAt: z.string().datetime(),
});
export type Attempt = z.infer<typeof AttemptSchema>;

/** Stored attempt as returned by the service. */
export const StoredAttemptSchema = AttemptSchema.extend({ id: z.string().uuid(), userId: z.string().uuid() });
export type StoredAttempt = z.infer<typeof StoredAttemptSchema>;
