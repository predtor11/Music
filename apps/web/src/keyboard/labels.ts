import type { NoteNaming } from '@music/contracts';
import { keyTonicPc, noteToString, pitchClass, pretty, sargam, spellInKey, type Key, type MidiNote } from '@music/theory';

/** Key-top label in the chosen naming: B♭ in F, or komal Ni's syllable "Ni" in sargam. */
export function noteLabeller(key: Key, naming: NoteNaming): (note: MidiNote) => string {
  return (note) => {
    const pc = pitchClass(note);
    if (naming === 'sargam') return sargam(pc, keyTonicPc(key)).syllable;
    return pretty(noteToString(spellInKey(pc, key)));
  };
}
