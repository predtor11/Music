/**
 * The sustain pedal. A recording keeps how long each key was held; with the
 * pedal down a note keeps ringing after the key comes up, until the pedal
 * lifts or the same key is struck again. The chord finder needs the notes as
 * they sounded, so broken chords played with the pedal (the Moonlight
 * Sonata's left hand and triplets) are heard as the chords they make.
 */

import type { NoteEvent } from './types.js';

/** The pedal going down or up, in seconds from the start. */
export interface PedalChange {
  time: number;
  down: boolean;
}

/** Notes lengthened to how long they rang with the pedal. */
export function applyPedal(notes: readonly NoteEvent[], pedal: readonly PedalChange[], duration = Infinity): NoteEvent[] {
  if (pedal.length === 0) return [...notes];
  const changes = [...pedal].sort((a, b) => a.time - b.time);
  const downAt = (t: number) => {
    let down = false;
    for (const p of changes) {
      if (p.time > t) break;
      down = p.down;
    }
    return down;
  };
  const nextUp = (t: number) => changes.find((p) => p.time > t && !p.down)?.time ?? duration;
  const sorted = [...notes].sort((a, b) => a.start - b.start || a.midi - b.midi);
  const nextSameKey = new Map<number, number>();
  const out: NoteEvent[] = new Array(sorted.length);
  // Backwards, so each note knows when its key is struck next.
  for (let i = sorted.length - 1; i >= 0; i--) {
    const n = sorted[i]!;
    let end = downAt(n.end) ? Math.max(n.end, Math.min(nextUp(n.end), duration)) : n.end;
    const again = nextSameKey.get(n.midi);
    if (again !== undefined && again < end) end = Math.max(n.end, again);
    out[i] = { ...n, end };
    nextSameKey.set(n.midi, n.start);
  }
  return out;
}
