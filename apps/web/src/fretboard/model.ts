import { fretToMidi, midiName, pretty } from '@music/theory';
import type { FretPosition, GuitarTuning } from '../guitar/types.js';

/** Validate the displayed board bounds, then use the shared guitar maths. */
export function positionNote(tuning: GuitarTuning, position: FretPosition): number {
  if (!Number.isInteger(position.string) || position.string < 1 || position.string > tuning.strings.length ||
      !Number.isInteger(position.fret) || position.fret < 0 || position.fret > 24) {
    throw new RangeError('Invalid fret position.');
  }
  const midi = fretToMidi(tuning, position);
  if (!Number.isInteger(midi) || midi < 0 || midi > 127) throw new RangeError('Invalid guitar tuning.');
  return midi;
}

export function positionLabel(tuning: GuitarTuning, position: FretPosition): string {
  return `String ${position.string}, ${position.fret === 0 ? 'open' : `fret ${position.fret}`}, ${pretty(midiName(positionNote(tuning, position)))}`;
}

export function samePosition(a: FretPosition, b: FretPosition): boolean {
  return a.string === b.string && a.fret === b.fret;
}

export function fretRows(tuning: GuitarTuning, maxFret: number) {
  if (!Number.isInteger(maxFret) || maxFret < 1 || maxFret > 24 || tuning.strings.length === 0) throw new RangeError('Invalid fretboard size.');
  return Array.from({ length: tuning.strings.length }, (_, row) =>
    Array.from({ length: maxFret + 1 }, (_, fret) => {
      const position = { string: row + 1, fret };
      return { position, midi: positionNote(tuning, position), label: positionLabel(tuning, position) };
    }),
  );
}
