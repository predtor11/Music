/**
 * Hands: the hand position and finger training sessions. They sit beside the
 * lessons, open from the start, and can be taken in any order, though they
 * build on each other.
 */

import { Badge, Card, fadeUp, stagger } from '@music/ui';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import type { TechniqueSummary } from '@music/contracts';
import { getTechniqueSessions } from '../api/client.js';
import { doneSessions } from '../hands/fingering.js';
import { href } from '../router.js';
import { LoadError, Loading } from './states.js';
import s from '../lesson/lesson.module.css';
import l from './LessonsPage.module.css';

export function HandsPage() {
  const [sessions, setSessions] = useState<TechniqueSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done] = useState(doneSessions);

  useEffect(() => {
    let live = true;
    getTechniqueSessions()
      .then((list) => live && setSessions(list))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, []);

  if (error) return <LoadError what="the hand sessions" message={error} />;
  if (!sessions) return <Loading />;
  const next = sessions.find((x) => !done.has(x.id));

  return (
    <motion.div variants={stagger(0.06)} initial="hidden" animate="show" className={s.unit}>
      <motion.div variants={fadeUp} className={s.unitHead}>
        <div>
          <span className="ui-eyebrow">Hands and fingers</span>
          <h1 className="ui-title">Train your hands</h1>
          <p className={`ui-muted ${s.small}`}>
            Short sessions on where to put your hands and which finger plays which key. A hand on screen shows every move; you copy it on your keyboard. Take them alongside the lessons, a few minutes a day.
          </p>
        </div>
        <span style={{ flex: 'none' }}>
          <Badge tone={done.size === sessions.length ? 'good' : 'neutral'} data-testid="hands-count">
            {sessions.filter((x) => done.has(x.id)).length} of {sessions.length} done
          </Badge>
        </span>
      </motion.div>
      <motion.div className={s.lessonGrid} variants={stagger(0.03)}>
        {sessions.map((x) => {
          const status = done.has(x.id) ? 'done' : x.id === next?.id ? 'in-progress' : 'available';
          return (
            <motion.a key={x.id} variants={fadeUp} className={s.lessonLink} href={href.hand(x.id)} data-testid={`hand-session-${x.id}`} data-status={status}>
              <Card interactive padding="md" className={`${s.lessonCard} ${l.card}`} data-status={status}>
                <span className={`${s.lessonNum} ${l.num}`} data-status={status}>
                  {status === 'done' ? '✓' : x.order}
                </span>
                <span className={s.lessonText}>
                  <span className={s.lessonTitle}>{x.title}</span>
                  <span className={`ui-muted ${s.small}`}>{x.summary}</span>
                </span>
                {status === 'done' ? <Badge tone="good">Done</Badge> : status === 'in-progress' ? <Badge tone="warn">Up next</Badge> : <Badge tone="neutral">Open</Badge>}
              </Card>
            </motion.a>
          );
        })}
      </motion.div>
    </motion.div>
  );
}
