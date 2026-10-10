/**
 * Lesson player: each step is text plus the virtual keyboard. Explain and
 * show steps light the keys they talk about; play-along and quiz steps ask you
 * to play on your keyboard and mark the keys right or wrong.
 */

import type { Lesson, LessonStep, SessionSummary, UserSettings } from '@music/contracts';
import { C_MAJOR, pretty } from '@music/theory';
import { Button, Card, Swap, fadeUp } from '@music/ui';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getLesson } from '../api/client.js';
import { playChord, playSequence } from '../audio/sound.js';
import { describe } from '../chord/describe.js';
import { LiveDisplay } from '../chord/LiveDisplay.js';
import { useNoteInput } from '../input/NoteInput.js';
import type { KeyMark } from '../keyboard/PianoKeyboard.js';
import { LiveKeyboard } from '../keyboard/LiveKeyboard.js';
import { noteLabeller } from '../keyboard/labels.js';
import type { KeyboardSize } from '../keyboard/layout.js';
import { ItemRunner } from '../lesson/ItemRunner.js';
import { Prose } from '../lesson/Prose.js';
import { Summary } from '../lesson/Summary.js';
import { SaveBadge } from '../lesson/SaveNotice.js';
import { usePractice } from '../lesson/usePractice.js';
import { href } from '../router.js';
import { LoadError, Loading } from './states.js';
import s from '../lesson/lesson.module.css';
import { useInstrument } from '../instruments/context.js';

export function LessonPage({ id, settings }: { id: string; settings: UserSettings }) {
  const { id: instrument } = useInstrument();
  const [loaded, setLoaded] = useState<Lesson | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setLoaded(null);
    setError(null);
    getLesson(id, instrument)
      .then((l) => live && setLoaded(l))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [id, instrument]);

  if (error) return <LoadError what="this lesson" message={error} />;
  if (!loaded) return <Loading />;
  return <LessonPlayer key={attempt} lesson={loaded} settings={settings} onRetry={() => setAttempt((a) => a + 1)} />;
}

const STEP_KIND: Record<LessonStep['type'], string> = {
  explain: 'Learn',
  show: 'Look',
  'play-along': 'Play along',
  explore: 'Explore',
  quiz: 'Quiz',
};

function LessonPlayer({ lesson, settings, onRetry }: { lesson: Lesson; settings: UserSettings; onRetry: () => void }) {
  const practice = usePractice('lesson', lesson.id);
  const input = useNoteInput();
  const [stepIndex, setStepIndex] = useState(0);
  const [itemIndex, setItemIndex] = useState(0);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [finishing, setFinishing] = useState(false);

  const step = lesson.steps[stepIndex]!;
  const items = step.type === 'play-along' || step.type === 'quiz' ? step.items : [];
  const stepDone = itemIndex >= items.length;
  const last = stepIndex === lesson.steps.length - 1;
  const size = settings.keyboardSize as KeyboardSize;

  const { register } = practice;
  useEffect(() => {
    register(lesson.steps.flatMap((st) => (st.type === 'play-along' || st.type === 'quiz' ? st.items.map((i) => i.id) : [])));
  }, [lesson, register]);

  const go = useCallback(
    (to: number) => {
      setStepIndex(to);
      setItemIndex(0);
      input.clear();
    },
    [input],
  );

  const finish = async () => {
    setFinishing(true);
    setSummary(await practice.finish());
    setFinishing(false);
  };

  const onItemDone = useCallback(() => setItemIndex((i) => i + 1), []);

  if (summary) {
    return <Summary summary={summary} title={lesson.title} onRetry={onRetry} backHref={href.lessons} save={practice.save} />;
  }

  return (
    <div className={s.player}>
      <div className={s.playerHead}>
        <a href={href.lessons} className={s.back} data-testid="back">
          ← Lessons
        </a>
        <div className={s.titleBlock}>
          <h1 className="ui-title" data-testid="lesson-title">
            {lesson.title}
          </h1>
          <span className="ui-muted">{lesson.summary}</span>
        </div>
        <SaveBadge save={practice.save} />
      </div>

      <ol className={s.progress} aria-label="Lesson steps">
        {lesson.steps.map((st, i) => (
          <li key={i} data-state={i < stepIndex ? 'done' : i === stepIndex ? 'current' : 'todo'} title={st.title}>
            <motion.span className={s.progressFill} initial={false} animate={{ scaleX: i < stepIndex ? 1 : i === stepIndex ? (items.length ? Math.max(0.15, itemIndex / items.length) : 1) : 0 }} />
          </li>
        ))}
      </ol>

      <AnimatePresence mode="wait">
        <motion.div key={stepIndex} variants={fadeUp} initial="hidden" animate="show" exit="exit">
          <Card padding="lg" className={s.stepCard}>
            <div className={s.stepMeta}>
              <span className="ui-eyebrow" data-testid="step-kind">
                {STEP_KIND[step.type]}
              </span>
              <span className="ui-eyebrow">
                Step {stepIndex + 1} of {lesson.steps.length}
              </span>
            </div>
            <h2 className={`ui-heading ${s.stepTitle}`} data-testid="step-title">
              {pretty(step.title)}
            </h2>

            {(step.type === 'explain' || step.type === 'show') && <TeachStep step={step} size={size} settings={settings} />}
            {step.type === 'explore' && <ExploreStep body={step.body} size={size} settings={settings} />}
            {items.length > 0 &&
              (stepDone ? (
                <StepComplete count={items.length} />
              ) : (
                <>
                  <span className={`ui-muted ${s.small}`}>
                    Question {itemIndex + 1} of {items.length}
                  </span>
                  <ItemRunner
                    item={items[itemIndex]!}
                    mode={step.type === 'quiz' ? 'quiz' : 'play-along'}
                    size={size}
                    naming={settings.noteNaming}
                    keyOf={C_MAJOR}
                    onAttempt={practice.record}
                    onDone={onItemDone}
                  />
                </>
              ))}
          </Card>
        </motion.div>
      </AnimatePresence>

      <div className={s.nav}>
        <Button variant="ghost" onClick={() => go(stepIndex - 1)} disabled={stepIndex === 0} data-testid="prev">
          Back
        </Button>
        {last ? (
          <Button variant="primary" onClick={finish} disabled={!stepDone} loading={finishing} data-testid="finish">
            Finish lesson
          </Button>
        ) : (
          <Button variant="primary" onClick={() => go(stepIndex + 1)} disabled={!stepDone} data-testid="next">
            {stepDone ? 'Next' : 'Answer to continue'}
          </Button>
        )}
      </div>
    </div>
  );
}

