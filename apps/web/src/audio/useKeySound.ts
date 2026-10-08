import { useEffect } from 'react';
import { useNoteInput } from '../input/NoteInput.js';
import { playKey, preloadPiano } from './sound.js';

/**
 * Keys clicked on screen or played on the computer keyboard sound on the
 * piano. A MIDI keyboard makes its own sound, so its notes stay silent here.
 * Also starts loading the piano on the first click or key press.
 */
export function useKeySound(): void {
  const { onNoteOn } = useNoteInput();
  useEffect(() => onNoteOn((note, source) => void (source !== 'midi' && playKey(note))), [onNoteOn]);
  useEffect(() => {
    const warm = () => preloadPiano();
    window.addEventListener('pointerdown', warm, { once: true });
    window.addEventListener('keydown', warm, { once: true });
    return () => {
      window.removeEventListener('pointerdown', warm);
      window.removeEventListener('keydown', warm);
    };
  }, []);
}
