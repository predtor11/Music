/**
 * Indian sargam names (Sa Re Ga Ma Pa Dha Ni). Sa is movable: it follows the
 * tonic of the key you're in, the way a singer would sing it.
 *
 * Komal (flattened) Re, Ga, Dha and Ni and tivra (raised) Ma are marked with a
 * variant so the app can draw them in Bhatkhande style: komal underlined,
 * tivra with a line above.
 */

import { mod12, type PitchClass } from './notes.js';

export type SargamVariant = 'shuddha' | 'komal' | 'tivra';

export interface SargamName {
  syllable: 'Sa' | 'Re' | 'Ga' | 'Ma' | 'Pa' | 'Dha' | 'Ni';
  variant: SargamVariant;
  /** Readable label, for example "komal Re" or "Pa". */
  label: string;
}

const TABLE: ReadonlyArray<[SargamName['syllable'], SargamVariant]> = [
  ['Sa', 'shuddha'],
  ['Re', 'komal'],
  ['Re', 'shuddha'],
  ['Ga', 'komal'],
  ['Ga', 'shuddha'],
  ['Ma', 'shuddha'],
  ['Ma', 'tivra'],
  ['Pa', 'shuddha'],
  ['Dha', 'komal'],
  ['Dha', 'shuddha'],
  ['Ni', 'komal'],
  ['Ni', 'shuddha'],
];

/** Sargam name of a pitch class with Sa on the given tonic. */
export function sargam(pc: PitchClass, saPc: PitchClass): SargamName {
  const [syllable, variant] = TABLE[mod12(pc - saPc)]!;
  return { syllable, variant, label: variant === 'shuddha' ? syllable : `${variant} ${syllable}` };
}
