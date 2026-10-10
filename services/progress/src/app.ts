import { InstrumentIdSchema, instrumentOf, ProgressSchema, ProgressReportSchema, ReviewQueueSchema, type InstrumentId, type Progress, type ProgressReport, type SkillScore } from '@music/contracts';
import { createService, requireUserId, type EventBus } from '@music/service-kit';
import { z } from 'zod';
import { CurriculumCatalog, type Catalog } from './catalog.js';
import { subscribe } from './handlers.js';
import { InMemoryProgressRepository, type ProgressRepository } from './repository.js';
import { buildWeeklyReport } from './report.js';
import { DAY, reviewQueue } from './skills.js';
import { computeProgress } from './unlocks.js';

export interface ProgressAppOptions {
  logger?: boolean;
  repo?: ProgressRepository;
  catalog?: Catalog;
  /** When given, the service handles attempt.recorded and session.ended from it. */
  bus?: EventBus;
  now?: () => Date;
}

const InstrumentQuerySchema = z.object({ instrument: InstrumentIdSchema.default('piano') });

const ReportQuerySchema = InstrumentQuerySchema.extend({
  /** End of the 7-day window; defaults to now. */
  to: z.string().datetime().optional(),
  /** Minutes ahead of UTC, so days split at the learner's midnight (India: 330). */
  tzOffset: z.coerce.number().int().min(-720).max(840).default(0),
});

/**
 * The progress service: unlocks, skill scores, the review queue and the
 * weekly report, built from attempt.recorded and session.ended events.
 * Routes sit under /api/progress at the gateway.
 */
export async function buildApp(options: ProgressAppOptions = {}) {
  const app = createService({ name: 'progress', logger: options.logger });
  const repo = options.repo ?? new InMemoryProgressRepository();
  const catalog = options.catalog ?? new CurriculumCatalog();
  const now = options.now ?? (() => new Date());
  if (options.bus) await subscribe(options.bus, repo);
  app.addHook('onClose', async () => repo.close());

  async function progressFor(userId: string, instrument: InstrumentId): Promise<Progress> {
    return computeProgress(userId, await catalog.units(), await repo.getCompletions(userId), instrument);
  }

  // GET /api/progress?instrument=guitar (default piano)
  app.get('/', async (req): Promise<Progress> => {
    const { instrument } = InstrumentQuerySchema.parse(req.query);
    return ProgressSchema.parse(await progressFor(requireUserId(req), instrument));
  });

  // GET /api/progress/review-queue?instrument=guitar
  app.get('/review-queue', async (req): Promise<SkillScore[]> => {
    const userId = requireUserId(req);
    const { instrument } = InstrumentQuerySchema.parse(req.query);
    const skills = (await repo.getSkills(userId)).filter((s) => s.instrument === instrument);
    return ReviewQueueSchema.parse(reviewQueue(skills, now()));
  });

  // GET /api/progress/reports/weekly?to=<iso>&tzOffset=330&instrument=guitar
  // Accuracy, patterns and suggestions use that instrument's attempts only; the streak counts any practice.
  app.get('/reports/weekly', async (req): Promise<ProgressReport> => {
    const userId = requireUserId(req);
    const query = ReportQuerySchema.parse(req.query);
    const to = query.to ? new Date(query.to) : now();
    const [attempts, practiceDays, skills, progress] = await Promise.all([
      repo.getAttempts(userId, new Date(to.getTime() - 14 * DAY), to),
      repo.getPracticeDays(userId, query.tzOffset),
      repo.getSkills(userId),
      progressFor(userId, query.instrument).catch(() => undefined),
    ]);
    const report = buildWeeklyReport({
      userId,
      to,
      attempts: attempts.filter((a) => instrumentOf(a) === query.instrument),
      practiceDays,
      utcOffsetMinutes: query.tzOffset,
      progress,
      dueReviews: reviewQueue(skills.filter((s) => s.instrument === query.instrument), to).length,
    });
    return ProgressReportSchema.parse(report);
  });

  return app;
}
