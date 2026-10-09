/**
 * A tune played one note at a time is not a chord, even when its notes happen
 * to fit one (C D E G "fits" Cadd9). A line of single notes only counts as a
 * chord when it spells one out, as a broken chord (arpeggio) does: every
 * chord tone heard and hardly any other notes.
 */

import { chordPitchClasses, type ChordQuality } from '@music/theory';
import type { ChordSegment, NoteEvent } from './types.js';

/** Shapes a broken chord is usually made of. A tune walks through sus2 and 6th shapes by step all the time. */
const BROKEN_CHORD_SHAPES: ReadonlySet<ChordQuality> = new Set(['major', 'minor', '7', 'm7', 'maj7', 'dim', 'aug']);
/** Notes overlapping by less than this (seconds) still count as one at a time. */
const OVERLAP = 0.05;
/** Most of a broken chord's sound that may come from notes outside the chord. */
const OUTSIDE_SHARE = 0.12;

function singleLine(notes: readonly NoteEvent[], start: number, end: number): boolean {
  for (let i = 1; i < notes.length; i++) {
    for (let j = 0; j < i; j++) {
      const a = notes[j]!;
      const b = notes[i]!;
      if (Math.min(a.end, b.end, end) - Math.max(a.start, b.start, start) > OVERLAP) return false;
    }
  }
  return true;
}

/** Segments whose notes are a tune rather than a chord lose their chord; neighbouring empty segments join up. */
export function dropMelodyOnly(segments: readonly ChordSegment[], notes: readonly NoteEvent[]): ChordSegment[] {
  const sorted = [...notes].sort((a, b) => a.start - b.start);
  const out: ChordSegment[] = [];
  for (const seg of segments) {
    let next = seg;
    if (seg.chord && !seg.edited) {
      const inside = sorted.filter((n) => n.end > seg.start && n.start < seg.end);
      if (inside.length > 0 && singleLine(inside, seg.start, seg.end)) {
        const weight = new Array<number>(12).fill(0);
        for (const n of inside) weight[n.midi % 12]! += Math.min(n.end, seg.end) - Math.max(n.start, seg.start);
        const total = weight.reduce((a, b) => a + b, 0);
        const tones = chordPitchClasses(seg.chord.rootPc, seg.chord.quality);
        const share = tones.reduce((s, pc) => s + weight[pc]!, 0) / (total || 1);
        const missing = tones.some((pc) => weight[pc]! / (total || 1) < 0.03);
        if (!BROKEN_CHORD_SHAPES.has(seg.chord.quality) || missing || 1 - share > OUTSIDE_SHARE) {
          next = { ...seg, chord: null, confidence: 1, alternatives: [seg.chord, ...seg.alternatives].slice(0, 4) };
        }
      }
    }
    const prev = out[out.length - 1];
    if (prev && !prev.chord && !next.chord) prev.end = next.end;
    else out.push({ ...next });
  }
  return out;
}
