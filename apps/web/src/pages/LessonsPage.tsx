/**
 * Units and their lessons, in order, each lesson a card you can open.
 */

import type { Lesson } from '@music/contracts';
import { Badge, Button, Card, fadeUp, stagger } from '@music/ui';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { getLesson, getUnits, type UnitSummary } from '../api/client.js';
import { href } from '../router.js';
import { LoadError, Loading } from './states.js';
import s from '../lesson/lesson.module.css';

interface UnitView {
  unit: UnitSummary;
  lessons: Lesson[];
}

export function LessonsPage() {
  const [units, setUnits] = useState<UnitView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    getUnits()
      .then(async (list) => {
        const sorted = [...list].sort((a, b) => a.order - b.order);
        const views = await Promise.all(
          sorted.map(async (unit) => ({
            unit,
            lessons: (await Promise.all(unit.lessonIds.map((id) => getLesson(id)))).sort((a, b) => a.order - b.order),
          })),
        );
        if (live) setUnits(views);
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, []);

  if (error) return <LoadError what="the lessons" message={error} />;
  if (!units) return <Loading />;

  return (
    <motion.div className={s.units} variants={stagger(0.08)} initial="hidden" animate="show">
      <motion.div variants={fadeUp} className={s.unitsIntro}>
        <h1 className="ui-title">Lessons</h1>
        <p className="ui-muted">Short lessons with your keyboard. Each one explains, shows it on the keys, then has you play it.</p>
      </motion.div>
      {units.map(({ unit, lessons }) => (
        <motion.section key={unit.id} variants={fadeUp} className={s.unit} data-testid={`unit-${unit.id}`}>
          <div className={s.unitHead}>
            <div>
              <span className="ui-eyebrow">Unit {unit.order}</span>
              <h2 className="ui-heading">{unit.title}</h2>
              <p className={`ui-muted ${s.small}`}>{unit.outcome}</p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => (location.hash = href.checkpoint(unit.id))} data-testid={`checkpoint-${unit.id}`}>
              Unit test
            </Button>
          </div>
          <motion.div className={s.lessonGrid} variants={stagger(0.04)}>
            {lessons.map((l) => (
              <motion.a key={l.id} href={href.lesson(l.id)} variants={fadeUp} className={s.lessonLink} data-testid={`lesson-${l.id}`}>
                <Card interactive padding="md" className={s.lessonCard}>
                  <span className={s.lessonNum}>{l.order}</span>
                  <span className={s.lessonText}>
                    <span className={s.lessonTitle}>{l.title}</span>
                    <span className={`ui-muted ${s.small}`}>{l.summary}</span>
                  </span>
                  <Badge tone="neutral">{l.minutes} min</Badge>
                </Card>
              </motion.a>
            ))}
          </motion.div>
        </motion.section>
      ))}
    </motion.div>
  );
}
