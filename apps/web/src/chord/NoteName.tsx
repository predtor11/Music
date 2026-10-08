import type { NoteNaming } from '@music/contracts';
import { pretty, type SargamName } from '@music/theory';
import type { NoteLabel } from './describe.js';
import s from './chord.module.css';

/** Sargam syllable in Bhatkhande style: komal underlined, tivra overlined. */
export function Sargam({ name }: { name: SargamName }) {
  return (
    <span className={s.sargam} data-variant={name.variant} title={name.label} aria-label={name.label}>
      {name.syllable}
    </span>
  );
}

/** A note shown the way the person chose: Western, sargam, or both. */
export function NoteName({ note, naming, withOctave = false }: { note: NoteLabel; naming: NoteNaming; withOctave?: boolean }) {
  const western = (
    <span className={s.western}>
      {pretty(note.western)}
      {withOctave && note.octave !== null && <sub className={s.octave}>{note.octave}</sub>}
    </span>
  );
  if (naming === 'western') return western;
  if (naming === 'sargam') return <Sargam name={note.sargam} />;
  return (
    <span className={s.both}>
      {western}
      <Sargam name={note.sargam} />
    </span>
  );
}
