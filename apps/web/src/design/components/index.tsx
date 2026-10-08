/**
 * Base components of the design system. Screens build from these and the
 * tokens; add a new base component here rather than styling one-offs.
 */

import { motion, type HTMLMotionProps } from 'motion/react';
import { useId, type ReactNode } from 'react';
import { rise, spring } from '../motion.js';
import s from './components.module.css';

const cx = (...names: Array<string | false | null | undefined>) => names.filter(Boolean).join(' ');

/** Glass panel that rises into place. `glow` adds the gradient hairline. */
export function Card({ glow, className, children, ...rest }: HTMLMotionProps<'section'> & { glow?: boolean }) {
  return (
    <motion.section variants={rise} initial="hidden" animate="show" className={cx(s.card, glow && s.cardGlow, className)} {...rest}>
      {children}
    </motion.section>
  );
}

export function Button({
  variant = 'ghost',
  size = 'md',
  className,
  children,
  ...rest
}: HTMLMotionProps<'button'> & { variant?: 'primary' | 'ghost'; size?: 'sm' | 'md' }) {
  return (
    <motion.button
      type="button"
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.96 }}
      transition={spring.snappy}
      className={cx(s.button, variant === 'primary' ? s.primary : s.ghost, size === 'sm' && s.small, className)}
      {...rest}
    >
      {children}
    </motion.button>
  );
}

export function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className={s.field}>
      <label className={s.label} htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  );
}

export interface Option<T extends string> {
  value: T;
  label: string;
}

export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  testId,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<Option<T>>;
  onChange: (value: T) => void;
  testId?: string;
}) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id}>
      <div className={s.selectWrap}>
        <select id={id} data-testid={testId} className={s.select} value={value} onChange={(e) => onChange(e.target.value as T)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span className={s.chevron} aria-hidden />
      </div>
    </Field>
  );
}

/** Single-choice pill switcher with a sliding thumb. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  testId,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<Option<T>>;
  onChange: (value: T) => void;
  testId?: string;
}) {
  const group = useId();
  return (
    <Field label={label}>
      <div role="radiogroup" aria-label={label} className={s.segmented} data-testid={testId}>
        {options.map((o) => {
          const checked = o.value === value;
          return (
            <button key={o.value} type="button" role="radio" aria-checked={checked} className={s.segment} onClick={() => onChange(o.value)}>
              {checked && <motion.span layoutId={`thumb-${group}`} className={s.segmentThumb} transition={spring.snappy} />}
              <span className={s.segmentLabel}>{o.label}</span>
            </button>
          );
        })}
      </div>
    </Field>
  );
}

export type Tone = 'success' | 'warning' | 'danger' | 'neutral';

export function Pill({ tone = 'neutral', pulse, children, testId }: { tone?: Tone; pulse?: boolean; children: ReactNode; testId?: string }) {
  return (
    <span className={s.pill} data-testid={testId}>
      <span className={cx(s.dot, s[`tone-${tone}`], pulse && s.pulse)} aria-hidden />
      {children}
    </span>
  );
}
