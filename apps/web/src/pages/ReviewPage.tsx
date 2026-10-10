/**
 * Review: the practice service builds about ten questions for the skills that
 * are due (spaced repetition in the progress service), weakest first. Quiz
 * style, so nothing is lit up to help, and not graded pass or fail.
 */

import type { SessionSummary, SkillScore, TestItem, UserSettings } from '@music/contracts';
import { skillFor, skillLabel } from '@music/skills';
import { C_MAJOR } from '@music/theory';
import { Badge, Button, Card, fadeUp, pop, stagger, Swap } from '@music/ui';
import { motion } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';
import { nextItem } from '../api/client.js';
import { getReviewQueue } from '../api/progress.js';
import type { KeyboardSize } from '../keyboard/layout.js';
import { ItemRunner } from '../lesson/ItemRunner.js';
import { Summary } from '../lesson/Summary.js';
import { usePractice } from '../lesson/usePractice.js';
import { href } from '../router.js';
import { Loading } from './states.js';
import s from '../lesson/lesson.module.css';
import r from './ReviewPage.module.css';
import { useInstrument } from '../instruments/context.js';

export function ReviewPage({ settings }: { settings: UserSettings }) {
  const [run, setRun] = useState(0);
  return <ReviewRun key={run} settings={settings} onAgain={() => setRun((n) => n + 1)} />;
}

function ReviewRun({ settings, onAgain }: { settings: UserSettings; onAgain: () => void }) {
  const { id: instrument } = useInstrument();
  const practice = usePractice('review');
  const { sessionId, save, finish, record } = practice;
  const [queue, setQueue] = useState<SkillScore[]>([]);
  const [item, setItem] = useState<TestItem | null>(null);
  const [answered, setAnswered] = useState(0);
  const [empty, setEmpty] = useState(false);
  const [failed, setFailed] = useState(false);
  const [summary, setSummary] = useState<SessionSummary | null>(null);

  useEffect(() => {
    getReviewQueue(instrument).then(
      (q) => setQueue([...q].sort((a, b) => a.firstTryAccuracy - b.firstTryAccuracy)),
      () => setQueue([]),
    );
  }, [instrument]);

  const advance = useCallback(async () => {
    if (!sessionId) return;
    let next: TestItem | null;
    try {
      next = await nextItem(sessionId);
    } catch {
      setFailed(true);
      return;
    }
    if (next) setItem(next);
    else if (!item) setEmpty(true);
    else setSummary(await finish());
  }, [sessionId, item, finish]);

  useEffect(() => {
    if (sessionId && !item && !summary && !empty) void advance();
    // Only on start; later items come from onDone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  if (save === 'signed-out') {
    return (
      <Card padding="lg" className={s.errorCard} data-testid="review-signin">
        <h2 className="ui-heading">Sign in to review</h2>
        <p className="ui-muted">Review picks questions from what you've practised, so it needs your account.</p>
        <div>
          <Button variant="primary" onClick={() => (location.hash = href.signin)}>
            Sign in
          </Button>
        </div>
      </Card>
    );
  }

  if (save === 'offline' || failed) {
    return (
      <Card padding="lg" className={s.errorCard} data-testid="review-offline">
        <h2 className="ui-heading">Review needs the practice server</h2>
        <p className="ui-muted">
          Review picks questions from what you've practised, so it only works while the app server is running. Start everything with <code>npm run dev:all</code>, then try again.
        </p>
        <div>
          <Button variant="secondary" onClick={onAgain}>
            Try again
          </Button>
        </div>
      </Card>
    );
  }
  if (summary) return <Summary summary={summary} title="Review" onRetry={onAgain} backHref={href.lessons} save={save} />;
  if (empty) return <NothingDue />;
  if (!item) return <Loading />;

  return (
    <div className={s.player}>
      <div className={s.playerHead}>
        <a href={href.lessons} className={s.back}>
          ← Lessons
        </a>
        <div className={s.titleBlock}>
          <h1 className="ui-title">Review</h1>
          <span className="ui-muted">Questions on the skills that need it most. Take your time: nothing is lit up to help.</span>
        </div>
      </div>
      {queue.length > 0 && (
        <motion.div className={r.chips} variants={stagger(0.04)} initial="hidden" animate="show" data-testid="review-skills">
          {queue.slice(0, 8).map((q) => (
            <motion.span key={q.skill} variants={pop}>
              <Badge tone={q.skill === skillFor(item) ? 'accent' : 'neutral'}>
                {skillLabel(q.skill)} · {Math.round(q.firstTryAccuracy * 100)}%
              </Badge>
            </motion.span>
          ))}
        </motion.div>
      )}
      <Card padding="lg" className={s.stepCard}>
        <div className={r.itemHead}>
          <span className={`ui-muted ${s.small}`} data-testid="review-count">
            Question {answered + 1}
          </span>
          <Swap value={item.id}>
            <Badge tone="accent" data-testid="review-skill">
              {skillLabel(skillFor(item))}
            </Badge>
          </Swap>
        </div>
        <ItemRunner
          item={item}
          mode="quiz"
          size={settings.keyboardSize as KeyboardSize}
          naming={settings.noteNaming}
          keyOf={C_MAJOR}
          onAttempt={record}
          onDone={() => {
            setAnswered((a) => a + 1);
            void advance();
          }}
        />
      </Card>
    </div>
  );
}

function NothingDue() {
  return (
    <motion.div variants={stagger(0.08)} initial="hidden" animate="show">
      <Card padding="lg" className={r.empty} data-testid="review-empty">
        <motion.span variants={fadeUp} className="ui-eyebrow">
          Review
        </motion.span>
        <motion.h1 variants={fadeUp} className="ui-title">
          Nothing to review right now
        </motion.h1>
        <motion.p variants={fadeUp} className="ui-muted">
          Each skill comes back for review when you're about to forget it: soon after a mistake, then a day later, then a few days, then longer each time you get it right. Keep going with the lessons and the hard ones will show up here.
        </motion.p>
        <motion.div variants={fadeUp}>
          <Button variant="primary" onClick={() => (location.hash = href.lessons)}>
            Back to lessons
          </Button>
        </motion.div>
      </Card>
    </motion.div>
  );
}
