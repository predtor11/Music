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
