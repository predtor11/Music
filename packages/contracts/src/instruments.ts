import { z } from 'zod';

/** The instruments the app can learn. Piano is the default and what all earlier content is for. */
export const InstrumentIdSchema = z.enum(['piano', 'guitar']);
export type InstrumentId = z.infer<typeof InstrumentIdSchema>;
export const INSTRUMENTS: readonly InstrumentId[] = InstrumentIdSchema.options;

/** Piano is what a missing instrument means, so old data and old clients keep working. */
export function instrumentOf(x: { instrument?: InstrumentId | null }): InstrumentId {
  return x.instrument ?? 'piano';
}
