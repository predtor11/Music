import { motion, type HTMLMotionProps } from 'motion/react';
import { forwardRef } from 'react';
import { fadeUp, spring } from '../motion.js';

export interface CardProps extends HTMLMotionProps<'div'> {
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Lifts on hover and shows a pointer. */
  interactive?: boolean;
  /** Gradient edge, for the thing that matters most on screen. */
  highlight?: boolean;
  /** Fade and rise in when it mounts. */
  appear?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { padding = 'md', interactive = false, highlight = false, appear = false, className, ...rest },
  ref,
) {
  return (
    <motion.div
      ref={ref}
      className={['ui-card', className].filter(Boolean).join(' ')}
      data-padding={padding}
      data-interactive={interactive}
      data-highlight={highlight}
      {...(appear ? { variants: fadeUp, initial: 'hidden', animate: 'show', exit: 'exit' } : {})}
      {...(interactive ? { whileHover: { y: -2 }, whileTap: { scale: 0.99 }, transition: spring.gentle } : {})}
      {...rest}
    />
  );
});
