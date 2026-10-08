import { motion } from 'motion/react';
import { useEffect, useRef, type ReactNode } from 'react';
import { swap } from '../motion.js';

/**
 * Animates between values: the new one rises in as the old one goes. Give it
 * a `value` key, for example the chord symbol, so it only animates when the
 * value really changes.
 *
 * The old value is removed at once rather than animated out. With exit
 * animations, quick changes (a wrong chord, then the right one) could leave
 * old messages stuck on screen next to the new one.
 */
export function Swap({ value, children, className }: { value: string | number; children: ReactNode; className?: string }) {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
  }, []);
  return (
    <span className={['ui-swap', className].filter(Boolean).join(' ')} aria-live="polite">
      <motion.span key={value} variants={swap} initial={mounted.current ? 'hidden' : false} animate="show" style={{ display: 'inline-block' }}>
        {children}
      </motion.span>
    </span>
  );
}
