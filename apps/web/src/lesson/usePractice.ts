/**
 * A practice session for a lesson or checkpoint. Sessions and attempts go
 * through the offline outbox (see ../offline): they are kept on this device,
 * sent to the practice service in the background, and sent again later if it
 * can't be reached. The score is worked out here the same way the service does
 * whenever the server's own isn't available.
 */

import type { MistakeKind, SessionSummary, TestItem } from '@music/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, endSession, recordAttempt, startSession } from '../api/client.js';
import { skillFor } from '@music/skills';
import { saveStateOf } from '../offline/practice.js';
import { useSyncSnapshot } from '../offline/useSyncStatus.js';
import { expectedFor } from './grade.js';
import { useInstrument } from '../instruments/context.js';

export interface AttemptInput {
  item: TestItem;
  played: number[];
  correct: boolean;
  retried: boolean;
  mistake: MistakeKind | null;
  timeMs: number;
}

/**
 * saving: all is well (nothing to show).
 * offline: kept on this device until the practice server can be reached.
 * signed-out: kept on this device until you sign in (the server needs it, a 401).
 */
export type SaveState = 'starting' | 'saving' | 'offline' | 'signed-out';

/** Why saving stopped, from the error a practice call threw. */
export function saveFailure(error: unknown): SaveState {
  return error instanceof ApiError && error.status === 401 ? 'signed-out' : 'offline';
}

const LESSON_PASS_PERCENT = 80;

export function usePractice(kind: 'lesson' | 'checkpoint' | 'review' | 'free', refId?: string, passPercent = LESSON_PASS_PERCENT) {
  const { id: instrument } = useInstrument();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [startFailure, setStartFailure] = useState<SaveState | null>(null);
  const snapshot = useSyncSnapshot();
  const firstTry = useRef(new Map<string, boolean>());
  const items = useRef(new Set<string>());
  const pending = useRef<Promise<unknown>>(Promise.resolve());
  const ending = useRef<Promise<SessionSummary> | null>(null);
  // One session per mount, even when React runs effects twice in development.
  const starting = useRef<{ key: string; session: ReturnType<typeof startSession> } | null>(null);

  useEffect(() => {
    let live = true;
    const key = `${instrument}:${kind}:${refId ?? ''}`;
    if (starting.current?.key !== key) {
      firstTry.current.clear();
      items.current.clear();
      ending.current = null;
      setSessionId(null);
      setStartFailure(null);
      starting.current = { key, session: startSession({ kind, refId, instrument }) };
    }
    starting.current.session
      .then((session) => {
        if (!live) return;
        setSessionId(session.id);
      })
      .catch((err: unknown) => live && setStartFailure(saveFailure(err)));
    return () => {
      live = false;
    };
  }, [kind, refId, instrument]);

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
            ...{ instrument },
            sessionId,
            itemId: a.item.id,
            itemKind: a.item.kind,
            skill: skillFor(a.item, instrument),
            expected: expectedFor(a.item, a.played),
            played: a.played,
            correct: a.correct,
            retried: a.retried,
            mistake: a.mistake,
            timeMs: Math.max(0, Math.round(a.timeMs)),
            playedAt: new Date().toISOString(),
          }),
        )
        .catch((err: unknown) => console.warn('practice: could not keep an attempt', err));
    },
    [sessionId, instrument],
  );

  const finish = useCallback((): Promise<SessionSummary> => {
    // A second press while the first is still saving waits for the same result.
    ending.current ??= (async () => {
      await pending.current;
      if (sessionId) {
        try {
          return (await endSession(sessionId)).summary;
        } catch {
          // No server score and no lesson to score from: fall back to counting what was registered.
        }
      }
      const total = items.current.size;
      const firstTryCorrect = [...firstTry.current.values()].filter(Boolean).length;
      const accuracy = total === 0 ? null : (firstTryCorrect / total) * 100;
      return { total, answered: firstTry.current.size, firstTryCorrect, accuracy, passed: accuracy === null ? null : accuracy >= passPercent };
    })();
    return ending.current;
  }, [sessionId, passPercent]);

  const save: SaveState = sessionId ? saveStateOf(sessionId, snapshot) : (startFailure ?? 'starting');
  return { sessionId, save, register, record, finish };
}
