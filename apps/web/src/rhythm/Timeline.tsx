/**
 * The rhythm as a line of beats: where each note should land (with the window
 * that still counts), a playhead while it plays, and every tap, marked early
 * or late once graded.
 */

import { pop } from '@music/ui';
import { AnimatePresence, motion } from 'motion/react';
import { offsetText, type TapMark, type TargetMark } from './marks.js';
import s from './rhythm.module.css';

export interface TimelineProps {
  totalBeats: number;
  beatsPerBar: number;
  onsets: readonly number[];
  /** The window around each note that still counts, in beats either side. */
  toleranceBeats: number;
  /** Graded targets; before grading, targets are drawn plain. */
  targets?: readonly TargetMark[] | null;
  /** Taps: live ones have no tone yet. */
  taps: ReadonlyArray<Pick<TapMark, 'beat'> & Partial<Pick<TapMark, 'offsetMs' | 'good'>>>;
  /** While playing: performance.now() of beat 0, and ms per beat, for the playhead. */
  run?: { startMs: number; beatMs: number } | null;
}

const pct = (beat: number, total: number) => `${(Math.min(Math.max(beat, -0.4), total + 0.4) / total) * 100}%`;

export function Timeline({ totalBeats, beatsPerBar, onsets, toleranceBeats, targets, taps, run }: TimelineProps) {
  const beats = Array.from({ length: totalBeats + 1 }, (_, i) => i);
  return (
    <div className={s.timeline} data-testid="timeline" aria-hidden="true">
      <div className={s.track} />
      {beats.map((b) => (
        <span key={`t${b}`}>
          <span className={s.tick} data-bar={b % beatsPerBar === 0} style={{ left: pct(b, totalBeats) }} />
          {b < totalBeats && (
            <span className={s.tickLabel} style={{ left: pct(b, totalBeats) }}>
              {(b % beatsPerBar) + 1}
            </span>
          )}
        </span>
      ))}
      {onsets.map((o, i) => (
        <span key={`w${i}`} className={s.window} style={{ left: pct(o, totalBeats), width: `${((toleranceBeats * 2) / totalBeats) * 100}%` }} />
      ))}
      {onsets.map((o, i) => {
        const t = targets?.[i];
        return <span key={`o${i}`} className={s.target} data-testid="beat-target" data-state={t ? (t.hit ? 'hit' : 'missed') : 'waiting'} style={{ left: pct(o, totalBeats) }} />;
      })}
      {run && (
        <motion.span
          key={run.startMs}
          className={s.playhead}
          initial={{ left: '0%' }}
          animate={{ left: '100%' }}
          transition={{ ease: 'linear', duration: (totalBeats * run.beatMs) / 1000, delay: Math.max(0, run.startMs - performance.now()) / 1000 }}
        />
      )}
      <AnimatePresence>
        {taps.map((t, i) => {
          const tone = t.good === undefined ? 'live' : t.good ? 'good' : 'bad';
          return (
            <motion.span
              key={i}
              className={s.tap}
              data-testid="tap"
              data-tone={tone}
              data-offset={t.offsetMs}
              data-row={i % 2}
              style={{ left: pct(t.beat, totalBeats) }}
              variants={pop}
              initial="hidden"
              animate="show"
              exit="exit"
            >
              <span className={s.tapLabel}>{t.offsetMs !== undefined ? offsetText(t.offsetMs) : ' '}</span>
              <span className={s.tapLine} />
            </motion.span>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
