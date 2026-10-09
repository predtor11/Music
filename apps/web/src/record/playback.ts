/**
 * Playing a take back through the app's piano. Notes are handed to the sound
 * engine a little ahead of time in small batches, so a long take starts at
 * once and Stop takes effect within a fraction of a second.
 */

import type { NoteEvent } from '@music/analysis';
import { playEvents } from '../audio/sound.js';

const TICK_MS = 100;
/** How far ahead notes are scheduled, in seconds. */
const LOOKAHEAD = 0.3;

export class TakePlayer {
  private timer: ReturnType<typeof setInterval> | null = null;
  private frame = 0;

  get playing(): boolean {
    return this.timer !== null;
  }

  /**
   * Play `notes` (as they sounded, pedal included) from `from` seconds.
   * `onTime` gets the position every frame; `onEnd` runs when it finishes.
   */
  play(notes: readonly NoteEvent[], duration: number, from: number, onTime: (sec: number) => void, onEnd: () => void): void {
    this.stop();
    const sorted = [...notes].sort((a, b) => a.start - b.start);
    const t0 = performance.now();
    const position = () => from + (performance.now() - t0) / 1000;
    let next = sorted.findIndex((n) => n.start >= from);
    if (next < 0) next = sorted.length;
    const pump = () => {
      const now = position();
      const batch: Array<{ midi: number; at: number; dur: number; velocity: number }> = [];
      while (next < sorted.length && sorted[next]!.start < now + LOOKAHEAD) {
        const n = sorted[next++]!;
        batch.push({ midi: n.midi, at: Math.max(0, n.start - now), dur: Math.max(0.05, n.end - n.start), velocity: n.velocity });
      }
      playEvents(batch);
      if (now >= duration) {
        this.stop();
        onTime(duration);
        onEnd();
      }
    };
    const tick = () => {
      onTime(Math.min(duration, position()));
      this.frame = requestAnimationFrame(tick);
    };
    pump();
    this.timer = setInterval(pump, TICK_MS);
    this.frame = requestAnimationFrame(tick);
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    cancelAnimationFrame(this.frame);
  }
}
