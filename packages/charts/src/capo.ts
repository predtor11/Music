/**
 * Capo hints for the guitarist in the band. A capo clamps every string at one
 * fret, so the guitarist plays easy "open" chord shapes while the band hears
 * the real key: in Eb with a capo on fret 1, D shapes sound as Eb.
 */

import { parseKey, type Key } from '@music/theory';
import { formatChord, parseChordSymbol, shiftKey, transposeChord } from './symbol.js';

/** Shapes beginners play without a barre. */
const OPEN_SHAPES = new Set([
  'C', 'D', 'E', 'G', 'A', 'Am', 'Em', 'Dm',
  'C7', 'D7', 'E7', 'G7', 'A7', 'B7', 'Am7', 'Em7', 'Dm7',
  'Cmaj7', 'Dmaj7', 'Fmaj7', 'Gmaj7', 'Amaj7',
  'Dsus2', 'Dsus4', 'Asus2', 'Asus4', 'Esus4', 'Cadd9', 'Gadd9', 'A7sus4', 'D7sus4', 'E7sus4', 'Em9', 'A6', 'D6',
]);

/** Barre shapes guitarists meet first: still fine, just harder. */
const COMMON_BARRE = new Set(['F', 'Bm', 'Bm7', 'F#m', 'Bb', 'Fm', 'Cm', 'Gm', 'B', 'F7', 'Bb7']);

export interface CapoHint {
  /** Fret for the capo; 0 means no capo. */
  fret: number;
  /** Key of the shapes the guitarist plays. */
  shapesKey: Key;
  /** Symbols as the guitarist plays them (same order as the input, repeats removed). */
  shapes: { sounds: string; play: string }[];
  /** Chords that need a barre or a hard shape. */
  hard: number;
}

function cost(symbol: string): number {
  if (OPEN_SHAPES.has(symbol)) return 0;
  if (COMMON_BARRE.has(symbol)) return 1;
  return 2;
}

/**
 * Capo positions from 0 to 7, easiest first. Slash chords count by their
 * upper chord, since the bass note is usually one finger away.
 */
export function capoHints(symbols: readonly string[], keyText: string): CapoHint[] {
  const key = parseKey(keyText);
  if (!key) return [];
  const chords = [...new Set(symbols)].map((s) => parseChordSymbol(s)).filter((c) => c !== null);
  const hints: (CapoHint & { score: number })[] = [];
  for (let fret = 0; fret <= 7; fret++) {
    const shapesKey = shiftKey(key, -fret);
    let score = 0;
    let hard = 0;
    const shapes = chords.map((c) => {
      const moved = transposeChord(c, key, shapesKey);
      const c2 = cost(formatChord({ ...moved, bass: null }));
      score += c2;
      if (c2 > 0) hard++;
      return { sounds: formatChord(c), play: formatChord(moved) };
    });
    // A capo is a small extra step, so it has to save something to win.
    hints.push({ fret, shapesKey, shapes, hard, score: score + (fret > 0 ? 0.5 : 0) });
  }
  return hints.sort((a, b) => a.score - b.score || a.fret - b.fret).map(({ score: _score, ...h }) => h);
}

/** The capo position worth suggesting, or null when playing without a capo is already as easy. */
export function bestCapo(symbols: readonly string[], keyText: string): CapoHint | null {
  const best = capoHints(symbols, keyText)[0];
  return best && best.fret > 0 ? best : null;
}
