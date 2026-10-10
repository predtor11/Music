import type { ChordShape } from '@music/theory';

export interface BarreSpan {
  fret: number;
  /** Thickest played string first. */
  fromString: number;
  toString: number;
}

/** One finger repeated at one fret presses across the intervening strings. */
export function barreSpans(shape: ChordShape): BarreSpan[] {
  const spans = new Map<string, number[]>();
  shape.frets.forEach((fret, i) => {
    const finger = shape.fingers[i];
    if (fret === null || fret === 0 || finger == null) return;
    const key = `${finger}:${fret}`;
    spans.set(key, [...(spans.get(key) ?? []), i]);
  });
  return [...spans.values()].filter((indices) => indices.length > 1).map((indices) => ({
    fret: shape.frets[indices[0]!]!,
    fromString: shape.frets.length - indices[0]!,
    toString: shape.frets.length - indices.at(-1)!,
  }));
}
