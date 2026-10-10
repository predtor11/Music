import { pretty, type ChordShape } from '@music/theory';
import s from './LessonDiagram.module.css';
import { barreSpans } from './barres.js';

/** Standard-tuning shape: thickest string on the left, with absolute fret numbers. */
export function ChordDiagram({ shape }: { shape: ChordShape }) {
  const firstFret = shape.baseFret;
  const count = Math.max(4, ...shape.frets.filter((f): f is number => f !== null).map((f) => f - firstFret + 1));
  const height = 100 + count * 42;
  const description = shape.frets.map((f, i) => `string ${6 - i}: ${f === null ? 'do not play' : f === 0 ? 'open' : `fret ${f}`}`).join('; ');
  const barres = barreSpans(shape);
  const barreDescription = barres.map((b) => `One finger across strings ${b.fromString} through ${b.toString} at fret ${b.fret}.`).join(' ');
  return (
    <figure className={`${s.figure} ${s.chord}`} data-testid="guitar-chord-diagram">
      <svg viewBox={`0 0 410 ${height}`} role="img" aria-label={`${pretty(shape.name)} chord. ${description}. ${barreDescription}`}>
        {Array.from({ length: count + 1 }, (_, i) => (
          <g key={i} stroke="var(--text)" fill="var(--text)">
            <path d={`M70 ${65 + i * 42}H340`} strokeWidth={i === 0 && firstFret === 1 ? 4 : 1} />
            {i < count && <text x="25" y={94 + i * 42} stroke="none" fontSize="18">{firstFret + i}</text>}
          </g>
        ))}
        {shape.frets.map((fret, i) => {
          const x = 70 + i * 54;
          return (
            <g key={i}>
              <text x={x} y="23" textAnchor="middle" fill="var(--text)" fontSize="18">{6 - i}</text>
              <path d={`M${x} 65V${65 + count * 42}`} stroke="var(--text)" />
              {(fret === null || fret === 0) ? (
                <text x={x} y="52" textAnchor="middle" fill="var(--text)" fontSize="22">{fret === null ? 'x' : '0'}</text>
              ) : <circle cx={x} cy={86 + (fret - firstFret) * 42} r="12" fill="var(--accent)" />}
            </g>
          );
        })}
        {barres.map((b) => {
          const y = 86 + (b.fret - firstFret) * 42;
          return <path key={`${b.fret}-${b.fromString}`} data-testid="guitar-barre"
            d={`M${70 + (6 - b.fromString) * 54} ${y}H${70 + (6 - b.toString) * 54}`}
            stroke="var(--accent)" strokeWidth="20" strokeLinecap="round" />;
        })}
      </svg>
      <figcaption className="ui-muted">
        {pretty(shape.name)}: {description}. Read thick string 6 on the left to thin string 1 on the right.
        {' '}0 means open; x means leave that string out; a dot marks a pressed fret.
        {' '}{barreDescription || 'Finger choices come later.'}
      </figcaption>
    </figure>
  );
}
