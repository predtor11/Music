/**
 * One place for every way of playing: the MIDI keyboard, computer keys and
 * clicks on the virtual keyboard. Screens read the held keys from here and
 * subscribe to note-ons, so lessons and the Chord Namer share one connection.
 */

import type { UserSettings } from '@music/contracts';
import type { MidiEvent } from '@music/midi';
import type { MidiNote } from '@music/theory';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useComputerKeys } from '../keyboard/useComputerKeys.js';
import { useMidi, type MidiState } from '../midi/useMidi.js';

/** Where a key press came from. A MIDI keyboard makes its own sound; the others don't. */
export type NoteSource = 'midi' | 'computer' | 'click';

/** Velocity given to computer keys and clicks, which have no touch sensitivity. */
export const DEFAULT_VELOCITY = 90;

/** A key going down or up, or the sustain pedal, from any source: what the recorder listens to. */
export type PlayEvent =
  | { type: 'on'; note: MidiNote; velocity: number; source: NoteSource }
  | { type: 'off'; note: MidiNote; source: NoteSource }
  | { type: 'pedal'; down: boolean };

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
  onNoteOn: (listener: (note: MidiNote, source: NoteSource) => void) => () => void;
  /** Called on every key down, key up and pedal change, with performance.now() at the moment it happened. */
  onPlayEvent: (listener: (event: PlayEvent, at: number) => void) => () => void;
}

const Ctx = createContext<NoteInput | null>(null);

export function NoteInputProvider({ settings, update, children }: { settings: UserSettings; update: (patch: Partial<UserSettings>) => void; children: ReactNode }) {
  const listeners = useRef(new Set<(note: MidiNote, source: NoteSource) => void>());
  const playListeners = useRef(new Set<(event: PlayEvent, at: number) => void>());
  const emitPlay = useCallback((event: PlayEvent) => {
    const at = performance.now();
    playListeners.current.forEach((l) => l(event, at));
  }, []);
  const emit = useCallback(
    (note: MidiNote, source: NoteSource) => {
      listeners.current.forEach((l) => l(note, source));
      if (source !== 'midi') emitPlay({ type: 'on', note, velocity: DEFAULT_VELOCITY, source });
    },
    [emitPlay],
  );
  const onSelectInput = useCallback((id: string | null) => update({ midiInputId: id }), [update]);
  const onMidiEvent = useCallback(
    (e: MidiEvent) => {
      if (e.type === 'noteOn') emitPlay({ type: 'on', note: e.note, velocity: e.velocity, source: 'midi' });
      else if (e.type === 'noteOff') emitPlay({ type: 'off', note: e.note, source: 'midi' });
      else if (e.type === 'sustain') emitPlay({ type: 'pedal', down: e.down });
    },
    [emitPlay],
  );
  const midi = useMidi(settings.midiInputId, onSelectInput, useCallback((n: MidiNote) => emit(n, 'midi'), [emit]), onMidiEvent);
  const computer = useComputerKeys(
    useCallback((n: MidiNote) => emit(n, 'computer'), [emit]),
    useCallback((n: MidiNote) => emitPlay({ type: 'off', note: n, source: 'computer' }), [emitPlay]),
  );
  const [clicked, setClicked] = useState<ReadonlySet<MidiNote>>(new Set());

  const clickedRef = useRef(clicked);
  clickedRef.current = clicked;
  const toggle = useCallback(
    (note: MidiNote) => {
      const next = new Set(clickedRef.current);
      if (next.has(note)) {
        next.delete(note);
        emitPlay({ type: 'off', note, source: 'click' });
      } else {
        next.add(note);
        emit(note, 'click');
      }
      clickedRef.current = next;
      setClicked(next);
    },
    [emit, emitPlay],
  );
  const clear = useCallback(() => {
    for (const note of clickedRef.current) emitPlay({ type: 'off', note, source: 'click' });
    clickedRef.current = new Set();
    setClicked(clickedRef.current);
  }, [emitPlay]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clear();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clear]);

  const onNoteOn = useCallback((l: (note: MidiNote, source: NoteSource) => void) => {
    listeners.current.add(l);
    return () => {
      listeners.current.delete(l);
    };
  }, []);

  const onPlayEvent = useCallback((l: (event: PlayEvent, at: number) => void) => {
    playListeners.current.add(l);
    return () => {
      playListeners.current.delete(l);
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
      onPlayEvent,
    }),
    [midi, held, clicked, toggle, clear, computer.base, onNoteOn, onPlayEvent],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNoteInput(): NoteInput {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useNoteInput must be used inside <NoteInputProvider>');
  return ctx;
}

/** Subscribe to key presses for as long as the component is mounted. */
export function useNoteOn(listener: (note: MidiNote, source: NoteSource) => void): void {
  const { onNoteOn } = useNoteInput();
  const ref = useRef(listener);
  ref.current = listener;
  useEffect(() => onNoteOn((n, source) => ref.current(n, source)), [onNoteOn]);
}
