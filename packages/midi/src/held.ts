/**
 * Tracks which keys are down. Keys you hold and notes the sustain pedal keeps
 * ringing are kept apart: lessons and the Chord Namer read the keys you hold,
 * so lifting your hands clears the answer even with the pedal down.
 */

import type { MidiEvent } from './parse.js';

export class HeldNotes {
  private readonly held = new Map<number, number>();
  private readonly sustained = new Set<number>();
  private pedalDown = false;

  /** Applies an event. Returns true when the held or sounding notes changed. */
  apply(event: MidiEvent): boolean {
    switch (event.type) {
      case 'noteOn':
        this.held.set(event.note, event.velocity);
        this.sustained.delete(event.note);
        return true;
      case 'noteOff':
        if (!this.held.delete(event.note)) return false;
        if (this.pedalDown) this.sustained.add(event.note);
        return true;
      case 'sustain':
        this.pedalDown = event.down;
        if (!event.down && this.sustained.size > 0) {
          this.sustained.clear();
          return true;
        }
        return false;
      default:
        return false;
    }
  }

  /** Keys physically held down, low to high. */
  keys(): number[] {
    return [...this.held.keys()].sort((a, b) => a - b);
  }

  /** Everything still sounding: held keys plus notes kept by the pedal. */
  sounding(): number[] {
    return [...new Set([...this.held.keys(), ...this.sustained])].sort((a, b) => a - b);
  }

  velocity(note: number): number | undefined {
    return this.held.get(note);
  }

  get pedal(): boolean {
    return this.pedalDown;
  }

  clear(): void {
    this.held.clear();
    this.sustained.clear();
    this.pedalDown = false;
  }
}
