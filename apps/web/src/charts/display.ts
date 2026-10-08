/** How one chart chord is written for the chosen view. */

import type { ChartView, ChordChart } from '@music/contracts';
import { CARRY_ON, renderChord, type RenderedChord } from '@music/charts';
import { keyLabel, pretty, type Key, type SargamName } from '@music/theory';

export interface ChordText {
  /** The big text in the bar. */
  main: string;
  /** Small text under it, or null. */
  sub: string | null;
  /** Sargam of the root (and bass), drawn Bhatkhande style. */
  sargam: SargamName[] | null;
}

/** The chord's name with its root in sargam: "Pa", "Dha m", "Pa/Ni". */
export function sargamName(chord: RenderedChord): string {
  const suffix = chord.parsed.suffix;
  const root = chord.fn.rootSargam.syllable + (suffix ? ` ${suffix}` : '');
  return chord.fn.bassSargam ? `${root}/${chord.fn.bassSargam.syllable}` : root;
}

/** `withSargam` adds the styled sargam line under chord names (the "both" note-name setting). */
export function chordText(chord: RenderedChord, view: ChartView, withSargam = false): ChordText {
  const name = pretty(chord.symbol);
  const styled = [chord.fn.rootSargam, ...(chord.fn.bassSargam ? [chord.fn.bassSargam] : [])];
  switch (view) {
    case 'names':
      return { main: name, sub: pretty(chord.nashville), sargam: withSargam ? styled : null };
    case 'nashville':
      return { main: pretty(chord.nashville), sub: name, sargam: null };
    case 'roman':
      return { main: pretty(chord.roman), sub: name, sargam: null };
    case 'sargam':
      return { main: sargamName(chord), sub: name, sargam: styled };
  }
}

/**
 * The chart as plain text, to paste into a group chat:
 *
 *   Example
 *   Key of G major, 4/4, 96 BPM
 *
 *   [Verse] x2
 *   | G | D/F# | Em | C |
 */
export function chartAsText(chart: ChordChart, key: Key, view: ChartView): string {
  const head = [chart.title, `Key of ${pretty(keyLabel(key))}, ${chart.timeSignature}${chart.tempo ? `, ${chart.tempo} BPM` : ''}`];
  const body = chart.sections.map((section) => {
    const cells = section.bars.map((bar) =>
      bar.chords
        .map((c) => {
          if (c.symbol === CARRY_ON) return CARRY_ON;
          const r = renderChord(c.symbol, key);
          return r ? chordText(r, view).main : c.symbol;
        })
        .join(' '),
    );
    const lines: string[] = [];
    for (let i = 0; i < cells.length; i += 4) lines.push(`| ${cells.slice(i, i + 4).join(' | ')} |`);
    return [`[${section.name}]${section.repeat && section.repeat > 1 ? ` x${section.repeat}` : ''}`, ...lines].join('\n');
  });
  return [...head, '', body.join('\n\n')].join('\n');
}
