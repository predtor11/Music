/**
 * Calls to the services, always through the gateway at /api. Responses are
 * checked against the contracts so a mismatch fails loudly here, not deep in
 * a screen.
 */

import {
  AttemptSchema,
  EndSessionResponseSchema,
  LessonSchema,
  NextItemSchema,
  ProgressReportSchema,
  UnitSchema,
  SessionSchema,
  UnitListSchema,
  type Attempt,
  type CreateSession,
  type EndSessionResponse,
  type Lesson,
  type ProgressReport,
  type Session,
  type TestItem,
  type Unit,
  type UpdateSettings,
  type User,
  UserSchema,
} from '@music/contracts';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Gives the current Supabase access token, or null when signed out. */
export type TokenSource = () => Promise<string | null>;

let tokenSource: TokenSource = async () => null;

/** Called once by the auth provider; every later call carries the token as a Bearer header. */
export function setTokenSource(source: TokenSource): void {
  tokenSource = source;
}

export async function call(path: string, init?: RequestInit): Promise<unknown> {
  let res: Response;
  try {
    const token = await tokenSource().catch(() => null);
    res = await fetch(`/api${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError("Can't reach the app server.", 0);
  }
  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const message = (body as { message?: string } | null)?.message ?? `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }
  return body;
}

export async function getLesson(id: string): Promise<Lesson> {
  return LessonSchema.parse(await call(`/curriculum/lessons/${encodeURIComponent(id)}`));
}

export type UnitSummary = Omit<Unit, 'checkpoint'>;

export async function getUnits(): Promise<UnitSummary[]> {
  return UnitListSchema.parse(await call('/curriculum/units'));
}

export async function startSession(body: CreateSession): Promise<Session> {
  return SessionSchema.parse(await call('/practice/sessions', { method: 'POST', body: JSON.stringify(body) }));
}

export async function recordAttempt(attempt: Attempt): Promise<void> {
  await call('/practice/attempts', { method: 'POST', body: JSON.stringify(AttemptSchema.parse(attempt)) });
}

export async function endSession(id: string): Promise<EndSessionResponse> {
  return EndSessionResponseSchema.parse(await call(`/practice/sessions/${id}/end`, { method: 'POST', body: '{}' }));
}

export async function getUnit(id: string): Promise<Unit> {
  return UnitSchema.parse(await call(`/curriculum/units/${encodeURIComponent(id)}`));
}

/** The next unanswered item of a session, or null when it is done. */
export async function nextItem(sessionId: string): Promise<TestItem | null> {
  return NextItemSchema.parse(await call(`/practice/sessions/${sessionId}/next-item`));
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
export async function getReport(tzOffset = -new Date().getTimezoneOffset()): Promise<ProgressReport> {
  return ProgressReportSchema.parse(await call(`/progress/reports/weekly?tzOffset=${tzOffset}`));
}
