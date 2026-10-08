/**
 * Where note events come from. The app only talks to `MidiSource`, so the
 * browser's Web MIDI can later be swapped for native MIDI in a desktop build,
 * or for the on-screen keyboard and computer keys, without touching lessons.
 */

import { parseMidiMessage, type MidiEvent } from './parse.js';

export interface MidiInputInfo {
  id: string;
  name: string;
  manufacturer: string;
  connected: boolean;
}

export type MidiStatus = 'unsupported' | 'idle' | 'requesting' | 'denied' | 'ready';

export interface MidiSource {
  readonly status: MidiStatus;
  start(): Promise<void>;
  inputs(): MidiInputInfo[];
  /** Listen to one input by id, or to all inputs when null. */
  select(inputId: string | null): void;
  onEvent(listener: (event: MidiEvent, inputId: string) => void): () => void;
  onChange(listener: () => void): () => void;
}

/** Minimal shape of the Web MIDI API, so this file needs no DOM MIDI typings. */
interface WebMidiPort {
  id: string;
  name?: string | null;
  manufacturer?: string | null;
  state: string;
  onmidimessage: ((e: { data: Uint8Array }) => void) | null;
}
interface WebMidiAccess {
  inputs: { forEach(cb: (port: WebMidiPort) => void): void };
  onstatechange: (() => void) | null;
}
type RequestMidi = (opts?: { sysex?: boolean }) => Promise<WebMidiAccess>;

export class WebMidiSource implements MidiSource {
  status: MidiStatus;
  private access: WebMidiAccess | null = null;
  private selected: string | null = null;
  private readonly eventListeners = new Set<(event: MidiEvent, inputId: string) => void>();
  private readonly changeListeners = new Set<() => void>();

  constructor(private readonly nav: { requestMIDIAccess?: RequestMidi } = globalThis.navigator as never) {
    this.status = typeof nav?.requestMIDIAccess === 'function' ? 'idle' : 'unsupported';
  }

  async start(): Promise<void> {
    if (this.status === 'unsupported' || this.status === 'ready') return;
    this.setStatus('requesting');
    try {
      this.access = await this.nav.requestMIDIAccess!({ sysex: false });
    } catch {
      this.setStatus('denied');
      return;
    }
    this.access.onstatechange = () => {
      this.wire();
      this.emitChange();
    };
    this.wire();
    this.setStatus('ready');
  }

  inputs(): MidiInputInfo[] {
    const list: MidiInputInfo[] = [];
    this.access?.inputs.forEach((p) =>
      list.push({ id: p.id, name: p.name ?? 'MIDI input', manufacturer: p.manufacturer ?? '', connected: p.state === 'connected' }),
    );
    return list;
  }

  select(inputId: string | null): void {
    this.selected = inputId;
    this.wire();
    this.emitChange();
  }

  onEvent(listener: (event: MidiEvent, inputId: string) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  onChange(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  private wire(): void {
    this.access?.inputs.forEach((port) => {
      const listening = this.selected === null || this.selected === port.id;
      port.onmidimessage = listening
        ? (e) => {
            const event = parseMidiMessage(e.data);
            if (event) this.eventListeners.forEach((l) => l(event, port.id));
          }
        : null;
    });
  }

  private setStatus(status: MidiStatus): void {
    this.status = status;
    this.emitChange();
  }

  private emitChange(): void {
    this.changeListeners.forEach((l) => l());
  }
}
