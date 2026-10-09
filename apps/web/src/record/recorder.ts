/**
 * Turns live key presses into a take: each note's start, how long its key
 * was held, its velocity, and the sustain pedal. Callers pass their own clock
 * (performance.now() in the browser), so tests can drive it with fake times.
 */

import type { PedalChange, Take } from '@music/contracts';

type TakeNote = Take['notes'][number];

export class TakeRecorder {
  private readonly open = new Map<number, { startMs: number; velocity: number }>();
  private readonly notes: TakeNote[] = [];
  private readonly pedal: PedalChange[] = [];
  private pedalDown = false;

  /** `startedAt` is the clock reading when recording began. */
  constructor(private readonly startedAt: number) {}

  private rel(at: number): number {
    return Math.max(0, Math.round(at - this.startedAt));
  }

  noteOn(midi: number, velocity: number, at: number): void {
    // A key struck again before its note-off (some keyboards do this) ends the first note.
    if (this.open.has(midi)) this.noteOff(midi, at);
    this.open.set(midi, { startMs: this.rel(at), velocity: Math.min(127, Math.max(1, Math.round(velocity))) });
  }

  noteOff(midi: number, at: number): void {
    const o = this.open.get(midi);
    if (!o) return;
    this.open.delete(midi);
    this.notes.push({ midi, velocity: o.velocity, startMs: o.startMs, durationMs: Math.max(0, this.rel(at) - o.startMs) });
  }

  sustain(down: boolean, at: number): void {
    if (down === this.pedalDown) return;
    this.pedalDown = down;
    this.pedal.push({ atMs: this.rel(at), down });
  }

  /** Notes played so far, including keys still down. */
  get noteCount(): number {
    return this.notes.length + this.open.size;
  }

  /** Ends the take at `at`: keys still down and the pedal are let go, and the silence before the first note is trimmed. */
  stop(at: number): Take {
    const end = this.rel(at);
    for (const midi of [...this.open.keys()]) this.noteOff(midi, at);
    if (this.pedalDown) this.sustain(false, at);
    return trimTake({ notes: [...this.notes].sort((a, b) => a.startMs - b.startMs || a.midi - b.midi), pedal: [...this.pedal], durationMs: end });
  }
}

/** Drops the silence before the first note (keeping 200 ms) and keeps a short tail after the last one. */
export function trimTake(take: Take, tailMs = 500): Take {
  if (take.notes.length === 0) return { notes: [], pedal: [], durationMs: 0 };
  const lead = Math.max(0, Math.min(...take.notes.map((n) => n.startMs)) - 200);
  const lastEnd = Math.max(...take.notes.map((n) => n.startMs + n.durationMs), ...take.pedal.map((p) => p.atMs)) - lead;
  return {
    ...take,
    notes: take.notes.map((n) => ({ ...n, startMs: n.startMs - lead })),
    pedal: take.pedal.filter((p) => p.atMs >= lead).map((p) => ({ ...p, atMs: p.atMs - lead })),
    durationMs: Math.max(lastEnd, Math.min(take.durationMs - lead, lastEnd + tailMs)),
  };
}
