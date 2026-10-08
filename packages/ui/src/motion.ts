/**
 * Motion presets. Use these instead of one-off numbers so the whole app moves
 * the same way: quick and springy for direct feedback, gentle for layout.
 * Everything respects the system "reduce motion" setting through
 * ThemeProvider's MotionConfig.
 */

import type { Transition, Variants } from 'motion/react';

export const spring = {
  /** Presses, toggles, key feedback. */
  snappy: { type: 'spring', stiffness: 520, damping: 34, mass: 0.7 },
  /** Cards, panels, layout changes. */
  gentle: { type: 'spring', stiffness: 260, damping: 30 },
  /** Celebrations: a correct answer, an unlocked unit. */
  bouncy: { type: 'spring', stiffness: 420, damping: 16 },
} as const satisfies Record<string, Transition>;

export const duration = { fast: 0.12, base: 0.22, slow: 0.42 } as const;

export const ease = {
  out: [0.22, 1, 0.36, 1],
  inOut: [0.65, 0, 0.35, 1],
} as const;

/** Fade and rise in; use on page sections and cards. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12, filter: 'blur(6px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: duration.slow, ease: ease.out } },
  exit: { opacity: 0, y: -8, filter: 'blur(4px)', transition: { duration: duration.base, ease: ease.out } },
};

/** Pop in; use on badges, numbers, small confirmations. */
export const pop: Variants = {
  hidden: { opacity: 0, scale: 0.85 },
  show: { opacity: 1, scale: 1, transition: spring.bouncy },
  exit: { opacity: 0, scale: 0.9, transition: { duration: duration.fast } },
};

/** Parent that reveals its children one after another. */
export const stagger = (gap = 0.05, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: gap, delayChildren: delay } },
});

/** A value swapping for another, for example a chord symbol changing. */
export const swap: Variants = {
  hidden: { opacity: 0, y: 18, scale: 0.96, filter: 'blur(8px)' },
  show: { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', transition: spring.snappy },
  exit: { opacity: 0, y: -18, scale: 0.98, filter: 'blur(8px)', transition: { duration: duration.fast } },
};

/** Wrong answer: a short horizontal shake. */
export const shake = {
  x: [0, -10, 9, -6, 4, 0],
  transition: { duration: 0.42, ease: ease.out },
};

/** Right answer: a quick lift. */
export const celebrate = {
  scale: [1, 1.04, 1],
  transition: { duration: 0.42, ease: ease.out },
};

/** Press feedback for anything clickable. */
export const press = { whileTap: { scale: 0.97 }, transition: spring.snappy } as const;
