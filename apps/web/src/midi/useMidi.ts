/**
 * React glue over @music/midi: connects through WebMidiSource, tracks the
 * keys held on the MIDI keyboard, and remembers which input was picked.
 */

import { HeldNotes, WebMidiSource, type MidiInputInfo, type MidiStatus } from '@music/midi';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type Browser = 'firefox' | 'safari' | 'other';

export function detectBrowser(ua: string = globalThis.navigator?.userAgent ?? ''): Browser {
  if (/firefox/i.test(ua)) return 'firefox';
  if (/safari/i.test(ua) && !/chrome|chromium|crios|edg/i.test(ua)) return 'safari';
  return 'other';
}

export interface MidiState {
  status: MidiStatus;
  inputs: MidiInputInfo[];
  /** The picked input id, or null for "all keyboards". */
  selected: string | null;
  /** Keys held on the MIDI keyboard, low to high. */
  held: number[];
  /** Held keys plus notes the sustain pedal keeps ringing. */
  sounding: number[];
  pedal: boolean;
  browser: Browser;
  connect: () => void;
  select: (id: string | null) => void;
}

export function useMidi(initialInput: string | null, onSelect: (id: string | null) => void, onNoteOn?: (note: number) => void): MidiState {
  const noteOnRef = useRef(onNoteOn);
  noteOnRef.current = onNoteOn;
  const source = useMemo(() => new WebMidiSource(), []);
  const heldNotes = useRef(new HeldNotes());
  const [status, setStatus] = useState<MidiStatus>(source.status);
  const [inputs, setInputs] = useState<MidiInputInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(initialInput);
  const [notes, setNotes] = useState({ held: [] as number[], sounding: [] as number[], pedal: false });

  useEffect(() => {
    const offChange = source.onChange(() => {
      setStatus(source.status);
      setInputs(source.inputs());
    });
    const offEvent = source.onEvent((event) => {
      if (event.type === 'noteOn') noteOnRef.current?.(event.note);
      if (heldNotes.current.apply(event) || event.type === 'sustain') {
        const h = heldNotes.current;
        setNotes({ held: h.keys(), sounding: h.sounding(), pedal: h.pedal });
      }
    });
    return () => {
      offChange();
      offEvent();
    };
  }, [source]);

  const connect = useCallback(() => {
    void source.start().then(() => {
      // Listen only to the remembered keyboard if it is still there.
      const known = source.inputs().some((i) => i.id === selected);
      source.select(known ? selected : null);
      if (!known) setSelected(null);
    });
  }, [source, selected]);

  // Reconnect on load when the browser already allowed MIDI, so returning
  // visitors don't have to press Connect. First-timers press it once.
  useEffect(() => {
    if (source.status !== 'idle') return;
    navigator.permissions
      ?.query({ name: 'midi' as PermissionName })
      .then((p) => {
        if (p.state === 'granted') connect();
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const select = useCallback(
    (id: string | null) => {
      setSelected(id);
      source.select(id);
      heldNotes.current.clear();
      setNotes({ held: [], sounding: [], pedal: false });
      onSelect(id);
    },
    [source, onSelect],
  );

  return { status, inputs, selected, ...notes, browser: detectBrowser(), connect, select };
}
