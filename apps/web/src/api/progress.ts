/** Calls to the progress service, through the gateway at /api/progress. */

import { ProgressSchema, ReviewQueueSchema, type Progress, type SkillScore } from '@music/contracts';
import { call } from './client.js';
import { instrumentPath, type InstrumentId } from '../instruments/model.js';

/** Which units and lessons are open, started and done. */
export async function getProgress(instrument: InstrumentId = 'piano'): Promise<Progress> {
  return ProgressSchema.parse(await call(instrumentPath('/progress/', instrument)));
}

/** Skills due for review now, most overdue first. */
export async function getReviewQueue(instrument: InstrumentId = 'piano'): Promise<SkillScore[]> {
  return ReviewQueueSchema.parse(await call(instrumentPath('/progress/review-queue', instrument)));
}
