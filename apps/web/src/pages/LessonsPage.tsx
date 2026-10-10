/**
 * Units and their lessons, in order. Each lesson shows whether it is locked,
 * open, started or done (from the progress service), and only open ones can
 * be started: finishing a lesson opens the next, and passing a unit test
 * opens the next unit.
 */

import type { Lesson, Progress } from '@music/contracts';
import { Badge, Button, Card, fadeUp, pop, spring, stagger } from '@music/ui';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { getLesson, getUnits, type UnitSummary } from '../api/client.js';
import { getProgress, getReviewQueue } from '../api/progress.js';
import { saveFailure } from '../lesson/usePractice.js';
import { href } from '../router.js';
import { LoadError, Loading } from './states.js';
import { standing, type LessonStatus, type Standing } from './unlocks.js';
import s from '../lesson/lesson.module.css';
import l from './LessonsPage.module.css';
import { useInstrument } from '../instruments/context.js';

interface UnitView {
  unit: UnitSummary;
  lessons: Lesson[];
}

interface Loaded {
  units: UnitView[];
  /** Null when progress can't be loaded (signed out, or the service is down): everything stays open. */
  progress: Progress | null;
  /** Why progress didn't load, when it didn't. */
  progressFailure: 'signed-out' | 'offline' | null;
  dueSkills: number;
}

export function LessonsPage() {
  const { id: instrument } = useInstrument();
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const units = getUnits(instrument).then(async (list) => {
      const sorted = [...list].sort((a, b) => a.order - b.order);
      return Promise.all(
        sorted.map(async (unit) => ({
          unit,
          lessons: (await Promise.all(unit.lessonIds.map((id) => getLesson(id, instrument)))).sort((a, b) => a.order - b.order),
        })),
      );
    });
    const progress = getProgress(instrument).then(
      (progress) => ({ progress, progressFailure: null }),
      (e: unknown) => ({ progress: null, progressFailure: saveFailure(e) === 'signed-out' ? ('signed-out' as const) : ('offline' as const) }),
    );
    const due = getReviewQueue(instrument).then((q) => q.length, () => 0);
    Promise.all([units, progress, due])
      .then(([units, progress, dueSkills]) => live && setData({ units, ...progress, dueSkills }))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [instrument]);

  if (error) return <LoadError what="the lessons" message={error} />;
  if (!data) return <Loading />;

  const st = standing(data.progress);
  const allLessons = data.units.flatMap((u) => u.lessons);
  const next = allLessons.find((x) => x.id === st.next);

  return (
    <motion.div className={s.units} variants={stagger(0.08)} initial="hidden" animate="show">
      <motion.div variants={fadeUp} className={s.unitsIntro}>
        <h1 className="ui-title">Lessons</h1>
        <p className="ui-muted">Short lessons with your {instrument === 'piano' ? 'keyboard' : 'guitar'}. Each one explains, shows the notes, then has you play them. Finish one to open the next.</p>
      </motion.div>

      {data.progressFailure === 'signed-out' && (
        <motion.div variants={fadeUp} className={l.signinNote}>
          <Badge tone="warn" data-testid="progress-signed-out">
            Sign in to save your progress. Until then every lesson is open.
          </Badge>
          <Button variant="primary" onClick={() => (location.hash = href.signin)}>
            Sign in
          </Button>
        </motion.div>
      )}
      {data.progressFailure === 'offline' && (
        <motion.div variants={fadeUp}>
          <Badge tone="warn" data-testid="progress-offline">
            Can't reach the progress server, so every lesson is open and nothing is being saved.
          </Badge>
        </motion.div>
      )}

      {(next || data.dueSkills > 0) && (
        <motion.div variants={fadeUp} className={l.upNext}>
          {next && (
            <Card highlight padding="md" className={l.upNextCard} data-testid="continue">
              <span className="ui-eyebrow">{st.lesson(next.id) === 'in-progress' ? 'Pick up where you left off' : 'Up next'}</span>
              <span className={s.lessonTitle}>{next.title}</span>
              <span className={`ui-muted ${s.small}`}>{next.summary}</span>
              <div>
                <Button variant="primary" onClick={() => (location.hash = href.lesson(next.id))}>
                  {st.lesson(next.id) === 'in-progress' ? 'Continue' : 'Start'}
                </Button>
              </div>
            </Card>
          )}
          {data.dueSkills > 0 && (
            <Card padding="md" className={l.upNextCard} data-testid="review-due">
              <span className="ui-eyebrow">Review</span>
              <span className={s.lessonTitle}>
                {data.dueSkills} {data.dueSkills === 1 ? 'skill is' : 'skills are'} due for practice
              </span>
              <span className={`ui-muted ${s.small}`}>A short mix of questions on what you found hardest, so it sticks.</span>
              <div>
                <Button variant="secondary" onClick={() => (location.hash = href.review)}>
                  Review now
                </Button>
              </div>
            </Card>
          )}
        </motion.div>
      )}

      {data.units.map(({ unit, lessons }) => (
        <UnitSection key={unit.id} unit={unit} lessons={lessons} st={st} units={data.units} />
      ))}
    </motion.div>
  );
}

