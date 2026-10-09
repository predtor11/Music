/**
 * By Ear: the play-by-ear trainer's levels. Open from the start and made
 * fresh every round, so they can be practised any time alongside the lessons.
 */

import { Badge, Card, fadeUp, stagger } from '@music/ui';
import { motion } from 'motion/react';
import { useState } from 'react';
import { EAR_LEVELS } from '../ear/questions.js';
import { readStats } from '../ear/stats.js';
import { href } from '../router.js';
import s from '../lesson/lesson.module.css';
import l from './LessonsPage.module.css';

export function EarPage() {
  const [stats] = useState(readStats);
  const next = EAR_LEVELS.find((x) => !stats[x.id] || stats[x.id]!.best < 80);

  return (
    <motion.div variants={stagger(0.06)} initial="hidden" animate="show" className={s.unit}>
      <motion.div variants={fadeUp} className={s.unitHead}>
        <div>
          <span className="ui-eyebrow">Play by ear</span>
          <h1 className="ui-title">Hear it, find it</h1>
          <p className={`ui-muted ${s.small}`}>
            The app plays a chord, a few chords, a tune or a key, and you find it on your keyboard. After each one it names what you heard and lights it up, so the sound and the name start to go together. Start at level 1; each level is ten fresh questions.
          </p>
        </div>
      </motion.div>
      <motion.div className={s.lessonGrid} variants={stagger(0.03)}>
        {EAR_LEVELS.map((x) => {
          const st = stats[x.id];
          const status = st && st.best >= 80 ? 'done' : x.id === next?.id ? 'in-progress' : 'available';
          return (
            <motion.a key={x.id} variants={fadeUp} className={s.lessonLink} href={href.earLevel(x.id)} data-testid={`ear-level-${x.id}`} data-status={status}>
              <Card interactive padding="md" className={`${s.lessonCard} ${l.card}`} data-status={status}>
                <span className={`${s.lessonNum} ${l.num}`} data-status={status}>
                  {status === 'done' ? '✓' : x.order}
                </span>
                <span className={s.lessonText}>
                  <span className={s.lessonTitle}>{x.title}</span>
                  <span className={`ui-muted ${s.small}`}>{x.summary}</span>
                </span>
                {st ? (
                  <Badge tone={st.best >= 80 ? 'good' : 'neutral'} data-testid={`ear-best-${x.id}`}>
                    Best {st.best}%
                  </Badge>
                ) : status === 'in-progress' ? (
                  <Badge tone="warn">Up next</Badge>
                ) : (
                  <Badge tone="neutral">Open</Badge>
                )}
              </Card>
            </motion.a>
          );
        })}
      </motion.div>
    </motion.div>
  );
}
