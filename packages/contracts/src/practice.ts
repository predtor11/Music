import { z } from 'zod';
import { InstrumentIdSchema } from './instruments.js';
import { TestItemKindSchema, TestItemSchema } from './curriculum.js';

export const SessionKindSchema = z.enum(['lesson', 'checkpoint', 'review', 'free']);

/** POST /api/practice/sessions */
export const CreateSessionSchema = z.object({
  /**
   * Chosen by the app (offline mode makes sessions before the server sees them).
   * Sending the same id again returns the same session, so a retry is safe.
   */
  id: z.string().uuid().optional(),
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
  /** Chosen by the app; an attempt sent twice with the same id is stored once. */
  id: z.string().uuid().optional(),
  sessionId: z.string().uuid(),
  /** Instrument the attempt was played on; keeps progress and reports apart per instrument. Missing means piano. */
  instrument: InstrumentIdSchema.optional(),
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

/** POST /api/practice/sessions/:id/end → the ended session and its score. */
export const SessionSummarySchema = z.object({
  total: z.number().int().min(0),
  answered: z.number().int().min(0),
  /** Items whose first attempt was right without a retry. */
  firstTryCorrect: z.number().int().min(0),
  /** firstTryCorrect / total as a percentage, or null for a session with no items. */
  accuracy: z.number().min(0).max(100).nullable(),
  /** Checkpoint or lesson pass; null for review and free play. */
  passed: z.boolean().nullable(),
});
export type SessionSummary = z.infer<typeof SessionSummarySchema>;

export const EndSessionResponseSchema = z.object({ session: SessionSchema, summary: SessionSummarySchema });
export type EndSessionResponse = z.infer<typeof EndSessionResponseSchema>;
