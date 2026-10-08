/**
 * Turning notes into frames: one frame per beat, holding how long and how
 * loud each pitch class sounds in it.
 */

import type { BeatGrid, Frame, NoteEvent } from './types.js';

/** Notes at or below this (G3) also count toward the bass. */
const BASS_CEILING = 55;

/** One frame per beat of the grid, covering the notes. */
export function framesFromNotes(notes: readonly NoteEvent[], grid: BeatGrid): Frame[] {
  const { beats } = grid;
  const frames: Frame[] = [];
  const sorted = [...notes].sort((a, b) => a.start - b.start);
  let first = 0;
  for (let i = 0; i + 1 < beats.length; i++) {
    const start = beats[i]!;
    const end = beats[i + 1]!;
    const len = end - start;
    const chroma = new Array<number>(12).fill(0);
    const bass = new Array<number>(12).fill(0);
    let lowest: NoteEvent | null = null;
    let lowestOverlap = 0;
    while (first < sorted.length && sorted[first]!.end <= start - 8) first++;
    for (let j = first; j < sorted.length; j++) {
      const n = sorted[j]!;
      if (n.start >= end) break;
      const overlap = Math.min(n.end, end) - Math.max(n.start, start);
      if (overlap <= 0) continue;
      const share = overlap / len;
      // Long notes matter more; a note struck in this beat a little more again.
      const struck = n.start >= start ? 1.25 : 1;
      const w = share * (0.4 + 0.6 * n.velocity) * struck;
      chroma[n.midi % 12]! += w;
      if (n.midi <= BASS_CEILING) bass[n.midi % 12]! += w;
      if (share >= 0.2 && (!lowest || n.midi < lowest.midi)) {
        lowest = n;
        lowestOverlap = share;
      }
    }
    if (lowest) bass[lowest.midi % 12]! += 1 + lowestOverlap;
    const energy = chroma.reduce((a, b) => a + b, 0);
    frames.push({ start, end, chroma, bass, energy });
  }
  return frames;
}
