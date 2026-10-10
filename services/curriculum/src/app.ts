import { InstrumentIdSchema, instrumentOf, type BandTalkTerm, type Lesson, type TechniqueSession, type TechniqueSummary, type Unit } from '@music/contracts';
import { z } from 'zod';
import { createService } from '@music/service-kit';
import { loadBandTalk } from './bandtalk.js';
import { loadCurriculum } from './content.js';
import type { GlossaryTerm } from './glossary.js';
import { loadTechnique } from './technique.js';

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404 });
}

/**
 * The curriculum service: units, lessons, test items, the glossary and the
 * hand and finger (technique) sessions and the band-talk cheat sheet, read from the JSON
 * files in content/. The content is checked when the app is built, so a bad
 * file stops start-up instead of reaching a learner. Read-only; stores nothing.
 */
export function buildApp(options: { logger?: boolean; contentDir?: string } = {}) {
  const app = createService({ name: 'curriculum', logger: options.logger });
  const curriculum = loadCurriculum(options.contentDir);
  const technique = loadTechnique(options.contentDir);
  const bandTalk = loadBandTalk(new Set(curriculum.glossary.map((t) => t.id)), options.contentDir);

  // GET /units?instrument=guitar: that instrument's units in order, without their checkpoints.
  // Without the query, every unit of every instrument (piano first by order).
  app.get('/units', async (req): Promise<Array<Omit<Unit, 'checkpoint'>>> => {
    const { instrument } = z.object({ instrument: InstrumentIdSchema.optional() }).parse(req.query);
    return curriculum.units.filter((u) => !instrument || instrumentOf(u) === instrument).map(({ checkpoint: _, ...unit }) => unit);
  });

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

  // GET /bandtalk: what musicians say at rehearsal, each with a playable example.
  app.get('/bandtalk', async (): Promise<BandTalkTerm[]> => bandTalk);

  // GET /technique: the hand and finger sessions in order, without their steps.
  app.get('/technique', async (): Promise<TechniqueSummary[]> => technique.sessions.map(({ steps: _, ...session }) => session));

  // GET /technique/glossary: the terms the technique sessions teach (lessonId names the session).
  app.get('/technique/glossary', async (): Promise<GlossaryTerm[]> => technique.glossary);

  // GET /technique/:id
  app.get<{ Params: { id: string } }>('/technique/:id', async (req): Promise<TechniqueSession> => {
    const session = technique.sessionsById.get(req.params.id);
    if (!session) throw notFound(`Unknown technique session: ${req.params.id}`);
    return session;
  });

  return app;
}
