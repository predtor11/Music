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

export type ThemeChoice = 'system' | 'light' | 'dark';
const THEME_KEY = 'music.theme';

/** Light, dark, or follow the system. Applied as data-theme on <html>. */
export function useTheme() {
  const [theme, setTheme] = useState<ThemeChoice>(() => {
    try {
      const t = localStorage.getItem(THEME_KEY);
      return t === 'light' || t === 'dark' ? t : 'system';
    } catch {
      return 'system';
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Ignore.
    }
  }, [theme]);

  return [theme, setTheme] as const;
}
