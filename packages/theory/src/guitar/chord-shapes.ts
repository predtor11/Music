import type { ChordShape } from './guitar.js';

/** Open chords for standard tuning. Strings run E A D G B e (thickest first). */
export const OPEN_CHORD_SHAPES: ChordShape[] = [
  { name: 'E', frets: [0, 2, 2, 1, 0, 0], fingers: [null, 2, 3, 1, null, null], baseFret: 1 },
  { name: 'Em', frets: [0, 2, 2, 0, 0, 0], fingers: [null, 2, 3, null, null, null], baseFret: 1 },
  { name: 'A', frets: [null, 0, 2, 2, 2, 0], fingers: [null, null, 1, 2, 3, null], baseFret: 1 },
  { name: 'Am', frets: [null, 0, 2, 2, 1, 0], fingers: [null, null, 2, 3, 1, null], baseFret: 1 },
  { name: 'D', frets: [null, null, 0, 2, 3, 2], fingers: [null, null, null, 1, 3, 2], baseFret: 1 },
  { name: 'Dm', frets: [null, null, 0, 2, 3, 1], fingers: [null, null, null, 2, 3, 1], baseFret: 1 },
  { name: 'C', frets: [null, 3, 2, 0, 1, 0], fingers: [null, 3, 2, null, 1, null], baseFret: 1 },
  { name: 'G', frets: [3, 2, 0, 0, 0, 3], fingers: [2, 1, null, null, null, 3], baseFret: 1 },
];

/** Root, perfect fifth and repeated root; frets are absolute in standard tuning. */
export const POWER_CHORD_SHAPES: ChordShape[] = [
  { name: 'G5', frets: [3, 5, 5, null, null, null], fingers: [1, 3, 4, null, null, null], baseFret: 3 },
  { name: 'A5', frets: [5, 7, 7, null, null, null], fingers: [1, 3, 4, null, null, null], baseFret: 5 },
];

/** Repeated finger 1 at the same fret marks the span pressed by one finger. */
export const BARRE_CHORD_SHAPES: ChordShape[] = [
  { name: 'F', frets: [1, 3, 3, 2, 1, 1], fingers: [1, 3, 4, 2, 1, 1], baseFret: 1 },
  { name: 'Fm', frets: [1, 3, 3, 1, 1, 1], fingers: [1, 3, 4, 1, 1, 1], baseFret: 1 },
  { name: 'Bm', frets: [null, 2, 4, 4, 3, 2], fingers: [null, 1, 3, 4, 2, 1], baseFret: 2 },
];

/** Names referenced by Lesson.guitarChord; the existing open-only export is preserved. */
export const GUITAR_CHORD_SHAPES: ChordShape[] = [
  ...OPEN_CHORD_SHAPES, ...POWER_CHORD_SHAPES, ...BARRE_CHORD_SHAPES,
];
