import { describe, expect, it } from 'vitest';
import { BARRE_CHORD_SHAPES, OPEN_CHORD_SHAPES, POWER_CHORD_SHAPES, SEVENTH_CHORD_SHAPES } from '@music/theory';
import { barreSpans } from '../src/guitar/barres.js';

describe('barre diagram spans', () => {
  it('keeps open and power shapes as individual pressed positions', () => {
    for (const shape of [...OPEN_CHORD_SHAPES, ...POWER_CHORD_SHAPES]) expect(barreSpans(shape)).toEqual([]);
  });

  it('draws only the three-string partial barre in Bm7b5', () => {
    for (const shape of SEVENTH_CHORD_SHAPES) {
      expect(barreSpans(shape)).toEqual(shape.name === 'Bm7b5' ? [{ fret: 2, fromString: 5, toString: 3 }] : []);
    }
  });

  it('connects the F family across six strings and excludes string 6 from Bm', () => {
    for (const name of ['F', 'Fm']) {
      expect(barreSpans(BARRE_CHORD_SHAPES.find((s) => s.name === name)!)).toEqual([{ fret: 1, fromString: 6, toString: 1 }]);
    }
    expect(barreSpans(BARRE_CHORD_SHAPES.find((s) => s.name === 'Bm')!)).toEqual([{ fret: 2, fromString: 5, toString: 1 }]);
  });
});
