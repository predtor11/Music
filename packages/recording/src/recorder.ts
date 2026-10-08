/**
 * Turns live key presses into a take: each note's start, length and
 * velocity, plus the sustain pedal. Callers pass their own clock
 * (performance.now() in the browser), so tests can drive it with fake times.
 */

import type { PedalChange, Take, TakeNote } from '@music/contracts';

export class TakeRecorder {
  private readonly open = new Map<number, { start: number; velocity: number }>();
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
    this.open.set(midi, { start: this.rel(at), velocity: Math.min(127, Math.max(1, Math.round(velocity))) });
  }

  noteOff(midi: number, at: number): void {
    const o = this.open.get(midi);
    if (!o) return;
    this.open.delete(midi);
    this.notes.push({ midi, start: o.start, dur: Math.max(0, this.rel(at) - o.start), velocity: o.velocity });
  }

  sustain(down: boolean, at: number): void {
    if (down === this.pedalDown) return;
    this.pedalDown = down;
    this.pedal.push({ at: this.rel(at), down });
  }

  /** Notes so far, low-latency for a live view: keys still down count up to `at`. */
  get noteCount(): number {
    return this.notes.length + this.open.size;
  }

  /** The take as it stands at `at`, without ending it. */
  snapshot(at: number): Take {
    const end = this.rel(at);
    const still = [...this.open].map(([midi, o]) => ({ midi, start: o.start, dur: Math.max(0, end - o.start), velocity: o.velocity }));
    const notes = [...this.notes, ...still].sort((a, b) => a.start - b.start || a.midi - b.midi);
    const pedal = [...this.pedal];
    if (this.pedalDown) pedal.push({ at: end, down: false });
    return { notes, pedal, durationMs: end };
  }

  /** Ends the take: keys still down and the pedal are let go at `at`. */
  stop(at: number): Take {
    return trimTake(this.snapshot(at));
  }
}

/**
 * Drops the silence before the first note and keeps a short tail after the
 * last one, so a take starts when you started playing.
 */
export function trimTake(take: Take, tailMs = 500): Take {
  if (take.notes.length === 0) return { notes: [], pedal: [], durationMs: 0 };
  const first = Math.min(...take.notes.map((n) => n.start));
  const lead = Math.max(0, first - 200);
  const lastEnd = Math.max(...take.notes.map((n) => n.start + n.dur), ...take.pedal.map((p) => p.at));
  const durationMs = Math.min(take.durationMs - lead, lastEnd - lead + tailMs);
  return {
    notes: take.notes.map((n) => ({ ...n, start: n.start - lead })),
    pedal: take.pedal.filter((p) => p.at >= lead).map((p) => ({ ...p, at: p.at - lead })),
    durationMs: Math.max(durationMs, lastEnd - lead),
  };
}
