/**
 * Practice calls that keep working without a connection.
 *
 * Every session and attempt gets its id here (crypto.randomUUID), goes into
 * the outbox, and is sent in the background. The server treats a repeated id
 * as a no-op, so retries and late replays are safe. While the server can't be
 * reached, next-item and the end-of-session score come from the lesson or unit
 * kept in memory, using the same rules as the practice service.
 *
 * Review sessions are the exception: the server picks their questions, so
 * starting one needs a connection.
 */

import {
  AttemptSchema,
  EndSessionResponseSchema,
  NextItemSchema,
  SessionSchema,
  type Attempt,
  type CreateSession,
  type EndSessionResponse,
  type Session,
  type TestItem,
} from '@music/contracts';
import { lessonForPractice, unitForPractice } from '../api/curriculum.js';
import { ApiError, call } from '../api/http.js';
import { browserOnline, getIdentity, getRunner, whenIdentityKnown } from './runtime.js';
import { lessonPlan, nextItem as pickNextItem, summarize } from './scoring.js';
import type { SyncSnapshot } from './sync.js';
import { instrumentId, instrumentPath, type InstrumentId } from '../instruments/model.js';

interface Plan {
  items: TestItem[];
  passPercent: number | null;
}

interface LocalSession {
  instrument: InstrumentId;
  id: string;
  kind: CreateSession['kind'];
  refId: string | null;
  startedAt: string;
  attempts: Attempt[];
  plan?: Plan;
}

/** Sessions started in this visit, with every attempt, so they can be served and scored locally. */
const sessions = new Map<string, LocalSession>();

const NIL_UUID = '00000000-0000-4000-8000-000000000000';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toSession(s: LocalSession, endedAt: string | null): Session {
  const userId = getIdentity().userId;
  return { id: s.id, userId: userId && UUID.test(userId) ? userId : NIL_UUID, kind: s.kind, refId: s.refId, startedAt: s.startedAt, endedAt, ...{ instrument: s.instrument } };
}

/** The items and pass mark of a session, from the lesson or unit (cached in memory or by the service worker). */
async function planFor(s: LocalSession): Promise<Plan> {
  if (s.plan) return s.plan;
  let plan: Plan = { items: [], passPercent: null };
  if (s.kind === 'lesson' && s.refId) plan = lessonPlan(await lessonForPractice(s.refId, s.instrument));
  else if (s.kind === 'checkpoint' && s.refId) {
    const unit = await unitForPractice(s.refId, s.instrument);
    plan = { items: unit.checkpoint.items, passPercent: unit.checkpoint.passPercent };
  }
  s.plan = plan;
  return plan;
}

function flushSoon(): void {
  getRunner()
    .flush()
    .catch(() => undefined);
}

export async function startSession(body: CreateSession & { instrument?: InstrumentId }): Promise<Session> {
  const request = { ...body, instrument: instrumentId(body.instrument), id: body.id ?? crypto.randomUUID() };
  await whenIdentityKnown();
  const local: LocalSession = { id: request.id, instrument: request.instrument, kind: request.kind, refId: request.refId ?? null, startedAt: new Date().toISOString(), attempts: [] };

  if (request.kind === 'review') {
    // The server chooses what to ask, so there is nothing to start without it.
    if (!getIdentity().canSync) throw new ApiError('sign in required', 401);
    return SessionSchema.parse(await call('/practice/sessions', { method: 'POST', body: JSON.stringify(request) }));
  }

  sessions.set(local.id, local);
  await getRunner().enqueue('createSession', local.id, request);
  flushSoon();
  return toSession(local, null);
}

export async function recordAttempt(attempt: Attempt & { instrument?: InstrumentId }): Promise<void> {
  const parsed = AttemptSchema.parse(attempt);
  const withId = { ...parsed, instrument: instrumentId(attempt.instrument ?? sessions.get(parsed.sessionId)?.instrument), id: parsed.id ?? crypto.randomUUID() };
  sessions.get(withId.sessionId)?.attempts.push(withId);
  await getRunner().enqueue('attempt', withId.sessionId, withId);
  flushSoon();
}

/**
 * Ends a session. With the server reachable (and everything before it sent)
 * this is the server's own score; otherwise it is worked out here and the end
 * is sent when the connection is back. Throws only when a score can't be
 * worked out locally either (the lesson isn't in memory).
 */
export async function endSession(id: string): Promise<EndSessionResponse> {
  const runner = getRunner();
  const op = await runner.enqueue('endSession', id, {});
  await runner.flush().catch(() => undefined);
  const result = runner.takeResult(op.id);
  if (result?.ok) return EndSessionResponseSchema.parse(result.response);

  const local = sessions.get(id);
  if (!local) throw new ApiError("Can't reach the app server.", 0);
  let plan: Plan;
  try {
    plan = await planFor(local);
  } catch {
    throw new ApiError("Can't reach the app server.", 0);
  }
  return { session: toSession(local, new Date().toISOString()), summary: summarize(plan.items, local.attempts, plan.passPercent) };
}

/** The next unanswered item of a session, or null when it is done. */
export async function nextItem(sessionId: string): Promise<TestItem | null> {
  const local = sessions.get(sessionId);
  const fromServer = () => call(instrumentPath(`/practice/sessions/${sessionId}/next-item`, local?.instrument ?? 'piano')).then((body) => NextItemSchema.parse(body));
  if (!local) return fromServer();
  // The server only knows what has reached it; while anything is waiting, this device knows more.
  if (getRunner().pendingFor(sessionId) === 0) {
    try {
      return await fromServer();
    } catch (error) {
      if (!(error instanceof ApiError) || (error.status !== 0 && error.status !== 401)) throw error;
    }
  }
  return pickNextItem((await planFor(local)).items, local.attempts);
}

/**
 * How saving is going for a session, in the words the lesson screens use:
 * 'saving' while all is well, 'offline' when things are kept on this device
 * until the server can be reached, 'signed-out' when they wait for a sign-in.
 */
export function saveStateOf(sessionId: string, snapshot: SyncSnapshot): 'saving' | 'offline' | 'signed-out' {
  if (getRunner().pendingFor(sessionId) === 0) return 'saving';
  if (!getIdentity().canSync || snapshot.stopped === 'auth' || snapshot.stopped === 'identity') return 'signed-out';
  if (!browserOnline() || snapshot.stopped === 'network' || snapshot.retrying) return 'offline';
  return 'saving';
}
