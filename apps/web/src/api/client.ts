/**
 * Calls to the services, always through the gateway at /api. Responses are
 * checked against the contracts so a mismatch fails loudly here, not deep in
 * a screen.
 */

import {
  BandTalkSchema,
  GlossarySchema,
  ProgressReportSchema,
  TechniqueListSchema,
  TechniqueSessionSchema,
  UnitListSchema,
  UserSchema,
  type BandTalkTerm,
  type GlossaryTerm,
  type ProgressReport,
  type TechniqueSession,
  type TechniqueSummary,
  type Unit,
  type UpdateSettings,
  type User,
} from '@music/contracts';
import { call } from './http.js';
import { instrumentId, instrumentPath, type InstrumentId } from '../instruments/model.js';

export { ApiError, call, setTokenSource, type TokenSource } from './http.js';
// Lessons and units are remembered for the page's lifetime so practice can run from them offline.
export { getLesson, getUnit } from './curriculum.js';
// Practice works without a connection: see ../offline/practice.ts.
export { endSession, nextItem, recordAttempt, startSession } from '../offline/practice.js';

export type UnitSummary = Omit<Unit, 'checkpoint'>;

export async function getUnits(instrument: InstrumentId = 'piano'): Promise<UnitSummary[]> {
  const raw = await call(instrumentPath('/curriculum/units', instrument));
  const units = UnitListSchema.parse(raw);
  // Check the wire value until the foundation schema also retains instrument.
  return units.filter((_, i) => instrumentId((raw as Array<{ instrument?: unknown }>)[i]?.instrument) === instrument);
}

/** The signed-in user's profile and settings, created on the first call. */
export async function getMe(): Promise<User> {
  return UserSchema.parse(await call('/identity/me'));
}

export async function updateMySettings(patch: UpdateSettings): Promise<User> {
  return UserSchema.parse(await call('/identity/me/settings', { method: 'PATCH', body: JSON.stringify(patch) }));
}

/**
 * The weekly progress report for the 7 days up to now. `tzOffset` is minutes
 * ahead of UTC, so days split at the learner's own midnight.
 */
export async function getReport(tzOffset = -new Date().getTimezoneOffset(), instrument: InstrumentId = 'piano'): Promise<ProgressReport> {
  return ProgressReportSchema.parse(await call(instrumentPath(`/progress/reports/weekly?tzOffset=${tzOffset}`, instrument)));
}

/** The hand and finger sessions, in order, without their steps. */
export async function getTechniqueSessions(): Promise<TechniqueSummary[]> {
  return TechniqueListSchema.parse(await call('/curriculum/technique'));
}

export async function getTechniqueSession(id: string): Promise<TechniqueSession> {
  return TechniqueSessionSchema.parse(await call(`/curriculum/technique/${encodeURIComponent(id)}`));
}

/** The band-talk cheat sheet: what musicians say, with examples. */
export async function getBandTalk(): Promise<BandTalkTerm[]> {
  return BandTalkSchema.parse(await call('/curriculum/bandtalk'));
}

/** Every glossary term the course teaches, in teaching order. */
export async function getGlossary(instrument: InstrumentId = 'piano'): Promise<GlossaryTerm[]> {
  return GlossarySchema.parse(await call(instrumentPath('/curriculum/glossary', instrument)));
}
