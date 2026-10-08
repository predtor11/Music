import type { MidiNote } from '@music/theory';
import { useEffect, useRef, useState } from 'react';
import { computerKeyToNote, DEFAULT_COMPUTER_BASE } from './layout.js';

/** True when typing should go to a form control instead of the piano. */
function typingInField(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

/** Computer keys as a piano: A W S E D F T G Y H U J K, with Z and X to change octave. */
export function useComputerKeys(onNoteOn?: (note: MidiNote) => void) {
  const noteOnRef = useRef(onNoteOn);
  noteOnRef.current = onNoteOn;
  const [base, setBase] = useState<MidiNote>(DEFAULT_COMPUTER_BASE);
  const [down, setDown] = useState<ReadonlyMap<string, MidiNote>>(new Map());

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || typingInField(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === 'z') return setBase((b) => Math.max(24, b - 12));
      if (k === 'x') return setBase((b) => Math.min(96, b + 12));
      const note = computerKeyToNote(k, base);
      if (note === null) return;
      noteOnRef.current?.(note);
      setDown((prev) => new Map(prev).set(k, note));
    };
    const onUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      setDown((prev) => {
        if (!prev.has(k)) return prev;
        const next = new Map(prev);
        next.delete(k);
        return next;
      });
    };
    const release = () => setDown(new Map());
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', release);
    };
  }, [base]);

  return { base, held: [...down.values()] };
}
