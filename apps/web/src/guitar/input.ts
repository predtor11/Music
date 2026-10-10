import type { FretPosition } from '@music/contracts';
import { fretToMidi, STANDARD_TUNING } from '@music/theory';

/** One stopped/open position per string; clicking it again releases that string. */
export function pluckPositions(current: readonly FretPosition[], position: FretPosition): FretPosition[] {
  const previous = current.find((p) => p.string === position.string);
  const rest = current.filter((p) => p.string !== position.string);
  return previous?.fret === position.fret ? rest : [...rest, position].sort((a, b) => a.string - b.string);
}
export function positionNotes(positions: readonly FretPosition[]): number[] {
  return [...new Set(positions.map((p) => fretToMidi(STANDARD_TUNING, p)))].sort((a, b) => a - b);
}
