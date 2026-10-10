import type { Lesson } from '@music/contracts';
import s from './LessonDiagram.module.css';

/** Tab gives a single playable route; the fretboard also shows equivalent notes. */
export function ScaleRoute({ pattern }: { pattern: NonNullable<Lesson['guitarPattern']> }) {
  const width = 120 + pattern.positions.length * 64;
  return (
    <figure className={s.figure} data-testid="guitar-scale-route">
      <svg viewBox={`0 0 ${width} 230`} role="img" aria-label={`${pattern.title}: read the fret numbers left to right, one at a time.`}>
        {['1 E', '2 B', '3 G', '4 D', '5 A', '6 E'].map((label, i) => (
          <g key={label} fill="var(--text)" stroke="var(--text)">
            <text x="10" y={49 + i * 26} stroke="none" fontSize="18">{label}</text>
            <path d={`M75 ${43 + i * 26}H${width - 20}`} />
          </g>
        ))}
        {pattern.positions.map((pos, i) => {
          const x = 100 + i * 64;
          const y = 43 + (pos.string - 1) * 26;
          return (
            <g key={i}>
              <text x={x} y="20" textAnchor="middle" fill="var(--text-muted)" fontSize="16">{i + 1}</text>
              <rect x={x - 14} y={y - 13} width="28" height="26" fill="var(--surface-strong)" />
              <text x={x} y={y + 7} textAnchor="middle" fill="var(--accent)" fontSize="22">{pos.fret}</text>
            </g>
          );
        })}
      </svg>
      <figcaption className="ui-muted">
        {pattern.title}. Read left to right: {pattern.positions.map((p, i) => `${i + 1}: string ${p.string}, fret ${p.fret}`).join('; ')}.
        {' '}The same sounds in other positions also count.
      </figcaption>
    </figure>
  );
}
