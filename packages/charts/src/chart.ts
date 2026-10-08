/** Whole-chart helpers: new charts, changing key, and share links. */

import { ChordChartSchema, type ChartSection, type ChordChart, type SectionKind } from '@music/contracts';
import { keyName, parseKey } from '@music/theory';
import { CARRY_ON, parseChordSymbol, shiftKey, transposeSymbol } from './symbol.js';
import { parseBars } from './text.js';

export function newId(prefix = 'chart'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Section kind from the name people give it: "Verse 2" → verse, "Pre-chorus" → pre-chorus. */
export function sectionKindFor(name: string): SectionKind {
  const n = name.toLowerCase();
  if (/pre[\s-]?chorus/.test(n)) return 'pre-chorus';
  if (n.includes('chorus') || n.includes('hook')) return 'chorus';
  if (n.includes('verse')) return 'verse';
  if (n.includes('bridge') || n.includes('middle')) return 'bridge';
  if (n.includes('intro')) return 'intro';
  if (n.includes('outro') || n.includes('ending') || n.includes('coda')) return 'outro';
  if (n.includes('solo')) return 'solo';
  if (n.includes('interlude') || n.includes('instrumental') || n.includes('break')) return 'interlude';
  return 'other';
}

export function newSection(name: string, text: string, repeat?: number): ChartSection {
  return { id: newId('s'), name, kind: sectionKindFor(name), bars: parseBars(text).bars, ...(repeat && repeat > 1 ? { repeat } : {}) };
}

/** A short example in G so the page has something to show and play with. */
export function exampleChart(): ChordChart {
  return {
    version: 1,
    id: newId(),
    title: 'Example: pop song in G',
    key: 'G',
    timeSignature: '4/4',
    tempo: 96,
    sections: [
      newSection('Intro', '| G | D | Em | C |'),
      newSection('Verse', '| G | D/F# | Em | C |\n| G | D/F# | C | D |', 2),
      newSection('Chorus', '| C | G | D | Em |\n| C | G | D | % |'),
      newSection('Bridge', '| Am7 | Bm7 | C . D . | Dsus4 . . D |'),
      newSection('Outro', '| G | D | C | G |'),
    ],
    source: { kind: 'manual' },
    notes: 'The verse and chorus use 1 5 6 4, the most common progression in pop.',
    updatedAt: new Date().toISOString(),
  };
}

/** Beats in a bar: "4/4" → 4, "6/8" → 6. */
export function beatsPerBar(timeSignature: string): number {
  const top = Number(timeSignature.split('/')[0]);
  return Number.isFinite(top) && top > 0 ? top : 4;
}

/** The chart in another key, every chord re-spelled for it. Keeps major or minor as written in `toKeyText`. */
export function transposeChart(chart: ChordChart, toKeyText: string): ChordChart {
  const from = parseKey(chart.key);
  const to = parseKey(toKeyText);
  if (!from || !to) return chart;
  if (keyName(from) === keyName(to)) return chart;
  return {
    ...chart,
    key: keyName(to),
    sections: chart.sections.map((s) => ({
      ...s,
      bars: s.bars.map((b) => ({ chords: b.chords.map((c) => ({ ...c, symbol: transposeSymbol(c.symbol, from, to) })) })),
    })),
  };
}

/** The chart moved by some half steps (+1 up, -1 down), keeping major or minor. */
export function transposeBy(chart: ChordChart, semitones: number): ChordChart {
  const key = parseKey(chart.key);
  return key ? transposeChart(chart, keyName(shiftKey(key, semitones))) : chart;
}

/** Every chord symbol in the chart, in order, without "%". */
export function chartSymbols(chart: ChordChart): string[] {
  return chart.sections.flatMap((s) => s.bars.flatMap((b) => b.chords.map((c) => c.symbol))).filter((s) => s !== CARRY_ON && parseChordSymbol(s) !== null);
}

// ---------------------------------------------------------------------------
// Share links: the whole chart in the URL, so nothing needs a server.

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function encodeChart(chart: ChordChart): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(chart)));
}

/** Read a chart from a share link's text. Null when it isn't a valid chart. */
export function decodeChart(text: string): ChordChart | null {
  try {
    const json: unknown = JSON.parse(new TextDecoder().decode(fromBase64Url(text)));
    const parsed = ChordChartSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
