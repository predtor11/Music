/**
 * One hand and finger session: explain steps with a Watch demo, and drills you
 * play on your keyboard with the animated hand guiding each finger.
 */

import type { TechniqueSession, UserSettings } from '@music/contracts';
import { pretty } from '@music/theory';
import { Button, Card, fadeUp } from '@music/ui';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';
import { getTechniqueSession, getTechniqueSessions } from '../api/client.js';
import { HandDrill, HandExplain } from '../hands/HandSteps.js';
import { markDone } from '../hands/fingering.js';
import { useNoteInput } from '../input/NoteInput.js';
import type { KeyboardSize } from '../keyboard/layout.js';
import { href } from '../router.js';
import { LoadError, Loading } from './states.js';
import s from '../lesson/lesson.module.css';

export function HandSessionPage({ id, settings }: { id: string; settings: UserSettings }) {
  const [session, setSession] = useState<TechniqueSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setSession(null);
    setError(null);
    getTechniqueSession(id)
      .then((x) => live && setSession(x))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [id]);
  if (error) return <LoadError what="this hand session" message={error} />;
  if (!session) return <Loading />;
  return <Player key={session.id} session={session} settings={settings} />;
}

function Player({ session, settings }: { session: TechniqueSession; settings: UserSettings }) {
  const input = useNoteInput();
  const [stepIndex, setStepIndex] = useState(0);
  const [done, setDone] = useState<Set<number>>(new Set());
  const [finished, setFinished] = useState(false);
  const step = session.steps[stepIndex]!;
  const size = settings.keyboardSize as KeyboardSize;
  const stepDone = step.type === 'explain' || done.has(stepIndex);
  const last = stepIndex === session.steps.length - 1;

  const go = (to: number) => {
    setStepIndex(to);
    input.clear();
  };
  const onDrillDone = useCallback(() => setDone((d) => new Set(d).add(stepIndex)), [stepIndex]);
  const finish = () => {
    markDone(session.id);
    setFinished(true);
  };

  if (finished) {
    return (
      <Card highlight padding="lg" className={s.summary} data-testid="hands-summary">
        <div className={s.summaryInner}>
          <span className="ui-eyebrow">{session.title}</span>
          <div className={`ui-display ui-gradient-text ${s.score}`}>Done</div>
          <p className="ui-muted">Come back to these drills any time; a few minutes a day is what trains the fingers.</p>
          <div className={s.summaryActions}>
            <Button variant="secondary" onClick={() => (location.hash = href.hands)}>
              All hand sessions
            </Button>
            <NextSession order={session.order} />
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className={s.player}>
      <div className={s.playerHead}>
        <a href={href.hands} className={s.back} data-testid="back">
          ← Hands
        </a>
        <div className={s.titleBlock}>
          <h1 className="ui-title" data-testid="hand-title">
            {session.title}
          </h1>
          <span className="ui-muted">{session.summary}</span>
        </div>
      </div>

      <ol className={s.progress} aria-label="Session steps">
        {session.steps.map((st, i) => (
          <li key={i} data-state={i < stepIndex ? 'done' : i === stepIndex ? 'current' : 'todo'} title={st.title}>
            <motion.span className={s.progressFill} initial={false} animate={{ scaleX: i < stepIndex ? 1 : i === stepIndex ? (stepDone ? 1 : 0.15) : 0 }} />
          </li>
        ))}
      </ol>

      <AnimatePresence mode="wait">
        <motion.div key={stepIndex} variants={fadeUp} initial="hidden" animate="show" exit="exit">
          <Card padding="lg" className={s.stepCard}>
            <div className={s.stepMeta}>
              <span className="ui-eyebrow" data-testid="step-kind">
                {step.type === 'explain' ? 'Learn' : 'Practise'}
              </span>
              <span className="ui-eyebrow">
                Step {stepIndex + 1} of {session.steps.length}
              </span>
            </div>
            <h2 className={`ui-heading ${s.stepTitle}`} data-testid="step-title">
              {pretty(step.title)}
            </h2>
            {step.type === 'explain' ? (
              <HandExplain step={step} size={size} settings={settings} />
            ) : (
              <HandDrill step={step} size={size} settings={settings} onDone={onDrillDone} />
            )}
          </Card>
        </motion.div>
      </AnimatePresence>

      <div className={s.nav}>
        <Button variant="ghost" onClick={() => go(stepIndex - 1)} disabled={stepIndex === 0} data-testid="prev">
          Back
        </Button>
        {last ? (
          <Button variant="primary" onClick={finish} disabled={!stepDone} data-testid="finish">
            Finish session
          </Button>
        ) : (
          <Button variant="primary" onClick={() => go(stepIndex + 1)} disabled={!stepDone} data-testid="next">
            {stepDone ? 'Next' : 'Play the runs to continue'}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Button to the session after this one, if there is one. */
function NextSession({ order }: { order: number }) {
  const [nextId, setNextId] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    getTechniqueSessions()
      .then((list) => live && setNextId(list.find((x) => x.order === order + 1)?.id ?? null))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [order]);
  if (!nextId) return null;
  return (
    <Button variant="primary" onClick={() => (location.hash = href.hand(nextId))} data-testid="next-session">
      Next session
    </Button>
  );
}
