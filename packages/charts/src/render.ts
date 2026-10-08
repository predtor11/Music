/** A chart chord worked out in the chart's key: what to show, and what to play. */

import { noteToString, spellChord, type Key } from '@music/theory';
import { chordFunction, chordVoicing, parseChordSymbol, type ChordFunction, type ParsedChord } from './symbol.js';

export interface RenderedChord {
  /** As stored: "D/F#". */
  symbol: string;
  /** "V/7" */
  roman: string;
  /** "5/7" */
  nashville: string;
  /** Chord tones from the root: ["D", "F#", "A"]. */
  notes: string[];
  /** A voicing around middle C, bass first. Empty when the chord type is unknown. */
  midi: number[];
  parsed: ParsedChord;
  fn: ChordFunction;
}

/** Null for "%" and text that isn't a chord symbol. */
export function renderChord(symbol: string, key: Key): RenderedChord | null {
  const parsed = parseChordSymbol(symbol);
  if (!parsed) return null;
  const fn = chordFunction(parsed, key);
  return {
    symbol,
    roman: fn.roman,
    nashville: fn.nashville,
    notes: parsed.quality ? spellChord(parsed.root, parsed.quality).map(noteToString) : [noteToString(parsed.root)],
    midi: chordVoicing(parsed),
    parsed,
    fn,
  };
}
