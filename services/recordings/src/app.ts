import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { CreateRecordingSchema, UpdateRecordingSchema, type Recording } from '@music/contracts';
import { createService, requireUserId } from '@music/service-kit';
import { InMemoryRecordingStore, type RecordingStore } from './store.js';

/** Supabase Auth user ids and recording ids are UUIDs. */
const IdSchema = z.string().uuid();

/** A long take is a few megabytes of JSON; Fastify's default limit is 1 MB. */
const BODY_LIMIT = 8 * 1024 * 1024;
/** Most recordings one person keeps. */
export const MAX_RECORDINGS = 1000;

export interface AppOptions {
  logger?: boolean;
  store?: RecordingStore;
  /** Clock for createdAt and updatedAt; tests pass a fixed one. */
  now?: () => Date;
}

const notFound = () => Object.assign(new Error('recording not found'), { statusCode: 404 });

/**
 * The recordings service: takes you played or imported, with the key and
 * chord fixes you made. The analysis itself runs in the browser.
 *
 *   GET    /takes       your recordings, newest first (no notes)
 *   POST   /takes       save one, returns it with its id
 *   GET    /takes/:id   one recording with its notes
 *   PATCH  /takes/:id   change title, key or corrections
 *   DELETE /takes/:id   delete it
 */
export function buildApp(options: AppOptions = {}) {
  const app = createService({ name: 'recordings', logger: options.logger });
  const store = options.store ?? new InMemoryRecordingStore();
  const now = options.now ?? (() => new Date());
  const user = (req: Parameters<typeof requireUserId>[0]) => IdSchema.parse(requireUserId(req));
  const id = (params: unknown) => {
    const parsed = IdSchema.safeParse((params as { id?: string }).id);
    if (!parsed.success) throw notFound();
    return parsed.data;
  };

  app.get('/takes', async (req) => store.list(user(req)));

  app.post('/takes', { bodyLimit: BODY_LIMIT }, async (req, reply) => {
    const userId = user(req);
    const body = CreateRecordingSchema.parse(req.body ?? {});
    if ((await store.count(userId)) >= MAX_RECORDINGS) {
      throw Object.assign(new Error(`You can keep up to ${MAX_RECORDINGS} recordings. Delete some to save more.`), { statusCode: 409 });
    }
    const at = now().toISOString();
    const recording: Recording = {
      id: randomUUID(),
      title: body.title,
      source: body.source,
      durationMs: body.take.durationMs,
      noteCount: body.take.notes.length,
      keyOverride: body.keyOverride,
      createdAt: at,
      updatedAt: at,
      take: body.take,
      corrections: body.corrections,
    };
    reply.status(201);
    return store.create(userId, recording);
  });

  app.get('/takes/:id', async (req) => {
    const found = await store.get(user(req), id(req.params));
    if (!found) throw notFound();
    return found;
  });

  app.patch('/takes/:id', async (req) => {
    const userId = user(req);
    const patch = UpdateRecordingSchema.parse(req.body ?? {});
    const updated = await store.update(userId, id(req.params), patch, now().toISOString());
    if (!updated) throw notFound();
    return updated;
  });

  app.delete('/takes/:id', async (req, reply) => {
    if (!(await store.delete(user(req), id(req.params)))) throw notFound();
    reply.status(204);
    return null;
  });

  app.addHook('onClose', async () => {
    await store.close();
  });

  return app;
}
