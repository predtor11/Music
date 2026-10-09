/**
 * The quick way to type a section: bars between bar lines, chords split by
 * spaces, the way chord charts are often written by hand.
 *
 *   | G | D/F# | Em . C . | % |
 *
 * A "." after a chord holds it for one more beat ("Em . C ." is two beats
 * each). With no dots the bar is shared evenly. "%" in place of a chord means
 * the chord before carries on. New lines are bar lines too, so each line can
 * be one row of the chart.
 */

import type { ChartBar, ChartChord } from '@music/contracts';
import { CARRY_ON, parseChordSymbol } from './symbol.js';

export interface BarsParse {
  bars: ChartBar[];
  /** What was typed that isn't a chord the app can read, in order. */
  unknown: string[];
}

export function parseBars(text: string): BarsParse {
  const unknown: string[] = [];
  const bars: ChartBar[] = [];
  const cells = text
    .split(/[|\n]/)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
  for (const cell of cells) {
    const chords: (ChartChord & { beats: number })[] = [];
    let dotted = false;
    for (const token of cell.split(/\s+/)) {
      if (/^\.+$/.test(token)) {
        const last = chords[chords.length - 1];
        if (last) last.beats += token.length;
        dotted = true;
        continue;
      }
      if (token === CARRY_ON && bars.length === 0 && chords.length === 0) {
        unknown.push(token);
        continue;
      }
      if (token !== CARRY_ON && !parseChordSymbol(token)) unknown.push(token);
      chords.push({ symbol: token, beats: 1 });
    }
    if (chords.length === 0) continue;
    // Without dots the beats aren't written, and the bar shares them out evenly.
    bars.push({ chords: chords.map((c) => (dotted ? c : { symbol: c.symbol })) });
  }
  return { bars, unknown };
}

/** Bars back to text, four to a line. */
export function formatBars(bars: readonly ChartBar[], perLine = 4): string {
  const cells = bars.map((bar) => {
    const text = bar.chords.map((c) => (c.beats && c.beats > 1 ? `${c.symbol} ${Array(Math.round(c.beats) - 1).fill('.').join(' ')}` : c.symbol)).join(' ');
    return ` ${text} `;
  });
  const lines: string[] = [];
  for (let i = 0; i < cells.length; i += perLine) lines.push(`|${cells.slice(i, i + perLine).join('|')}|`);
  return lines.join('\n');
}
