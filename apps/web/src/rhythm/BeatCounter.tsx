/**
 * The metronome you can see: a dot per beat in the bar, lit on the beat, and
 * the count-in called out ("1, 2, 3, 4") before you start.
 */

import { Swap } from '@music/ui';
import s from './rhythm.module.css';

export interface BeatCounterProps {
  beatsPerBar: number;
  /** From useBeat: negative in the count-in, null when stopped. */
  beat: number | null;
  /** What's going on, shown next to the dots. */
  phase: string;
}

export function BeatCounter({ beatsPerBar, beat, phase }: BeatCounterProps) {
  const inBar = beat === null ? null : ((beat % beatsPerBar) + beatsPerBar) % beatsPerBar;
  const counting = beat !== null && beat < 0;
  return (
    <div className={s.beats} data-testid="beat-counter" data-beat={beat ?? ''}>
      <div className={s.dots}>
        {Array.from({ length: beatsPerBar }, (_, i) => (
          <span key={i} className={s.dot} data-on={inBar === i} data-down={i === 0} />
        ))}
      </div>
      <span className={s.count}>
        <Swap value={counting ? String(inBar! + 1) : ''}>
          <span>{counting ? inBar! + 1 : ''}</span>
        </Swap>
      </span>
      <span className={s.phase} data-testid="rhythm-phase">
        {phase}
      </span>
    </div>
  );
}
