import type { Lesson, Unit } from '@music/contracts';
import { createService } from '@music/service-kit';
import { loadCurriculum } from './content.js';
import type { GlossaryTerm } from './glossary.js';

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404 });
}

/**
 * The curriculum service: units, lessons, test items and the glossary, read from the JSON
 * files in content/. The content is checked when the app is built, so a bad
 * file stops start-up instead of reaching a learner. Read-only; stores nothing.
 */
export function buildApp(options: { logger?: boolean; contentDir?: string } = {}) {
  const app = createService({ name: 'curriculum', logger: options.logger });
  const curriculum = loadCurriculum(options.contentDir);

  // GET /units: every unit in order, without its checkpoint.
  app.get('/units', async (): Promise<Array<Omit<Unit, 'checkpoint'>>> => curriculum.units.map(({ checkpoint: _, ...unit }) => unit));

  // GET /units/:id: one unit with its checkpoint test.
  app.get<{ Params: { id: string } }>('/units/:id', async (req): Promise<Unit> => {
    const unit = curriculum.unitsById.get(req.params.id);
    if (!unit) throw notFound(`Unknown unit: ${req.params.id}`);
    return unit;
  });

  // GET /lessons/:id
  app.get<{ Params: { id: string } }>('/lessons/:id', async (req): Promise<Lesson> => {
    const lesson = curriculum.lessonsById.get(req.params.id);
    if (!lesson) throw notFound(`Unknown lesson: ${req.params.id}`);
    return lesson;
  });

  // GET /glossary: every term, in teaching order. The app shows the ones whose lesson you have reached.
  app.get('/glossary', async (): Promise<GlossaryTerm[]> => curriculum.glossary);

  return app;
}