function captionsFrom(labels: Record<string, string> | undefined): Map<number, string> | undefined {
  if (!labels) return undefined;
  return new Map(Object.entries(labels).map(([k, v]) => [Number(k), pretty(v)]));
}

/** Explain and show steps: the text, with the keys it talks about lit up. */
function TeachStep({
  step,
  size,
  settings,
}: {
  step: Extract<LessonStep, { type: 'explain' | 'show' }>;
  size: KeyboardSize;
  settings: UserSettings;
}) {
  const { id: instrument } = useInstrument();
  const keys = step.type === 'show' ? step.highlightMidi : (step.exampleMidi ?? []);
  const marks = useMemo(() => new Map<number, KeyMark>(keys.map((k) => [k, 'target'])), [keys]);
  const captions = useMemo(() => captionsFrom(step.labels), [step.labels]);
  const labelFor = useMemo(() => noteLabeller(C_MAJOR, settings.noteNaming), [settings.noteNaming]);
  return (
    <>
      <Prose text={step.body} />
      {keys.length > 0 && (
        <div className={s.hearRow}>
          <Button variant="secondary" size="sm" onClick={() => void (step.type === 'show' ? playChord(keys) : playSequence(keys))} data-testid="hear">
            ▶ Hear it
          </Button>
          <span className={`ui-muted ${s.small}`}>{instrument === 'piano' ? 'Try playing the lit keys on your keyboard.' : 'Try playing the lit notes on your guitar.'}</span>
        </div>
      )}
      <LiveKeyboard size={size} marks={marks} captions={captions} labelFor={labelFor} names={captions ? 'none' : 'held'} focusNote={keys[0] ?? 60} />
    </>
  );
}

/** Free play: whatever you play is named. */
function ExploreStep({ body, size, settings }: { body: string; size: KeyboardSize; settings: UserSettings }) {
  const input = useNoteInput();
  const description = useMemo(() => describe(input.held, C_MAJOR), [input.held]);
  const labelFor = useMemo(() => noteLabeller(C_MAJOR, settings.noteNaming), [settings.noteNaming]);
  return (
    <>
      <Prose text={body} />
      <div className={s.exploreDisplay}>
        <LiveDisplay description={description} naming={settings.noteNaming} keyOf={C_MAJOR} compact />
      </div>
      <LiveKeyboard size={size} labelFor={labelFor} />
    </>
  );
}

function StepComplete({ count }: { count: number }) {
  return (
    <div className={s.stepComplete} data-testid="step-complete">
      <Swap value="done">
        <span className="ui-gradient-text">Nice work.</span>
      </Swap>
      <span className="ui-muted">
        You've answered all {count} question{count === 1 ? '' : 's'} in this step.
      </span>
    </div>
  );
}
