import { PianoKeyboard } from '../keyboard/PianoKeyboard.js';
import { useNoteInput } from '../input/NoteInput.js';
import type { InstrumentVisualProps } from './types.js';

export function PianoVisual({ size, clickable = true, ...rest }: InstrumentVisualProps) {
  const input = useNoteInput();
  return <PianoKeyboard size={size} active={input.heldSet} sustained={input.sustained}
    onToggle={clickable ? input.toggle : undefined} computerBase={input.computerBase} {...rest} />;
}
