/**
 * Settings: note names, keyboard size, theme and so on (the contract's
 * UserSettings). Always kept in localStorage, so they load instantly and work
 * signed out. When signed in they also live on the account through the
 * identity service, so they follow you to another browser.
 */

import { UserSettingsSchema, type UserSettings } from '@music/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getMe, updateMySettings } from '../api/client.js';
import { onSignIn, serverPatch } from './sync.js';
import { instrumentId, parseInstrumentSettings, type InstrumentSettings, type InstrumentPatch } from '../instruments/model.js';

const STORAGE_KEY = 'music.settings.v1';
/** Set when settings change while signed out, so they win on the next sign-in. */
const DIRTY_KEY = 'music.settings.unsynced';
/** Where ThemeProvider kept the theme before it moved into settings. */
const OLD_THEME_KEY = 'music.theme';
const SAVE_DELAY_MS = 400;

/**
 * local: signed out, saved in this browser only.
 * loading: fetching the account's settings. saving / saved: talking to the account.
 * error: the account couldn't be reached; changes are kept here and sent next time.
 */
export type SyncState = 'local' | 'loading' | 'saving' | 'saved' | 'error';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Private mode or storage full: settings still apply for this visit.
  }
}

export function loadSettings(): InstrumentSettings {
  try {
    const raw = read(STORAGE_KEY);
    const stored = (raw ? JSON.parse(raw) : {}) as Record<string, unknown>;
    if (stored.theme === undefined) {
      const theme = read(OLD_THEME_KEY);
      if (theme) stored.theme = theme;
    }
    const parsed = UserSettingsSchema.safeParse(stored);
    if (parsed.success) return { ...parsed.data, instrument: instrumentId(stored.instrument) };
  } catch {
    // Bad JSON: fall back to defaults.
  }
  return parseInstrumentSettings({});
}

/** userId: the signed-in user, or null when signed out. */
export function useSettings(userId: string | null) {
  const [settings, setSettings] = useState<InstrumentSettings>(loadSettings);
  const [sync, setSync] = useState<SyncState>('local');
  const ready = useRef(false); // the account's settings have arrived for this user
  const pending = useRef<InstrumentPatch>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userRef = useRef(userId);
  userRef.current = userId;

  useEffect(() => write(STORAGE_KEY, JSON.stringify(settings)), [settings]);

  const flush = useCallback(async () => {
    timer.current = null;
    const patch = serverPatch(pending.current);
    pending.current = {};
    if (!patch || !userRef.current) return;
    const forUser = userRef.current;
    setSync('saving');
    try {
      await updateMySettings(patch);
      if (userRef.current !== forUser) return;
      write(DIRTY_KEY, null);
      setSync('saved');
    } catch {
      if (userRef.current !== forUser) return;
      // Keep the change for next time.
      pending.current = { ...patch, ...pending.current };
      write(DIRTY_KEY, '1');
      setSync('error');
    }
  }, []);

  // Fetch the account's settings whenever someone signs in.
  useEffect(() => {
    ready.current = false;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    pending.current = {};
    if (!userId) {
      setSync('local');
      return;
    }
    let live = true;
    setSync('loading');
    getMe()
      .then(async (me) => {
        if (!live) return;
        const plan = onSignIn(loadSettings(), me.settings, read(DIRTY_KEY) === '1');
        setSettings(parseInstrumentSettings({ ...plan.settings,
          instrument: 'instrument' in plan.settings ? plan.settings.instrument : loadSettings().instrument,
        }));
        ready.current = true;
        if (plan.push) {
          pending.current = plan.push;
          await flush();
        } else {
          write(DIRTY_KEY, null);
          setSync('saved');
        }
      })
      .catch(() => {
        if (!live) return;
        ready.current = true;
        write(DIRTY_KEY, '1');
        setSync('error');
      });
    return () => {
      live = false;
    };
  }, [userId, flush]);

  const update = useCallback(
    (patch: InstrumentPatch) => {
      setSettings((s) => ({ ...s, ...patch }));
      if (!serverPatch(patch)) return;
      if (!userRef.current || !ready.current) {
        write(DIRTY_KEY, '1');
        return;
      }
      pending.current = { ...pending.current, ...patch };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
    },
    [flush],
  );

  return [settings, update, sync] as const;
}
