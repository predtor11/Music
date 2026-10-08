/**
 * Band-talk examples as keys to light and play, one step at a time. Pure, so
 * it is unit tested.
 */

import type { BandTalkTerm } from '@music/contracts';
import { C_MAJOR, chordFromNumeral, keyLabel, parseKey, pretty, type MidiNote } from '@music/theory';
import { chordKeys } from '../lesson/kinds/progression-logic.js';

export interface ExampleStep {
  notes: MidiNote[];
  /** "G (5)", "D (1 in D)", or the content's own label. */
  label: string;
  beats: number;
}

export function exampleSteps(term: BandTalkTerm): ExampleStep[] {
  const { example } = term;
  return example.steps.flatMap((step) => {
    if ('midi' in step) return [{ notes: step.midi, label: step.label, beats: step.beats }];
    const key = parseKey(step.key ?? example.key) ?? C_MAJOR;
    const chord = chordFromNumeral(step.numeral, key);
    if (!chord) return [];
    const where = step.key && step.key !== example.key ? `${pretty(step.numeral)} in ${pretty(keyLabel(key))}` : pretty(step.numeral);
    return [{ notes: chordKeys({ numeral: step.numeral, chord, slash: step.numeral.includes('/') }), label: `${pretty(chord.symbol)} (${where})`, beats: step.beats }];
  });
}

/** Lower-case text a search can match: the phrase, other names, meaning and the quote. */
export function searchText(term: BandTalkTerm, glossaryMeaning?: string): string {
  return [term.phrase, ...term.aliases, term.meaning ?? glossaryMeaning ?? '', term.sayIt].join(' ').toLowerCase();
}

export const CATEGORY_LABELS: Readonly<Record<BandTalkTerm['category'], string>> = {
  chords: 'Chords',
  form: 'Song parts',
  key: 'Keys',
  rhythm: 'Rhythm and feel',
  playing: 'Playing',
};
