/**
 * Writing notes as a Standard MIDI File (format 0, one track), so a take can
 * be opened in any music program. The recorder exports with this.
 */

import type { NoteEvent } from './types.js';

const PPQ = 480;

function vlq(n: number): number[] {
  let v = Math.max(0, Math.round(n));
  const out = [v & 0x7f];
  v >>= 7;
  while (v > 0) {
    out.unshift((v & 0x7f) | 0x80);
    v >>= 7;
  }
  return out;
}

export interface WriteOptions {
  bpm?: number;
  beatsPerBar?: number;
  title?: string;
}

/** Notes (times in seconds) to the bytes of a .mid file. */
export function writeMidiFile(notes: readonly NoteEvent[], opts: WriteOptions = {}): Uint8Array {
  const bpm = opts.bpm ?? 120;
  const ticks = (sec: number) => Math.round((sec * bpm * PPQ) / 60);
  const events: Array<{ tick: number; order: number; bytes: number[] }> = [];
  for (const n of notes) {
    const ch = (n.channel ?? 0) & 0x0f;
    const vel = Math.max(1, Math.min(127, Math.round(n.velocity * 127)));
    events.push({ tick: ticks(n.start), order: 1, bytes: [0x90 | ch, n.midi & 0x7f, vel] });
    events.push({ tick: Math.max(ticks(n.start) + 1, ticks(n.end)), order: 0, bytes: [0x80 | ch, n.midi & 0x7f, 0] });
  }
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);

  const track: number[] = [];
  if (opts.title) {
    const name = [...opts.title].map((c) => c.charCodeAt(0) & 0x7f);
    track.push(0, 0xff, 0x03, ...vlq(name.length), ...name);
  }
  const tempo = Math.round(60e6 / bpm);
  track.push(0, 0xff, 0x51, 3, (tempo >> 16) & 0xff, (tempo >> 8) & 0xff, tempo & 0xff);
  track.push(0, 0xff, 0x58, 4, opts.beatsPerBar ?? 4, 2, 24, 8);
  let last = 0;
  for (const e of events) {
    track.push(...vlq(e.tick - last), ...e.bytes);
    last = e.tick;
  }
  track.push(0, 0xff, 0x2f, 0);

  const len = track.length;
  const header = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, PPQ >> 8, PPQ & 0xff];
  const trackHead = [0x4d, 0x54, 0x72, 0x6b, (len >>> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff];
  return Uint8Array.from([...header, ...trackHead, ...track]);
}
