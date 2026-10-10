import { midiToPositions, STANDARD_TUNING } from '@music/theory';
import { Fretboard } from '../fretboard/Fretboard.js';
import { useNoteInput } from '../input/NoteInput.js';
import type { InstrumentVisualProps } from './types.js';

export function GuitarVisual({ marks, captions, labelFor, names, clickable = true }: InstrumentVisualProps) {
  const input = useNoteInput();
  const maxFret = 24;
  const targets = [...(marks?.entries() ?? [])].filter(([, mark]) => mark === 'target' || mark === 'fit')
    .flatMap(([midi]) => midiToPositions(STANDARD_TUNING, midi, maxFret));
  return <Fretboard positions={input.guitarPositions} targets={targets} marks={marks} captions={captions} labelFor={labelFor}
    names={names} tuning={STANDARD_TUNING} maxFret={maxFret} onPluck={clickable ? input.pluck : undefined}
    mic={{ midi: input.microphone.reading?.midi ?? null }} />;
}
