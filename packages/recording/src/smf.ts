/**
 * Standard MIDI files (.mid): writing a take so any music app (GarageBand,
 * FL Studio, MuseScore, a DAW) can open it, and reading one back in.
 *
 * Export is format 0 (one track) at 480 ticks per beat and 120 beats per
 * minute, so a tick is just over a millisecond and nothing is rounded to a
 * grid: the file keeps exactly how you played. Import reads formats 0, 1 and
 * 2, follows tempo changes, and skips the drum channel (10).
 */

import { MAX_TAKE_MS, MAX_TAKE_NOTES, type PedalChange, type Take, type TakeNote } from '@music/contracts';

export const PPQ = 480;
/** Microseconds per beat at 120 BPM. */
export const DEFAULT_TEMPO = 500_000;
const DRUM_CHANNEL = 9;
const SUSTAIN = 64;

export class MidiFileError extends Error {}

function varLen(value: number): number[] {
  let v = Math.max(0, Math.floor(value));
  const bytes = [v & 0x7f];
  while ((v >>= 7) > 0) bytes.unshift((v & 0x7f) | 0x80);
  return bytes;
}

function u32(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

const msToTicks = (ms: number) => Math.round((ms * 1000 * PPQ) / DEFAULT_TEMPO);

/** A take as a .mid file. */
export function encodeMidiFile(take: Take, title = 'Recording'): Uint8Array {
  // Order within a tick: note-offs, then the pedal, then note-ons, so a key
  // struck again on the same tick is let go before it sounds again.
  const events: Array<{ tick: number; order: number; bytes: number[] }> = [];
  for (const n of take.notes) {
    events.push({ tick: msToTicks(n.start), order: 2, bytes: [0x90, n.midi, n.velocity] });
    events.push({ tick: msToTicks(n.start + n.dur), order: 0, bytes: [0x80, n.midi, 64] });
  }
  for (const p of take.pedal) events.push({ tick: msToTicks(p.at), order: 1, bytes: [0xb0, SUSTAIN, p.down ? 127 : 0] });
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);

  const name = [...new TextEncoder().encode(title.slice(0, 120))];
  const track: number[] = [
    ...[0x00, 0xff, 0x03, ...varLen(name.length), ...name],
    ...[0x00, 0xff, 0x51, 0x03, (DEFAULT_TEMPO >> 16) & 0xff, (DEFAULT_TEMPO >> 8) & 0xff, DEFAULT_TEMPO & 0xff],
    ...[0x00, 0xff, 0x58, 0x04, 4, 2, 24, 8],
    // Acoustic grand piano on channel 1.
    ...[0x00, 0xc0, 0x00],
  ];
  let last = 0;
  for (const e of events) {
    track.push(...varLen(e.tick - last), ...e.bytes);
    last = e.tick;
  }
  const endTick = Math.max(last, msToTicks(take.durationMs));
  track.push(...varLen(endTick - last), 0xff, 0x2f, 0x00);

  const header = [0x4d, 0x54, 0x68, 0x64, ...u32(6), 0, 0, 0, 1, (PPQ >> 8) & 0xff, PPQ & 0xff];
  return new Uint8Array([...header, 0x4d, 0x54, 0x72, 0x6b, ...u32(track.length), ...track]);
}

interface RawEvent {
  tick: number;
  kind: 'on' | 'off' | 'pedal';
  channel: number;
  note: number;
  velocity: number;
  down: boolean;
}

class Reader {
  pos = 0;
  constructor(
    private readonly bytes: Uint8Array,
    readonly end = bytes.length,
  ) {}
  u8(): number {
    if (this.pos >= this.end) throw new MidiFileError('The MIDI file ends in the middle of a track.');
    return this.bytes[this.pos++]!;
  }
  u16(): number {
    return (this.u8() << 8) | this.u8();
  }
  u32(): number {
    return ((this.u8() << 24) >>> 0) + (this.u8() << 16) + (this.u8() << 8) + this.u8();
  }
  varLen(): number {
    let v = 0;
    for (let i = 0; i < 4; i++) {
      const b = this.u8();
      v = (v << 7) | (b & 0x7f);
      if (!(b & 0x80)) return v;
    }
    throw new MidiFileError('The MIDI file has a broken length field.');
  }
  text(len: number): string {
    const slice = this.bytes.subarray(this.pos, Math.min(this.end, this.pos + len));
    this.pos += len;
    return new TextDecoder().decode(slice);
  }
  skip(len: number): void {
    this.pos += len;
  }
  tag(): string {
    return String.fromCharCode(this.u8(), this.u8(), this.u8(), this.u8());
  }
}

export interface ImportedMidi {
  take: Take;
  /** The track name, when the file has one. */
  title: string | null;
  /** Notes left out because they were on the drum channel. */
  skippedDrumNotes: number;
}

