import type { Lesson } from '@music/contracts';
import s from './LessonDiagram.module.css';
import partsArt from '../assets/instruments/guitar-parts.webp';

/** Labelled guitar photo and first tab example, alongside the playable fretboard. */
export function LessonDiagram({ kind }: { kind: NonNullable<Lesson['guitarDiagram']> }) {
  return (
    <figure className={s.figure} data-testid={`guitar-diagram-${kind}`}>
      {kind === 'parts' ? (
        <>
          <img src={partsArt} width={1774} height={887}
            alt="Acoustic guitar with labelled body, bridge, sound hole, neck, headstock and tuning pegs; a separate close-up labels an electric guitar pickup." />
          <figcaption className="ui-muted">Acoustic: hollow body and sound hole. Electric: pickups send the sound to an amplifier.</figcaption>
        </>
      ) : (
        <>
          <svg viewBox="0 0 700 210" role="img" aria-label="Six tab lines: thin string 1 on top, thick string 6 below. On string 6, read zero then one from left to right.">
            {['1 E', '2 B', '3 G', '4 D', '5 A', '6 E'].map((label, i) => (
              <g key={label} fill="var(--text)" stroke="var(--text)">
                <text x="10" y={39 + i * 24} stroke="none" fontSize="18">{label}</text>
                <path d={`M80 ${33 + i * 24}H660`} strokeWidth="1" />
              </g>
            ))}
            {[{ x: 160, n: '0' }, { x: 360, n: '1' }].map(({ x, n }) => (
              <g key={n}>
                <rect x={x - 12} y="138" width="24" height="28" fill="var(--surface-strong)" />
                <text x={x} y="161" textAnchor="middle" fill="var(--accent)" fontSize="24">{n}</text>
              </g>
            ))}
            <text x="260" y="199" textAnchor="middle" fill="var(--text)" fontSize="18">Read left to right →</text>
          </svg>
          <figcaption className="ui-muted">String 6: play open (0), then press the first fret (1).</figcaption>
        </>
      )}
    </figure>
  );
}
