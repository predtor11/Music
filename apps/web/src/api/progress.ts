/** Calls to the progress service, through the gateway at /api/progress. */

import { ProgressSchema, ReviewQueueSchema, type Progress, type SkillScore } from '@music/contracts';
import { call } from './client.js';

/** Which units and lessons are open, started and done. */
export async function getProgress(): Promise<Progress> {
  return ProgressSchema.parse(await call('/progress/'));
}

/** Skills due for review now, most overdue first. */
export async function getReviewQueue(): Promise<SkillScore[]> {
  return ReviewQueueSchema.parse(await call('/progress/review-queue'));
}
