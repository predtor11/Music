/**
 * One round of a play-by-ear level: ten fresh questions, then a score.
 * Chord and progression answers are saved like lesson answers, so they show
 * in Progress and come back in Review; tunes and keys are scored here only.
 */

import type { UserSettings } from '@music/contracts';
import { parseKey, C_MAJOR } from '@music/theory';
import { Badge, Button, Card, Feedback, fadeUp, stagger } from '@music/ui';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { EarRunner } from '../ear/EarRunner.js';
import { earLevel, makeRound, seeded, type EarLevel, type Rng } from '../ear/questions.js';
import { recordRound } from '../ear/stats.js';
import type { KeyboardSize } from '../keyboard/layout.js';
import { ItemRunner } from '../lesson/ItemRunner.js';
import { SaveBadge, SaveSummaryNote } from '../lesson/SaveNotice.js';
import { usePractice, type AttemptInput } from '../lesson/usePractice.js';
import { href } from '../router.js';
import s from '../lesson/lesson.module.css';
import e from '../ear/ear.module.css';

/** Tests set window.__earSeed so a round's questions are the same every run. */
function randomSource(): Rng {
  const seed = typeof window === 'undefined' ? undefined : (window as unknown as { __earSeed?: number }).__earSeed;
  return seed === undefined ? Math.random : seeded(seed);
}

export function EarSessionPage({ id, settings }: { id: string; settings: UserSettings }) {
  const level = earLevel(id);
  const [run, setRun] = useState(0);
  if (!level) {
    return (
      <Card padding="lg" className={s.errorCard} data-testid="load-error">
        <h2 className="ui-heading">No such ear level</h2>
        <div>
          <Button variant="secondary" onClick={() => (location.hash = href.ear)}>
            All levels
          </Button>
        </div>
      </Card>
    );
  }
  return <Round key={`${level.id}-${run}`} level={level} settings={settings} onAgain={() => setRun((n) => n + 1)} />;
}

type Result = 'good' | 'missed';

function Round({ level, settings, onAgain }: { level: EarLevel; settings: UserSettings; onAgain: () => void }) {
  const questions = useMemo(() => makeRound(level, randomSource()), [level]);
  const practice = usePractice('free', `ear:${level.id}`);
  const { record, finish, save } = practice;
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const resultsRef = useRef<Result[]>([]);
  const [score, setScore] = useState<number | null>(null);
  const progressionMissed = useRef(false);
  const q = questions[index]!;
  const size = settings.keyboardSize as KeyboardSize;

  const settle = useCallback(
    (firstTry: boolean) => {
      if (resultsRef.current.length > index) return;
      resultsRef.current = [...resultsRef.current, firstTry ? 'good' : 'missed'];
      setResults(resultsRef.current);
    },
    [index],
  );

  const next = useCallback(() => {
    if (index + 1 < questions.length) {
      progressionMissed.current = false;
      setIndex(index + 1);
      return;
    }
    const good = resultsRef.current.filter((x) => x === 'good').length;
    const pct = Math.round((good / questions.length) * 100);
    recordRound(level.id, pct);
    setScore(pct);
    void finish();
  }, [index, questions.length, level.id, finish]);

  const onAttempt = useCallback((a: AttemptInput) => level.saved && record(a), [level.saved, record]);
  const onProgressionAttempt = useCallback(
    (a: AttemptInput) => {
      if (!a.correct) progressionMissed.current = true;
      onAttempt(a);
    },
    [onAttempt],
  );
  const onProgressionDone = useCallback(() => {
    settle(!progressionMissed.current);
    next();
  }, [settle, next]);

  if (score !== null) {
    const good = results.filter((x) => x === 'good').length;
    return (
      <Feedback signal={score >= 80 ? { kind: 'good', id: 'ear-summary' } : null} holdMs={2400}>
        <Card highlight padding="lg" className={s.summary} data-testid="ear-summary">
          <motion.div className={s.summaryInner} variants={stagger(0.08)} initial="hidden" animate="show">
            <motion.span variants={fadeUp} className="ui-eyebrow">
              {level.title}
            </motion.span>
            <motion.div variants={fadeUp} className={`ui-display ui-gradient-text ${s.score}`} data-testid="score">
              {score}%
            </motion.div>
            <motion.p variants={fadeUp} className="ui-muted">
              {good} of {questions.length} found on the first try.{' '}
              {score >= 80 ? 'Your ear has this one. Try the next level.' : 'Another round will make it easier: every round is new questions.'}
            </motion.p>
            {level.saved && (save === 'offline' || save === 'signed-out') && (
              <motion.div variants={fadeUp}>
                <SaveSummaryNote save={save} className={`ui-muted ${s.small}`} />
              </motion.div>
            )}
            <motion.div variants={fadeUp} className={s.summaryActions}>
              <Button variant="secondary" onClick={onAgain} data-testid="ear-again">
                Another round
              </Button>
              <Button variant="primary" onClick={() => (location.hash = href.ear)} data-testid="ear-levels">
                All levels
              </Button>
            </motion.div>
          </motion.div>
        </Card>
      </Feedback>
    );
  }

  return (
    <div className={s.player}>
      <div className={s.playerHead}>
        <a href={href.ear} className={s.back} data-testid="back">
          ← By Ear
        </a>
        <div className={s.titleBlock}>
          <h1 className="ui-title" data-testid="ear-title">
            {level.title}
          </h1>
          <span className="ui-muted">{level.summary}</span>
        </div>
      </div>

      <div className={e.roundHead}>
        <ol className={e.dots} aria-label="Questions" data-testid="ear-dots">
          {questions.map((x, i) => (
            <li key={x.id} data-state={results[i] ?? (i === index ? 'current' : 'todo')} />
          ))}
        </ol>
        <span className={s.small}>
          <span className="ui-muted" data-testid="ear-count">
            Question {index + 1} of {questions.length}
          </span>{' '}
          {level.saved ? <SaveBadge save={save} /> : <Badge tone="neutral">Scored on this device</Badge>}
        </span>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={q.id} variants={fadeUp} initial="hidden" animate="show" exit="exit">
          <Card padding="lg" className={s.stepCard}>
            {q.type === 'progression' ? (
              <ItemRunner
                item={q.item}
                mode="quiz"
                size={size}
                naming={settings.noteNaming}
                keyOf={parseKey(q.item.key) ?? C_MAJOR}
                onAttempt={onProgressionAttempt}
                onDone={onProgressionDone}
              />
            ) : (
              <EarRunner question={q} size={size} naming={settings.noteNaming} onAttempt={onAttempt} onSettled={settle} onNext={next} />
            )}
          </Card>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
