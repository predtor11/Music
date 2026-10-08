/**
 * A practice session for a lesson or checkpoint. Attempts are posted to the
 * practice service; if it can't be reached the lesson still works, it just
 * isn't saved, and the score is worked out here the same way the service does.
 */

import type { MistakeKind, SessionSummary, TestItem } from '@music/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, endSession, recordAttempt, startSession } from '../api/client.js';
import { expectedFor, skillFor } from './grade.js';

export interface AttemptInput {
  item: TestItem;
  played: number[];
  correct: boolean;
  retried: boolean;
  mistake: MistakeKind | null;
  timeMs: number;
}

/**
 * offline: the practice server can't be reached.
 * signed-out: the server is there but needs you signed in to save (a 401).
 */
export type SaveState = 'starting' | 'saving' | 'offline' | 'signed-out';

/** Why saving stopped, from the error a practice call threw. */
export function saveFailure(error: unknown): SaveState {
  return error instanceof ApiError && error.status === 401 ? 'signed-out' : 'offline';
}

const LESSON_PASS_PERCENT = 80;

export function usePractice(kind: 'lesson' | 'checkpoint', refId: string, passPercent = LESSON_PASS_PERCENT) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>('starting');
  const firstTry = useRef(new Map<string, boolean>());
  const items = useRef(new Set<string>());
  const pending = useRef<Promise<unknown>>(Promise.resolve());
  // One session per mount, even when React runs effects twice in development.
  const starting = useRef<{ key: string; session: ReturnType<typeof startSession> } | null>(null);

  useEffect(() => {
    let live = true;
    const key = `${kind}:${refId}`;
    if (starting.current?.key !== key) {
      firstTry.current.clear();
      items.current.clear();
      setSessionId(null);
      setSave('starting');
      starting.current = { key, session: startSession({ kind, refId }) };
    }
    starting.current.session
      .then((session) => {
        if (!live) return;
        setSessionId(session.id);
        setSave('saving');
      })
      .catch((err: unknown) => live && setSave(saveFailure(err)));
    return () => {
      live = false;
    };
  }, [kind, refId]);

  /** Every item the learner will see, so unanswered ones count as wrong offline too. */
  const register = useCallback((ids: string[]) => ids.forEach((id) => items.current.add(id)), []);

  const record = useCallback(
    (a: AttemptInput) => {
      items.current.add(a.item.id);
      if (!firstTry.current.has(a.item.id)) firstTry.current.set(a.item.id, a.correct && !a.retried);
      if (!sessionId) return;
      pending.current = pending.current
        .then(() =>
          recordAttempt({
            sessionId,
            itemId: a.item.id,
            itemKind: a.item.kind,
            skill: skillFor(a.item),
            expected: expectedFor(a.item, a.played),
            played: a.played,
            correct: a.correct,
            retried: a.retried,
            mistake: a.mistake,
            timeMs: Math.max(0, Math.round(a.timeMs)),
            playedAt: new Date().toISOString(),
          }),
        )
        .catch((err: unknown) => setSave(saveFailure(err)));
    },
    [sessionId],
  );

  const finish = useCallback(async (): Promise<SessionSummary> => {
    await pending.current;
    if (sessionId) {
      try {
        return (await endSession(sessionId)).summary;
      } catch (err) {
        setSave(saveFailure(err));
      }
    }
    const total = items.current.size;
    const firstTryCorrect = [...firstTry.current.values()].filter(Boolean).length;
    const accuracy = total === 0 ? null : (firstTryCorrect / total) * 100;
    return { total, answered: firstTry.current.size, firstTryCorrect, accuracy, passed: accuracy === null ? null : accuracy >= passPercent };
  }, [sessionId, passPercent]);

  return { sessionId, save, register, record, finish };
}
