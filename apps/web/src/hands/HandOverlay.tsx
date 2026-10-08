/**
 * Animated hands over the virtual keyboard, seen from where you sit: the palm
 * rests in a lane below the keys and each finger reaches up to its key, with
 * its finger number on the fingertip. The finger to play next glows and
 * pulses; a finger that just played dips. When a hand changes position (thumb
 * under, crossing over, a new shape) it glides there.
 */

import type { HandPosition } from '@music/contracts';
import { isBlackKey } from '@music/theory';
import { motion } from 'motion/react';
import type { CSSProperties } from 'react';
import { keyCenter, type KeyboardSize } from '../keyboard/layout.js';
import { fingerId, type FingerId } from './fingering.js';
import s from './hands.module.css';

/** How far down a key (0 top, 1 front edge) each fingertip rests, thumb first. Thumbs and little fingers are shorter. */
const TIP_WHITE = [0.86, 0.74, 0.69, 0.73, 0.8];
const TIP_BLACK = [0.5, 0.42, 0.38, 0.41, 0.46];

const FINGER_NAMES = ['thumb', 'pointing finger', 'middle finger', 'ring finger', 'little finger'];

export interface HandOverlayProps {
  size: KeyboardSize;
  hands: readonly HandPosition[];
  /** Fingers that should play next: they glow. */
  cue?: ReadonlySet<FingerId>;
  /** Fingers that just played: they dip. */
  down?: ReadonlySet<FingerId>;
}

export function HandOverlay({ size, hands, cue, down }: HandOverlayProps) {
  return (
    <div className={s.overlay} aria-hidden="true" data-testid="hands">
      {hands.map((h) => (
        <Hand key={h.hand} size={size} position={h} cue={cue} down={down} />
      ))}
    </div>
  );
}

function Hand({ size, position, cue, down }: { size: KeyboardSize; position: HandPosition; cue?: ReadonlySet<FingerId>; down?: ReadonlySet<FingerId> }) {
  const xs = position.keys.map((k) => keyCenter(size, k));
  const shown = xs.filter((x): x is number => x !== null);
  if (shown.length === 0) return null;
  const whites = Math.max(1, shown.length);
  const left = Math.min(...shown);
  const right = Math.max(...shown);
  // Half a key of palm beyond the outer fingers.
  const pad = (right - left) / (whites - 1 || 1) / 2;
  const palm: CSSProperties = { left: `${(left - pad) * 100}%`, width: `${(right - left + pad * 2) * 100}%` };

  return (
    <motion.div
      className={s.hand}
      data-hand={position.hand}
      data-testid={`hand-${position.hand}`}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 30 }}
    >
      <div className={s.palm} style={palm}>
        <span className={s.palmLabel}>{position.hand === 'left' ? 'Left hand' : 'Right hand'}</span>
      </div>
      {position.keys.map((key, i) => {
        const x = xs[i];
        if (x == null) return null;
        const finger = i + 1;
        const id = fingerId(position.hand, finger);
        const tip = (isBlackKey(key) ? TIP_BLACK : TIP_WHITE)[i]!;
        return (
          <div
            key={finger}
            className={s.finger}
            data-finger={finger}
            data-cue={cue?.has(id) || undefined}
            data-down={down?.has(id) || undefined}
            data-testid={`finger-${id}`}
            data-key={key}
            title={`${position.hand === 'left' ? 'Left' : 'Right'} ${FINGER_NAMES[i]} (${finger})`}
            style={{ left: `${x * 100}%`, ['--tip' as string]: tip }}
          >
            <span className={s.tip}>{finger}</span>
          </div>
        );
      })}
    </motion.div>
  );
}
