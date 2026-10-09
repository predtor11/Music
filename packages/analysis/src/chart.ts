/**
 * Laying the chords out as a band chart: bars of chord symbols, so it
 * reads the way bands write it. Shaped like ChordChart in @music/contracts:
 * absolute symbols in the key; numbers and sargam are worked out when shown.
 */

import type { ChartBar, ChartChord, ChartSection, ChordChart } from '@music/contracts';
import { keyName, type Key } from '@music/theory';
import type { BeatGrid, ChordSegment, SourceKind } from './types.js';

/** ♭ and ♯ back to b and #, the way parseKey and chordFromNumeral read them. */
export const ascii = (s: string) => s.replace(/♭/g, 'b').replace(/♯/g, '#');

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
export function buildChart(
  segments: readonly ChordSegment[],
  grid: BeatGrid,
  key: Key,
  title: string,
  opts: { id?: string; source?: SourceKind; now?: Date } = {},
): ChordChart | null {
  const { beats, beatsPerBar, firstDownbeat } = grid;
  const bars: ChartBar[] = [];
  let last: string | null = null;
  for (let b = firstDownbeat; b + 1 < beats.length; b += beatsPerBar) {
    const chords: Array<ChartChord & { beats: number }> = [];
    for (let i = b; i < b + beatsPerBar && i + 1 < beats.length; i++) {
      const mid = (beats[i]! + beats[i + 1]!) / 2;
      const chord = at(segments, mid)?.chord;
      const symbol: string | null = chord ? ascii(chord.symbol) : last;
      if (!symbol) continue;
      const tail = chords[chords.length - 1];
      if (tail && tail.symbol === symbol) tail.beats++;
      else chords.push({ symbol, beats: 1 });
      last = symbol;
    }
    if (chords.length) bars.push({ chords });
  }
  if (!bars.length) return null;

  // Sections of eight bars; a section the same as the one before becomes a repeat.
  const sections: ChartSection[] = [];
  for (let i = 0; i < bars.length; i += BARS_PER_SECTION) {
    const chunk = bars.slice(i, i + BARS_PER_SECTION);
    const prev = sections[sections.length - 1];
    if (prev && JSON.stringify(prev.bars) === JSON.stringify(chunk)) prev.repeat = Math.min(16, (prev.repeat ?? 1) + 1);
    else sections.push({ id: `part-${sections.length + 1}`, name: `Part ${sections.length + 1}`, kind: 'other', bars: chunk });
  }
  const source = opts.source ?? 'midi';
  return {
    version: 1,
    id: opts.id ?? 'analysis',
    title: title || 'Song',
    key: ascii(keyName(key)),
    timeSignature: `${Math.min(12, Math.max(1, beatsPerBar))}/4`,
    tempo: Math.min(300, Math.max(20, Math.round(grid.bpm))),
    sections,
    source: { kind: source === 'recording' ? 'recording' : 'analysis' },
    updatedAt: (opts.now ?? new Date()).toISOString(),
  };
}
