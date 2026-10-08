import { ChordChartSchema } from '@music/contracts';
import { parseKey } from '@music/theory';
import { describe, expect, it } from 'vitest';
import {
  bestCapo,
  chartSymbols,
  chordFunction,
  chordVoicing,
  decodeChart,
  encodeChart,
  exampleChart,
  formatBars,
  formatChord,
  parseBars,
  parseChordSymbol,
  transposeBy,
  renderChord,
  transposeChart,
  transposeSymbol,
} from '../src/index.js';

const key = (k: string) => parseKey(k)!;
const fn = (symbol: string, k: string) => chordFunction(parseChordSymbol(symbol)!, key(k));

describe('parseChordSymbol', () => {
  it('reads common symbols', () => {
    expect(formatChord(parseChordSymbol('G')!)).toBe('G');
    expect(parseChordSymbol('Am7')!.quality).toBe('m7');
    expect(formatChord(parseChordSymbol('D/F#')!)).toBe('D/F#');
    expect(parseChordSymbol('Bbmaj7')!.root).toEqual({ letter: 'B', accidental: -1 });
    expect(parseChordSymbol('C#m7b5')!.quality).toBe('m7b5');
  });

  it('accepts other spellings of the same chord', () => {
    expect(formatChord(parseChordSymbol('Cmin7')!)).toBe('Cm7');
    expect(formatChord(parseChordSymbol('C-')!)).toBe('Cm');
    expect(formatChord(parseChordSymbol('CΔ7')!)).toBe('Cmaj7');
    expect(formatChord(parseChordSymbol('Gsus')!)).toBe('Gsus4');
    expect(formatChord(parseChordSymbol('C/C')!)).toBe('C');
  });

  it('keeps unknown suffixes as written', () => {
    const p = parseChordSymbol('E5')!;
    expect(p.quality).toBeNull();
    expect(formatChord(p)).toBe('E5');
  });

  it('rejects things that are not chords', () => {
    expect(parseChordSymbol('%')).toBeNull();
    expect(parseChordSymbol('N.C.')).toBeNull();
    expect(parseChordSymbol('hello')).toBeNull();
    expect(parseChordSymbol('H7')).toBeNull();
  });
});

describe('transpose', () => {
  it('moves chords keeping their place in the key', () => {
    expect(['G', 'D/F#', 'Em', 'C'].map((c) => transposeSymbol(c, key('G'), key('A')))).toEqual(['A', 'E/G#', 'F#m', 'D']);
    expect(['C', 'G', 'Am', 'F'].map((c) => transposeSymbol(c, key('C'), key('Eb')))).toEqual(['Eb', 'Bb', 'Cm', 'Ab']);
    expect(transposeSymbol('Bb', key('C'), key('D'))).toBe('C');
    expect(transposeSymbol('%', key('C'), key('D'))).toBe('%');
  });

  it('transposes a whole chart and back', () => {
    const chart = exampleChart();
    const up = transposeBy(chart, 2);
    expect(up.key).toBe('A');
    expect(chartSymbols(up).slice(0, 4)).toEqual(['A', 'E', 'F#m', 'D']);
    expect(transposeBy(up, -2).sections).toEqual(chart.sections);
    expect(transposeChart(chart, 'Eb').key).toBe('Eb');
    expect(transposeBy(chart, -6).key).toBe('Db');
  });

  it('renders a chord in a key', () => {
    expect(renderChord('D/F#', key('G'))).toMatchObject({ roman: 'V/7', nashville: '5/7', notes: ['D', 'F#', 'A'] });
    expect(renderChord('%', key('G'))).toBeNull();
  });
});

describe('chordFunction', () => {
  it('gives numbers in the key', () => {
    expect(fn('D', 'G')).toMatchObject({ roman: 'V', nashville: '5', inKey: true });
    expect(fn('Em', 'G')).toMatchObject({ roman: 'vi', nashville: '6m' });
    expect(fn('D/F#', 'G')).toMatchObject({ roman: 'V/7', nashville: '5/7' });
    expect(fn('F', 'G')).toMatchObject({ roman: 'bVII', inKey: false });
    expect(fn('E5', 'E').nashville).toBe('15');
  });

  it('gives sargam with Sa on the key', () => {
    expect(fn('D', 'G').rootSargam.syllable).toBe('Pa');
    expect(fn('C', 'G').rootSargam.syllable).toBe('Ma');
    expect(fn('F', 'G').rootSargam.label).toBe('komal Ni');
  });
});

describe('chordVoicing', () => {
  it('puts the bass under the chord', () => {
    expect(chordVoicing(parseChordSymbol('C')!)).toEqual([48, 60, 64, 67]);
    const dOverFs = chordVoicing(parseChordSymbol('D/F#')!);
    expect(dOverFs[0]! % 12).toBe(6);
    expect(dOverFs[0]).toBeLessThan(dOverFs[1]!);
  });
});

describe('parseBars and formatBars', () => {
  it('reads bars, dots and carry-ons', () => {
    const { bars, unknown } = parseBars('| G | D/F# | Em . C . | % |');
    expect(bars).toHaveLength(4);
    expect(bars[2]!.chords).toEqual([
      { symbol: 'Em', beats: 2 },
      { symbol: 'C', beats: 2 },
    ]);
    expect(bars[0]!.chords).toEqual([{ symbol: 'G' }]);
    expect(bars[3]!.chords).toEqual([{ symbol: '%' }]);
    expect(unknown).toEqual([]);
  });

  it('reports what it cannot read', () => {
    const { bars, unknown } = parseBars('% | G D\nEm Xyz');
    expect(bars).toHaveLength(2);
    expect(unknown).toEqual(['%', 'Xyz']);
  });

  it('round-trips through text', () => {
    const text = '| G | D/F# | Em C | % |\n| C . . D |';
    const once = parseBars(text).bars;
    expect(formatBars(once)).toBe(text);
  });
});

describe('capo hints', () => {
  it('suggests D shapes with a capo on 1 for Eb', () => {
    const best = bestCapo(['Eb', 'Bb', 'Cm', 'Ab'], 'Eb');
    expect(best?.fret).toBe(1);
    expect(best?.shapes.map((s) => s.play)).toEqual(['D', 'A', 'Bm', 'G']);
  });

  it('suggests nothing when the chords are already open shapes', () => {
    expect(bestCapo(['G', 'D', 'Em', 'C'], 'G')).toBeNull();
  });
});

describe('share links', () => {
  it('round-trips a chart, including non-ASCII text', () => {
    const chart = { ...exampleChart(), title: 'Tum Hi Ho ♪ सा रे गा' };
    expect(decodeChart(encodeChart(chart))).toEqual(chart);
  });

  it('rejects bad links', () => {
    expect(decodeChart('not-a-chart')).toBeNull();
    expect(decodeChart(encodeChart({ hello: 1 } as never))).toBeNull();
  });

  it('example chart is valid and lists its chords', () => {
    const chart = exampleChart();
    expect(ChordChartSchema.safeParse(chart).success).toBe(true);
    expect(chartSymbols(chart)).toContain('D/F#');
  });
});
