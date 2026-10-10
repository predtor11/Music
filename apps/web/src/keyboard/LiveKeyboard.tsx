import { useInstrument } from '../instruments/context.js';
import { instrumentEntry } from '../instruments/registry.js';
import type { InstrumentVisualProps } from '../instruments/types.js';

/**
 * The virtual keyboard wired to every input: it mirrors the MIDI keyboard
 * live, takes clicks, and shows computer-key hints. Screens add marks,
 * names and captions on top.
 */
export function LiveKeyboard(props: InstrumentVisualProps) {
  const { id } = useInstrument();
  const Visual = instrumentEntry(id).Visual;
  return <Visual {...props} />;
}
