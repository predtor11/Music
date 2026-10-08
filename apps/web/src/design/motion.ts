/**
 * Motion presets for `motion/react`. Use these instead of ad-hoc numbers so
 * every screen moves the same way. CSS animations use the matching
 * --ease-* and --dur-* tokens in tokens.css.
 */

import type { Transition, Variants } from 'motion/react';

export const ease = {
  out: [0.16, 1, 0.3, 1],
  inOut: [0.65, 0, 0.35, 1],
} as const;

export const spring = {
  /** Small UI bits: pills, toggles, highlights. */
  snappy: { type: 'spring', stiffness: 520, damping: 34, mass: 0.7 },
  /** Cards and panels entering. */
  gentle: { type: 'spring', stiffness: 220, damping: 26 },
  /** Big hero text changing. */
  bouncy: { type: 'spring', stiffness: 380, damping: 20, mass: 0.8 },
} satisfies Record<string, Transition>;

/** Fade and lift in; use on panels and list items. */
export const rise: Variants = {
  hidden: { opacity: 0, y: 16, filter: 'blur(6px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.5, ease: ease.out } },
  exit: { opacity: 0, y: -10, filter: 'blur(6px)', transition: { duration: 0.18, ease: ease.inOut } },
};

/** Parent that staggers its `rise` children. */
export const stagger = (gap = 0.06, delay = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: gap, delayChildren: delay } },
});

/** Pop in from slightly smaller; use on answers that change in place. */
export const pop: Variants = {
  hidden: { opacity: 0, scale: 0.86, filter: 'blur(10px)' },
  show: { opacity: 1, scale: 1, filter: 'blur(0px)', transition: spring.bouncy },
  exit: { opacity: 0, scale: 1.06, filter: 'blur(10px)', transition: { duration: 0.14, ease: ease.inOut } },
};
