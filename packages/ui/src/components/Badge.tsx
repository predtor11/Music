import type { HTMLAttributes } from 'react';

export type Tone = 'neutral' | 'accent' | 'good' | 'bad' | 'warn';

export function Badge({ tone = 'neutral', className, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return <span className={['ui-badge', className].filter(Boolean).join(' ')} data-tone={tone} {...rest} />;
}

const DOT_COLORS: Record<Tone, string> = {
  neutral: 'var(--text-faint)',
  accent: 'var(--accent)',
  good: 'var(--good)',
  bad: 'var(--bad)',
  warn: 'var(--warn)',
};

/** Small coloured dot, pulsing while something is live (a connected keyboard). */
export function StatusDot({ tone = 'neutral', pulse = false, label }: { tone?: Tone; pulse?: boolean; label?: string }) {
  return (
    <span
      className="ui-status-dot"
      data-pulse={pulse}
      style={{ ['--dot-color' as string]: DOT_COLORS[tone] }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}

export function Kbd(props: HTMLAttributes<HTMLElement>) {
  return <kbd className="ui-kbd" {...props} />;
}
