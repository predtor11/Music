/**
 * Rules for keeping settings in step between this browser and the account.
 * Pure functions, so they are unit tested without React or a server.
 */

import { UserSettingsSchema, type UpdateSettings, type UserSettings } from '@music/contracts';

/** Settings that belong to this computer, not the account: MIDI input ids differ per machine. */
const LOCAL_ONLY = ['midiInputId'] as const satisfies ReadonlyArray<keyof UserSettings>;

/** The part of a change that goes to the account. Null when nothing is left to send. */
export function serverPatch(patch: Partial<UserSettings>): UpdateSettings | null {
  const out: Record<string, unknown> = { ...patch };
  for (const k of LOCAL_ONLY) delete out[k];
  return Object.keys(out).length > 0 ? (out as UpdateSettings) : null;
}

/** Account settings, keeping this computer's local-only ones. */
export function fromServer(local: UserSettings, server: UserSettings): UserSettings {
  const merged: Record<string, unknown> = { ...server };
  for (const k of LOCAL_ONLY) merged[k] = local[k];
  return UserSettingsSchema.parse(merged);
}

/**
 * What to do when the account's settings arrive after sign-in.
 * If you changed settings here while signed out, those are the newest and go
 * up to the account; otherwise the account's settings win.
 */
export function onSignIn(local: UserSettings, server: UserSettings, changedWhileSignedOut: boolean): { settings: UserSettings; push: UpdateSettings | null } {
  if (changedWhileSignedOut) {
    const push = serverPatch(local);
    return { settings: local, push: push && differs(push, server) ? push : null };
  }
  return { settings: fromServer(local, server), push: null };
}

function differs(patch: UpdateSettings, server: UserSettings): boolean {
  return (Object.keys(patch) as Array<keyof UpdateSettings>).some((k) => patch[k] !== server[k]);
}
