import type { SessionSummary } from '@music/contracts';
import { Badge, Button, Card, Feedback, fadeUp, stagger } from '@music/ui';
import { motion } from 'motion/react';
import s from './lesson.module.css';

/** End-of-lesson or checkpoint score. */
export function Summary({ summary, title, onRetry, backHref, offline }: { summary: SessionSummary; title: string; onRetry: () => void; backHref: string; offline: boolean }) {
  const pct = summary.accuracy === null ? null : Math.round(summary.accuracy);
  const passed = summary.passed;
  return (
    <Feedback signal={passed ? { kind: 'good', id: 'summary' } : null} holdMs={2400}>
      <Card highlight padding="lg" className={s.summary} data-testid="summary">
        <motion.div className={s.summaryInner} variants={stagger(0.08)} initial="hidden" animate="show">
          <motion.span variants={fadeUp} className="ui-eyebrow">
            {title}
          </motion.span>
          <motion.div variants={fadeUp} className={`ui-display ui-gradient-text ${s.score}`} data-testid="score">
            {pct === null ? 'Done' : `${pct}%`}
          </motion.div>
          <motion.p variants={fadeUp} className="ui-muted">
            {summary.total > 0
              ? `${summary.firstTryCorrect} of ${summary.total} right on the first try.`
              : 'Nothing to grade in this one. Nice exploring.'}
          </motion.p>
          {passed !== null && (
            <motion.div variants={fadeUp}>
              <Badge tone={passed ? 'good' : 'warn'} data-testid="passed">
                {passed ? 'Passed' : 'Almost. Try it again to pass.'}
              </Badge>
            </motion.div>
          )}
          {offline && (
            <motion.p variants={fadeUp} className={`ui-muted ${s.small}`}>
              The practice server wasn't reachable, so this score isn't saved.
            </motion.p>
          )}
          <motion.div variants={fadeUp} className={s.summaryActions}>
            <Button variant="secondary" onClick={onRetry}>
              Try again
            </Button>
            <Button variant="primary" onClick={() => (location.hash = backHref)}>
              Back to lessons
            </Button>
          </motion.div>
        </motion.div>
      </Card>
    </Feedback>
  );
}
