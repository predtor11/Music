/**
 * Settings, saved in localStorage until the identity service is wired in.
 * The shape is the contract's UserSettings, so moving them to the server later
 * is a PATCH /api/identity/me/settings with the same object.
 */

import { UserSettingsSchema, type UserSettings } from '@music/contracts';
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'music.settings.v1';

export function loadSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = UserSettingsSchema.safeParse(raw ? JSON.parse(raw) : {});
    if (parsed.success) return parsed.data;
  } catch {
    // Private mode or bad JSON: fall back to defaults.
  }
  return UserSettingsSchema.parse({});
}

export function useSettings() {
  const [settings, setSettings] = useState<UserSettings>(loadSettings);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Storage full or blocked; settings still apply for this visit.
    }
  }, [settings]);

  const update = useCallback((patch: Partial<UserSettings>) => setSettings((s) => ({ ...s, ...patch })), []);
  return [settings, update] as const;
}
