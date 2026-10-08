/**
 * Laying the chords out as a band chart: bars of numerals in the key, so it
 * transposes and reads the way bands talk ("1 for a bar, then 5").
 * Shaped like ChordChart in @music/contracts.
 */

import { keyName, type Key } from '@music/theory';
import type { BeatGrid, ChordSegment } from './types.js';

export interface ChartChord {
  numeral: string;
  beats: number;
  bass?: string;
}
export interface ChartBar {
  chords: ChartChord[];
}
export interface ChartSection {
  name: string;
  bars: ChartBar[];
  repeat: number;
}
export interface Chart {
  id: string;
  title: string;
  key: string;
  timeSignature: { beats: number; unit: 2 | 4 | 8 };
  bpm?: number;
  sections: ChartSection[];
}

/** ♭ and ♯ back to b and #, the way parseKey and chordFromNumeral read them. */
export const ascii = (s: string) => s.replace(/♭/g, 'b').replace(/♯/g, '#');

/** Split a pretty Roman numeral ("V/7") into the chart's numeral and bass degree. */
function numeralParts(roman: string): ChartChord {
  const [numeral, bass] = ascii(roman).split('/') as [string, string | undefined];
  return bass ? { numeral, beats: 0, bass } : { numeral, beats: 0 };
}

/** Which segment is sounding at time t. */
function at(segments: readonly ChordSegment[], t: number): ChordSegment | undefined {
  let lo = 0;
  let hi = segments.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const s = segments[mid]!;
    if (t < s.start) hi = mid - 1;
    else if (t >= s.end) lo = mid + 1;
    else return s;
  }
  return undefined;
}

const BARS_PER_SECTION = 8;

/** The chords as a chart, or null when there are none. */
export function buildChart(segments: readonly ChordSegment[], grid: BeatGrid, key: Key, title: string, id = 'analysis'): Chart | null {
  const { beats, beatsPerBar, firstDownbeat } = grid;
  const bars: ChartBar[] = [];
  let last: ChartChord | null = null;
  for (let b = firstDownbeat; b + 1 < beats.length; b += beatsPerBar) {
    const chords: ChartChord[] = [];
    for (let i = b; i < b + beatsPerBar && i + 1 < beats.length; i++) {
      const mid = (beats[i]! + beats[i + 1]!) / 2;
      const chord = at(segments, mid)?.chord;
      const next: ChartChord | null = chord ? numeralParts(chord.roman) : last;
      if (!next) continue;
      const tail = chords[chords.length - 1];
      if (tail && tail.numeral === next.numeral && tail.bass === next.bass) tail.beats++;
      else chords.push({ ...next, beats: 1 });
      last = { ...next, beats: 0 };
    }
    if (chords.length) bars.push({ chords });
  }
  if (!bars.length) return null;

  // Sections of eight bars; a section the same as the one before becomes a repeat.
  const sections: ChartSection[] = [];
  for (let i = 0; i < bars.length; i += BARS_PER_SECTION) {
    const chunk = bars.slice(i, i + BARS_PER_SECTION);
    const prev = sections[sections.length - 1];
    if (prev && JSON.stringify(prev.bars) === JSON.stringify(chunk)) prev.repeat = Math.min(16, prev.repeat + 1);
    else sections.push({ name: `Part ${sections.length + 1}`, bars: chunk, repeat: 1 });
  }
  return {
    id,
    title: title || 'Song',
    key: ascii(keyName(key)),
    timeSignature: { beats: Math.min(12, Math.max(1, beatsPerBar)), unit: 4 },
    bpm: Math.min(300, Math.max(20, Math.round(grid.bpm))),
    sections,
  };
}
