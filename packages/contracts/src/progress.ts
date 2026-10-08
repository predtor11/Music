import { z } from 'zod';

export const LessonStatusSchema = z.enum(['locked', 'available', 'in-progress', 'done']);

/** GET /api/progress */
export const ProgressSchema = z.object({
  userId: z.string().uuid(),
  units: z.array(
    z.object({
      unitId: z.string(),
      unlocked: z.boolean(),
      checkpointPassed: z.boolean(),
      lessons: z.array(z.object({ lessonId: z.string(), status: LessonStatusSchema })),
    }),
  ),
});
export type Progress = z.infer<typeof ProgressSchema>;

/** One skill's standing, for example skill "interval:M3". */
export const SkillScoreSchema = z.object({
  skill: z.string(),
  attempts: z.number().int().min(0),
  firstTryAccuracy: z.number().min(0).max(1),
  medianTimeMs: z.number().int().min(0).nullable(),
  /** When this skill is next due for review (spaced repetition). */
  dueAt: z.string().datetime().nullable(),
});
export type SkillScore = z.infer<typeof SkillScoreSchema>;

/** GET /api/progress/review-queue → skills due now, most urgent first. */
export const ReviewQueueSchema = z.array(SkillScoreSchema);

/** GET /api/progress/reports/weekly */
export const ProgressReportSchema = z.object({
  userId: z.string().uuid(),
  from: z.string().datetime(),
  to: z.string().datetime(),
  practice: z.object({ minutes: z.number().min(0), sessions: z.number().int().min(0), streakDays: z.number().int().min(0) }),
  /** Accuracy per topic per day, for trend lines. Topic is the part of the skill before ":". */
  accuracyTrend: z.array(z.object({ topic: z.string(), date: z.string(), firstTryAccuracy: z.number().min(0).max(1), attempts: z.number().int() })),
  /** Repeating mistake patterns, for example "mixes up major and minor 3rds". */
  patterns: z.array(z.object({ id: z.string(), description: z.string(), occurrences: z.number().int().min(1), skills: z.array(z.string()) })),
  speed: z.array(z.object({ skill: z.string(), medianTimeMs: z.number().int(), changePercent: z.number().nullable() })),
  /** 2 or 3 concrete next steps. */
  suggestions: z.array(z.object({ text: z.string(), lessonId: z.string().optional(), unitId: z.string().optional() })).max(3),
});
export type ProgressReport = z.infer<typeof ProgressReportSchema>;