/** Read a .mid file into a take. Throws MidiFileError with a readable message when it can't. */
export function decodeMidiFile(bytes: Uint8Array): ImportedMidi {
  const r = new Reader(bytes);
  if (bytes.length < 14 || r.tag() !== 'MThd') throw new MidiFileError("This isn't a MIDI file (it should end in .mid).");
  const headerLen = r.u32();
  const headerEnd = r.pos + headerLen;
  r.u16(); // format: 0, 1 and 2 all read the same way here
  const trackCount = r.u16();
  const division = r.u16();
  r.pos = headerEnd;

  // Ticks per beat, or (SMPTE timing) ticks per second.
  const smpte = (division & 0x8000) !== 0;
  const ticksPerSecond = smpte ? (256 - (division >> 8)) * (division & 0xff) : 0;
  const ppq = smpte ? 0 : division;
  if (!smpte && ppq === 0) throw new MidiFileError('The MIDI file has no timing information.');

  const events: RawEvent[] = [];
  const tempos: Array<{ tick: number; tempo: number }> = [];
  let title: string | null = null;
  let endTick = 0;

  for (let t = 0; t < trackCount && r.pos < bytes.length; t++) {
    const tag = r.tag();
    const len = r.u32();
    const end = Math.min(bytes.length, r.pos + len);
    if (tag !== 'MTrk') {
      r.pos = end;
      continue;
    }
    const tr = new Reader(bytes, end);
    tr.pos = r.pos;
    let tick = 0;
    let status = 0;
    while (tr.pos < end) {
      tick += tr.varLen();
      let b = tr.u8();
      if (b < 0x80) {
        // Running status: this byte is data for the previous status.
        if (!status) throw new MidiFileError('The MIDI file has an event with no type.');
        tr.pos--;
        b = status;
      } else if (b < 0xf0) status = b;
      const kind = b & 0xf0;
      const channel = b & 0x0f;
      if (b === 0xff) {
        const type = tr.u8();
        const l = tr.varLen();
        if (type === 0x51 && l === 3) {
          tempos.push({ tick, tempo: (tr.u8() << 16) | (tr.u8() << 8) | tr.u8() });
        } else if (type === 0x03 && title === null && l > 0) {
          title = tr.text(l).trim() || null;
        } else if (type === 0x2f) {
          tr.skip(l);
          endTick = Math.max(endTick, tick);
          break;
        } else tr.skip(l);
      } else if (b === 0xf0 || b === 0xf7) {
        tr.skip(tr.varLen());
      } else if (kind === 0x80 || kind === 0x90) {
        const note = tr.u8() & 0x7f;
        const velocity = tr.u8() & 0x7f;
        const on = kind === 0x90 && velocity > 0;
        events.push({ tick, kind: on ? 'on' : 'off', channel, note, velocity, down: false });
      } else if (kind === 0xb0) {
        const controller = tr.u8();
        const value = tr.u8();
        if (controller === SUSTAIN) events.push({ tick, kind: 'pedal', channel, note: 0, velocity: 0, down: value >= 64 });
      } else if (kind === 0xc0 || kind === 0xd0) tr.skip(1);
      else tr.skip(2); // 0xA0 aftertouch, 0xE0 pitch bend
    }
    r.pos = end;
  }

  // Tick to milliseconds, following every tempo change.
  tempos.sort((a, b) => a.tick - b.tick);
  const toMs = (tick: number): number => {
    if (smpte) return (tick / ticksPerSecond) * 1000;
    let ms = 0;
    let lastTick = 0;
    let tempo = DEFAULT_TEMPO;
    for (const c of tempos) {
      if (c.tick >= tick) break;
      ms += ((c.tick - lastTick) * tempo) / ppq / 1000;
      lastTick = c.tick;
      tempo = c.tempo;
    }
    return ms + ((tick - lastTick) * tempo) / ppq / 1000;
  };

  // Stable by tick, offs before ons on the same tick.
  const order = { off: 0, pedal: 1, on: 2 } as const;
  events.sort((a, b) => a.tick - b.tick || order[a.kind] - order[b.kind]);

  const open = new Map<string, Array<{ start: number; velocity: number }>>();
  const notes: TakeNote[] = [];
  const pedal: PedalChange[] = [];
  let pedalDown = false;
  let skippedDrumNotes = 0;
  let lastMs = 0;
  for (const e of events) {
    const ms = Math.round(toMs(e.tick));
    lastMs = Math.max(lastMs, ms);
    if (e.kind === 'pedal') {
      if (e.down !== pedalDown) {
        pedalDown = e.down;
        pedal.push({ at: ms, down: e.down });
      }
      continue;
    }
    if (e.channel === DRUM_CHANNEL) {
      if (e.kind === 'on') skippedDrumNotes++;
      continue;
    }
    const id = `${e.channel}:${e.note}`;
    if (e.kind === 'on') {
      const list = open.get(id) ?? [];
      list.push({ start: ms, velocity: e.velocity });
      open.set(id, list);
    } else {
      const started = open.get(id)?.shift();
      if (started) notes.push({ midi: e.note, start: started.start, dur: ms - started.start, velocity: started.velocity });
    }
    if (notes.length > MAX_TAKE_NOTES) throw new MidiFileError(`The MIDI file has more than ${MAX_TAKE_NOTES.toLocaleString('en')} notes, which is more than the app can keep.`);
  }
  // Notes never let go end with the file.
  for (const [id, list] of open) {
    const midi = Number(id.split(':')[1]);
    for (const o of list) notes.push({ midi, start: o.start, dur: Math.max(0, lastMs - o.start), velocity: o.velocity });
  }
  if (pedalDown) pedal.push({ at: lastMs, down: false });
  notes.sort((a, b) => a.start - b.start || a.midi - b.midi);
  const durationMs = Math.round(Math.max(lastMs, toMs(endTick), ...notes.map((n) => n.start + n.dur), 0));
  if (durationMs > MAX_TAKE_MS) throw new MidiFileError('The MIDI file is longer than 3 hours, which is more than the app can keep.');
  return { take: { notes, pedal, durationMs }, title, skippedDrumNotes };
}
