import type { KeyboardSize } from './layout.js';
import { PianoKeyboard, type PianoKeyboardProps } from './PianoKeyboard.js';
import { useNoteInput } from '../input/NoteInput.js';

/**
 * The virtual keyboard wired to every input: it mirrors the MIDI keyboard
 * live, takes clicks, and shows computer-key hints. Screens add marks,
 * names and captions on top.
 */
export function LiveKeyboard({
  size,
  clickable = true,
  ...rest
}: Omit<PianoKeyboardProps, 'active' | 'sustained' | 'onToggle' | 'computerBase' | 'size'> & { size: KeyboardSize; clickable?: boolean }) {
  const input = useNoteInput();
  return (
    <PianoKeyboard
      size={size}
      active={input.heldSet}
      sustained={input.sustained}
      onToggle={clickable ? input.toggle : undefined}
      computerBase={input.computerBase}
      {...rest}
    />
  );
}
