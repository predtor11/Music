import { UserSettingsSchema, type User, type UpdateSettings } from '@music/contracts';

/** Where profiles live: Postgres (schema `identity`) in production, memory in tests and local runs. */
export interface ProfileStore {
  get(userId: string): Promise<User | null>;
  /**
   * Inserts the profile unless one already exists for this id. Returns the
   * stored profile and whether this call created it, so only one caller
   * publishes `user.created` even when two first calls race.
   */
  create(user: User): Promise<{ user: User; created: boolean }>;
  /** Merges the patch into the stored settings. Returns null when there is no profile. */
  updateSettings(userId: string, patch: UpdateSettings): Promise<User | null>;
  close(): Promise<void>;
}

/** Stored settings may predate newer fields; parsing fills in their defaults. */
export function readSettings(stored: unknown): User['settings'] {
  return UserSettingsSchema.parse(stored ?? {});
}

export class InMemoryProfileStore implements ProfileStore {
  private readonly profiles = new Map<string, User>();

  async get(userId: string): Promise<User | null> {
    return this.profiles.get(userId) ?? null;
  }

  async create(user: User): Promise<{ user: User; created: boolean }> {
    const existing = this.profiles.get(user.id);
    if (existing) return { user: existing, created: false };
    this.profiles.set(user.id, user);
    return { user, created: true };
  }

  async updateSettings(userId: string, patch: UpdateSettings): Promise<User | null> {
    const existing = this.profiles.get(userId);
    if (!existing) return null;
    const updated = { ...existing, settings: readSettings({ ...existing.settings, ...patch }) };
    this.profiles.set(userId, updated);
    return updated;
  }

  async close(): Promise<void> {}
}
