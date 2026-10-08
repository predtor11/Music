import { motion, useAnimationControls } from 'motion/react';
import { useEffect, useState, type ReactNode } from 'react';
import { celebrate, shake } from '../motion.js';

export interface FeedbackSignal {
  kind: 'good' | 'bad';
  /** Change this every time, even for the same kind, to replay the animation. */
  id: number | string;
}

/**
 * Wraps a test area: glows green and lifts on a right answer, glows red and
 * shakes on a wrong one. The glow fades after `holdMs`.
 */
export function Feedback({ signal, children, holdMs = 900, className }: { signal: FeedbackSignal | null; children: ReactNode; holdMs?: number; className?: string }) {
  const controls = useAnimationControls();
  useEffect(() => {
    if (!signal) return;
    void controls.start(signal.kind === 'good' ? celebrate : shake);
  }, [signal, controls]);

  return (
    <FeedbackGlow signal={signal} holdMs={holdMs} className={className}>
      <motion.div animate={controls}>{children}</motion.div>
    </FeedbackGlow>
  );
}

function FeedbackGlow({ signal, holdMs, children, className }: { signal: FeedbackSignal | null; holdMs: number; children: ReactNode; className?: string }) {
  const state = useFading(signal, holdMs);
  return (
    <div className={['ui-feedback', className].filter(Boolean).join(' ')} data-state={state}>
      {children}
    </div>
  );
}

function useFading(signal: FeedbackSignal | null, holdMs: number): 'idle' | 'good' | 'bad' {
  const [state, setState] = useState<'idle' | 'good' | 'bad'>('idle');
  useEffect(() => {
    if (!signal) return;
    setState(signal.kind);
    const t = setTimeout(() => setState('idle'), holdMs);
    return () => clearTimeout(t);
  }, [signal, holdMs]);
  return state;
}
