import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
import { swap } from '../motion.js';

/**
 * Animates between values: the old one blurs out upward while the new one
 * rises in. Give it a `value` key, for example the chord symbol, so it only
 * animates when the value really changes.
 */
export function Swap({ value, children, className }: { value: string | number; children: ReactNode; className?: string }) {
  return (
    <span className={['ui-swap', className].filter(Boolean).join(' ')} aria-live="polite">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={value} variants={swap} initial="hidden" animate="show" exit="exit" style={{ display: 'inline-block' }}>
          {children}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
