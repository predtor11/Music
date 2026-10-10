import { UserSettingsSchema, type InstrumentId, type UserSettings } from '@music/contracts';

export type { InstrumentId } from '@music/contracts';
export type InstrumentSettings = UserSettings & { instrument: InstrumentId };
export type InstrumentPatch = Partial<UserSettings>;

export function instrumentId(value: unknown): InstrumentId { return value === 'guitar' ? 'guitar' : 'piano'; }

export function parseInstrumentSettings(value: unknown): InstrumentSettings {
  const settings = UserSettingsSchema.parse(value);
  const raw = value as { instrument?: unknown } | null;
  return { ...settings, instrument: instrumentId(raw?.instrument) };
}

export const CHOICE_KEY = 'music.instrument.chosen.v1';

/** Existing settings migrate to piano; new users make an explicit first choice. */
export function needsInstrumentChoice(storage: Pick<Storage, 'getItem'> = localStorage): boolean {
  try {
    if (storage.getItem(CHOICE_KEY)) return false;
    const raw = storage.getItem('music.settings.v1');
    if (!raw) return true;
    const old = JSON.parse(raw) as Record<string, unknown>;
    return 'instrument' in old || !UserSettingsSchema.safeParse(old).success;
  } catch { return true; }
}

export function rememberInstrumentChoice(storage: Pick<Storage, 'setItem'> = localStorage): void {
  try { storage.setItem(CHOICE_KEY, '1'); } catch { /* Still applies for this visit. */ }
}

/** Piano remains the service default, keeping old course links compatible. */
export function instrumentPath(path: string, instrument: InstrumentId): string {
  if (instrument === 'piano') return path;
  return `${path}${path.includes('?') ? '&' : '?'}instrument=${instrument}`;
}
