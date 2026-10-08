import { motion, type HTMLMotionProps } from 'motion/react';
import { useId, useState, type ReactNode } from 'react';
import { fadeUp, spring, duration, ease } from '../motion.js';
import type { Tone } from './Badge.js';
import './charts.css';

/** Mark colours by tone. Meaning tones (good, bad, warn) only where the value means right or wrong. */
export const TONE_COLOR: Record<Tone, string> = {
  neutral: 'var(--text-faint)',
  accent: 'var(--accent)',
  good: 'var(--good)',
  bad: 'var(--bad)',
  warn: 'var(--warn)',
};

const draw = { duration: duration.slow * 2, ease: ease.out };

export interface StatTileProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  label: string;
  value: ReactNode;
  /** Small text after the value, for example "min". */
  unit?: string;
  /** One line under the value. */
  hint?: ReactNode;
  /** A small visual beside the value, for example a Ring. */
  aside?: ReactNode;
}

/** One headline number with its label: practice minutes, a streak, a score. */
export function StatTile({ label, value, unit, hint, aside, className, ...rest }: StatTileProps) {
  return (
    <motion.div variants={fadeUp} className={['ui-card', 'ui-stat', className].filter(Boolean).join(' ')} data-padding="md" {...rest}>
      <div className="ui-stat-main">
        <span className="ui-eyebrow">{label}</span>
        <span className="ui-stat-value">
          <span data-role="value">{value}</span>
          {unit && <span className="ui-stat-unit">{unit}</span>}
        </span>
        {hint && <span className="ui-stat-hint">{hint}</span>}
      </div>
      {aside && <div className="ui-stat-aside">{aside}</div>}
    </motion.div>
  );
}

export interface RingProps {
  /** 0 to 1. */
  value: number;
  size?: number;
  thickness?: number;
  tone?: Tone;
  /** Read out by screen readers, for example "82% right first time". */
  label: string;
  children?: ReactNode;
}

/** A circular meter that sweeps in, with anything in its middle. */
export function Ring({ value, size = 88, thickness = 8, tone = 'accent', label, children }: RingProps) {
  const r = (size - thickness) / 2;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="ui-ring" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-hover)" strokeWidth={thickness} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={TONE_COLOR[tone]}
          strokeWidth={thickness}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: v }}
          transition={draw}
          style={{ opacity: v === 0 ? 0 : 1 }}
        />
      </svg>
      {children && <div className="ui-ring-center">{children}</div>}
    </div>
  );
}

export interface MeterProps {
  /** 0 to max. */
  value: number;
  max?: number;
  tone?: Tone;
  label: string;
}

/** A thin horizontal bar that grows in; for counts and shares in a list. */
export function Meter({ value, max = 1, tone = 'accent', label }: MeterProps) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) * 100 : 0;
  return (
    <div className="ui-meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <motion.div
        className="ui-meter-fill"
        style={{ background: TONE_COLOR[tone] }}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={spring.gentle}
      />
    </div>
  );
}

export interface SparkPoint {
  /** Position along the x axis, 0 to slots - 1 (for example the day of the week). */
  slot: number;
  /** 0 to max. */
  value: number;
  /** Tooltip and screen reader text for this point. */
  label: string;
}

export interface SparklineProps {
  points: readonly SparkPoint[];
  /** How many x positions there are; empty slots stay empty. */
  slots: number;
  max?: number;
  tone?: Tone;
  /** Summary for screen readers. */
  label: string;
  /** Labels under the first and last slot, for example "Mon" and "Sun". */
  edges?: [string, string];
  height?: number;
}

/**
 * A small line chart for one series over a fixed set of slots, with a faint
 * area, a hover/focus tooltip on each point and a draw-in animation.
 */
export function Sparkline({ points, slots, max = 1, tone = 'accent', label, edges, height = 56 }: SparklineProps) {
  const gid = useId().replace(/:/g, '');
  const [active, setActive] = useState<number | null>(null);
  const sorted = [...points].sort((a, b) => a.slot - b.slot);
  // Inset so dots at the edges stay inside the box.
  const x = (slot: number) => (slots <= 1 ? 50 : 4 + (slot / (slots - 1)) * 92);
  const y = (value: number) => 92 - (Math.max(0, Math.min(max, value)) / max) * 84;
  const line = sorted.map((p, i) => `${i ? 'L' : 'M'}${x(p.slot)},${y(p.value)}`).join(' ');
  const area = sorted.length > 1 ? `${line} L${x(sorted.at(-1)!.slot)},100 L${x(sorted[0]!.slot)},100 Z` : '';
  const color = TONE_COLOR[tone];
  const shown = active === null ? null : sorted[active];

  return (
    <div className="ui-spark" role="group" aria-label={label}>
      <div className="ui-spark-plot" style={{ height }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient id={`spark-${gid}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <line x1="0" x2="100" y1="50" y2="50" className="ui-spark-grid" vectorEffect="non-scaling-stroke" />
          {area && <motion.path d={area} fill={`url(#spark-${gid})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={draw} />}
          {sorted.length > 1 && (
            <motion.path
              d={line}
              fill="none"
              stroke={color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={draw}
            />
          )}
        </svg>
        {sorted.map((p, i) => (
          <span
            key={p.slot}
            className="ui-spark-dot"
            data-active={active === i}
            style={{ left: `${x(p.slot)}%`, top: `${y(p.value)}%`, ['--dot-color' as string]: color }}
            tabIndex={0}
            role="img"
            aria-label={p.label}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
          />
        ))}
        {shown && (
          <motion.div
            key={shown.slot}
            className="ui-chart-tip"
            role="tooltip"
            style={{ left: `${x(shown.slot)}%`, top: `${y(shown.value)}%` }}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={spring.snappy}
          >
            {shown.label}
          </motion.div>
        )}
      </div>
      {edges && (
        <div className="ui-spark-edges" aria-hidden>
          <span>{edges[0]}</span>
          <span>{edges[1]}</span>
        </div>
      )}
    </div>
  );
}

export interface DayStripProps {
  days: ReadonlyArray<{ label: string; active: boolean; today?: boolean; title: string }>;
}

/** A row of day dots: filled on days with practice. */
export function DayStrip({ days }: DayStripProps) {
  return (
    <ol className="ui-days">
      {days.map((d, i) => (
        <li key={i} data-active={d.active} data-today={d.today ?? false} title={d.title} aria-label={d.title}>
          <motion.span
            className="ui-days-dot"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ ...spring.bouncy, delay: i * 0.04 }}
          />
          <span className="ui-days-label" aria-hidden>
            {d.label}
          </span>
        </li>
      ))}
    </ol>
  );
}
