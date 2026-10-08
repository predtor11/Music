/**
 * One place for every way of playing: the MIDI keyboard, computer keys and
 * clicks on the virtual keyboard. Screens read the held keys from here and
 * subscribe to note-ons, so lessons and the Chord Namer share one connection.
 */

import type { UserSettings } from '@music/contracts';
import type { MidiNote } from '@music/theory';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useComputerKeys } from '../keyboard/useComputerKeys.js';
import { useMidi, type MidiState } from '../midi/useMidi.js';

export interface NoteInput {
  midi: MidiState;
  /** Every key down right now, from any source, low to high. */
  held: MidiNote[];
  heldSet: ReadonlySet<MidiNote>;
  /** Notes the sustain pedal keeps ringing. */
  sustained: ReadonlySet<MidiNote>;
  /** Keys clicked on screen; they stay down until clicked again. */
  clicked: ReadonlySet<MidiNote>;
  toggle: (note: MidiNote) => void;
  clear: () => void;
  computerBase: MidiNote;
  /** Called on every new key press from any source. Returns an unsubscribe. */
  onNoteOn: (listener: (note: MidiNote) => void) => () => void;
}

const Ctx = createContext<NoteInput | null>(null);

export function NoteInputProvider({ settings, update, children }: { settings: UserSettings; update: (patch: Partial<UserSettings>) => void; children: ReactNode }) {
  const listeners = useRef(new Set<(note: MidiNote) => void>());
  const emit = useCallback((note: MidiNote) => listeners.current.forEach((l) => l(note)), []);
  const onSelectInput = useCallback((id: string | null) => update({ midiInputId: id }), [update]);
  const midi = useMidi(settings.midiInputId, onSelectInput, emit);
  const computer = useComputerKeys(emit);
  const [clicked, setClicked] = useState<ReadonlySet<MidiNote>>(new Set());

  const clickedRef = useRef(clicked);
  clickedRef.current = clicked;
  const toggle = useCallback(
    (note: MidiNote) => {
      const next = new Set(clickedRef.current);
      if (next.has(note)) next.delete(note);
      else {
        next.add(note);
        emit(note);
      }
      clickedRef.current = next;
      setClicked(next);
    },
    [emit],
  );
  const clear = useCallback(() => {
    clickedRef.current = new Set();
    setClicked(clickedRef.current);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clear();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clear]);

  const onNoteOn = useCallback((l: (note: MidiNote) => void) => {
    listeners.current.add(l);
    return () => {
      listeners.current.delete(l);
    };
  }, []);

  const held = useMemo(() => [...new Set([...midi.held, ...computer.held, ...clicked])].sort((a, b) => a - b), [midi.held, computer.held, clicked]);
  const value = useMemo<NoteInput>(
    () => ({
      midi,
      held,
      heldSet: new Set(held),
      sustained: new Set(midi.sounding),
      clicked,
      toggle,
      clear,
      computerBase: computer.base,
      onNoteOn,
    }),
    [midi, held, clicked, toggle, clear, computer.base, onNoteOn],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNoteInput(): NoteInput {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useNoteInput must be used inside <NoteInputProvider>');
  return ctx;
}

/** Subscribe to key presses for as long as the component is mounted. */
export function useNoteOn(listener: (note: MidiNote) => void): void {
  const { onNoteOn } = useNoteInput();
  const ref = useRef(listener);
  ref.current = listener;
  useEffect(() => onNoteOn((n) => ref.current(n)), [onNoteOn]);
}
