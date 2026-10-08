/**
 * How long each note actually rang. A take keeps how long each key was held;
 * with the sustain pedal down, a note keeps sounding after the key comes up
 * until the pedal lifts (or the same key is struck again).
 */

import type { Take, TakeNote } from '@music/contracts';

export interface SoundingNote extends TakeNote {
  /** Start plus how long it rang, pedal included. */
  end: number;
}

/** True when the pedal is down at time `t`. `pedal` is sorted by time. */
function pedalDownAt(pedal: Take['pedal'], t: number): boolean {
  let down = false;
  for (const p of pedal) {
    if (p.at > t) break;
    down = p.down;
  }
  return down;
}

function nextPedalUp(pedal: Take['pedal'], t: number, fallback: number): number {
  for (const p of pedal) if (p.at > t && !p.down) return p.at;
  return fallback;
}

export function soundingNotes(take: Take): SoundingNote[] {
  const pedal = [...take.pedal].sort((a, b) => a.at - b.at);
  const notes = [...take.notes].sort((a, b) => a.start - b.start || a.midi - b.midi);
  const nextSameKey = new Map<number, number>();
  const result: SoundingNote[] = new Array(notes.length);
  // Walk backwards so each note knows when its key is struck next.
  for (let i = notes.length - 1; i >= 0; i--) {
    const n = notes[i]!;
    const release = n.start + n.dur;
    let end = pedalDownAt(pedal, release) ? nextPedalUp(pedal, release, take.durationMs) : release;
    const again = nextSameKey.get(n.midi);
    if (again !== undefined && again < end) end = Math.max(release, again);
    result[i] = { ...n, end: Math.max(end, n.start + 1) };
    nextSameKey.set(n.midi, n.start);
  }
  return result;
}
