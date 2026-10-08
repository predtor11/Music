import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { UpdateSettingsSchema, UserSettingsSchema, type User } from '@music/contracts';
import { createService, InMemoryEventBus, requireUserId, type EventBus } from '@music/service-kit';
import { InMemoryProfileStore, type ProfileStore } from './store.js';

/** Name a new profile starts with until the user changes it. */
export const DEFAULT_DISPLAY_NAME = 'Pianist';

/** Supabase Auth user ids are UUIDs. */
const UserIdSchema = z.string().uuid();

export interface AppOptions {
  logger?: boolean;
  store?: ProfileStore;
  bus?: EventBus;
  /** Clock for createdAt and event times; tests pass a fixed one. */
  now?: () => Date;
}

/**
 * The identity service: the signed-in user's profile and settings.
 * Login is Supabase Auth, checked by the gateway; this service trusts only
 * the x-user-id header the gateway sets.
 *
 *   GET   /me           the profile, created with default settings on the first call
 *   PATCH /me/settings  change some settings (UpdateSettingsSchema), returns the profile
 */
export function buildApp(options: AppOptions = {}) {
  const app = createService({ name: 'identity', logger: options.logger });
  const store = options.store ?? new InMemoryProfileStore();
  const bus = options.bus ?? new InMemoryEventBus();
  const now = options.now ?? (() => new Date());

  async function getOrCreate(userId: string): Promise<User> {
    const existing = await store.get(userId);
    if (existing) return existing;
    const occurredAt = now().toISOString();
    const { user, created } = await store.create({
      id: userId,
      displayName: DEFAULT_DISPLAY_NAME,
      createdAt: occurredAt,
      settings: UserSettingsSchema.parse({}),
    });
    if (created) {
      await bus.publish({
        id: randomUUID(),
        type: 'user.created',
        occurredAt,
        source: 'identity',
        data: { userId: user.id, displayName: user.displayName },
      });
    }
    return user;
  }

  app.get('/me', async (req) => getOrCreate(UserIdSchema.parse(requireUserId(req))));

  app.patch('/me/settings', async (req) => {
    const userId = UserIdSchema.parse(requireUserId(req));
    const patch = UpdateSettingsSchema.parse(req.body ?? {});
    await getOrCreate(userId);
    const updated = await store.updateSettings(userId, patch);
    if (!updated) throw new Error(`profile ${userId} missing after create`);
    return updated;
  });

  app.addHook('onClose', async () => {
    await store.close();
  });

  return app;
}