function UnitSection({ unit, lessons, st, units }: { unit: UnitSummary; lessons: Lesson[]; st: Standing; units: UnitView[] }) {
  const u = st.unit(unit.id);
  // Use the displayed curriculum chain: stale or mixed progress must never
  // invent Unit 0 or point guitar learners at a piano prerequisite.
  const previous = units.filter((v) => (v.unit.instrument ?? 'piano') === (unit.instrument ?? 'piano') && v.unit.order < unit.order).at(-1)?.unit;
  const pct = u.total ? (u.done / u.total) * 100 : 0;
  return (
    <motion.section variants={fadeUp} className={s.unit} data-testid={`unit-${unit.id}`} data-unlocked={u.unlocked}>
      <div className={s.unitHead}>
        <div>
          <span className="ui-eyebrow">Unit {unit.order}</span>
          <h2 className="ui-heading">{unit.title}</h2>
          <p className={`ui-muted ${s.small}`}>{unit.outcome}</p>
        </div>
        <div className={l.unitSide}>
          {u.checkpointPassed ? (
            <motion.span variants={pop}>
              <Badge tone="good" data-testid={`unit-passed-${unit.id}`}>
                Unit test passed
              </Badge>
            </motion.span>
          ) : !u.unlocked && previous ? (
            <Badge tone="neutral" data-testid={`unit-locked-${unit.id}`}>
              <LockIcon /> Pass the Unit {previous.order} test to open
            </Badge>
          ) : null}
          <Button
            variant={u.unlocked && u.total > 0 && u.done === u.total && !u.checkpointPassed ? 'primary' : 'secondary'}
            size="sm"
            disabled={!u.unlocked}
            onClick={() => (location.hash = href.checkpoint(unit.id))}
            data-testid={`checkpoint-${unit.id}`}
          >
            Unit test
          </Button>
        </div>
      </div>

      {u.total > 0 && (
        <div className={l.meter} role="progressbar" aria-label={`Unit ${unit.order} lessons done`} aria-valuemin={0} aria-valuemax={u.total} aria-valuenow={u.done}>
          <div className={l.track}>
            <motion.div className={l.fill} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={spring.gentle} />
          </div>
          <span className={`ui-muted ${s.small}`} data-testid={`unit-count-${unit.id}`}>
            {u.done} of {u.total} done
          </span>
        </div>
      )}

      <motion.div className={s.lessonGrid} variants={stagger(0.03)}>
        {lessons.map((lesson) => (
          <LessonCard key={lesson.id} lesson={lesson} status={st.lesson(lesson.id)} />
        ))}
      </motion.div>
    </motion.section>
  );
}

const STATUS_TEXT: Record<LessonStatus, string> = {
  locked: 'Locked',
  available: 'Open',
  'in-progress': 'Started',
  done: 'Done',
};

function LessonCard({ lesson, status }: { lesson: Lesson; status: LessonStatus }) {
  const locked = status === 'locked';
  const card = (
    <Card interactive={!locked} padding="md" className={`${s.lessonCard} ${l.card}`} data-status={status}>
      <span className={`${s.lessonNum} ${l.num}`} data-status={status}>
        {status === 'done' ? <CheckIcon /> : locked ? <LockIcon /> : lesson.order}
      </span>
      <span className={s.lessonText}>
        <span className={s.lessonTitle}>{lesson.title}</span>
        <span className={`ui-muted ${s.small}`}>{lesson.summary}</span>
      </span>
      {status === 'in-progress' ? (
        <Badge tone="warn">Started</Badge>
      ) : status === 'done' ? (
        <Badge tone="good">Done</Badge>
      ) : (
        <Badge tone="neutral">{lesson.minutes} min</Badge>
      )}
    </Card>
  );
  const common = { variants: fadeUp, className: s.lessonLink, 'data-testid': `lesson-${lesson.id}`, 'data-status': status };
  if (locked) {
    return (
      <motion.div {...common} aria-disabled="true" title="Finish the lesson before this one to open it" aria-label={`${lesson.title}, ${STATUS_TEXT[status]}`}>
        {card}
      </motion.div>
    );
  }
  return (
    <motion.a {...common} href={href.lesson(lesson.id)} aria-label={`${lesson.title}, ${STATUS_TEXT[status]}`}>
      {card}
    </motion.a>
  );
}

function LockIcon() {
  return (
    <svg className={l.icon} viewBox="0 0 16 16" aria-hidden="true">
      <rect x="3" y="7" width="10" height="7" rx="2" fill="currentColor" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className={l.icon} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
