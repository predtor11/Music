/**
 * Groups key presses that land close together into one chord attempt, so a
 * test can grade "play E flat minor" once all its notes are down. Notes
 * pressed within `windowMs` of the first one belong to the same chord.
 */

export class ChordCollector {
  private notes: number[] = [];
  private started = 0;

  constructor(private readonly windowMs = 150) {}

  /** Adds a note-on at time `now` (ms). Returns the group it joined. */
  press(note: number, now: number): number[] {
    if (this.notes.length === 0 || now - this.started > this.windowMs) {
      this.notes = [];
      this.started = now;
    }
    if (!this.notes.includes(note)) this.notes.push(note);
    return [...this.notes];
  }

  /** True once the window since the first note has passed. */
  isComplete(now: number): boolean {
    return this.notes.length > 0 && now - this.started > this.windowMs;
  }

  current(): number[] {
    return [...this.notes];
  }

  reset(): void {
    this.notes = [];
  }
}
