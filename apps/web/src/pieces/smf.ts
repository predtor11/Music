/**
 * Standard MIDI File reader (.mid, formats 0 and 1): the notes of every track
 * with their times in ticks, plus the tempo, time signature and key signature
 * meta events. Pure, so it is unit tested; it never touches the network.
 */

export interface SmfNote {
  midi: number;
  channel: number;
  velocity: number;
  startTick: number;
  endTick: number;
}

export interface SmfTrack {
  name: string;
  notes: SmfNote[];
}

export interface SmfFile {
  format: number;
  /** Ticks per quarter note. */
  ppq: number;
  tracks: SmfTrack[];
  /** Microseconds per quarter note, from the tempo events, in time order. */
  tempos: { tick: number; usPerQuarter: number }[];
  timeSignatures: { tick: number; numerator: number; denominator: number }[];
  /** sf: sharps (+) or flats (-); minor: true for a minor key. */
  keySignatures: { tick: number; sf: number; minor: boolean }[];
}

export class SmfError extends Error {}

class Reader {
  pos = 0;
  constructor(readonly bytes: Uint8Array) {}
  get done() {
    return this.pos >= this.bytes.length;
  }
  u8(): number {
    if (this.pos >= this.bytes.length) throw new SmfError('The file ends too early.');
    return this.bytes[this.pos++]!;
  }
  u16(): number {
    return (this.u8() << 8) | this.u8();
  }
  u32(): number {
    return ((this.u8() << 24) >>> 0) + (this.u8() << 16) + (this.u8() << 8) + this.u8();
  }
  text(n: number): string {
    let s = '';
    for (let i = 0; i < n; i++) s += String.fromCharCode(this.u8());
    return s;
  }
  varLen(): number {
    let value = 0;
    for (let i = 0; i < 4; i++) {
      const b = this.u8();
      value = (value << 7) | (b & 0x7f);
      if (!(b & 0x80)) return value;
    }
    throw new SmfError('A length in the file is too long.');
  }
}

export function parseSmf(data: ArrayBuffer | Uint8Array): SmfFile {
  const r = new Reader(data instanceof Uint8Array ? data : new Uint8Array(data));
  if (r.bytes.length < 14 || r.text(4) !== 'MThd') throw new SmfError('This is not a MIDI file (.mid).');
  const headerLen = r.u32();
  const format = r.u16();
  const trackCount = r.u16();
  const division = r.u16();
  r.pos += headerLen - 6;
  if (division & 0x8000) throw new SmfError('This MIDI file counts time in SMPTE frames, which is not supported.');
  const ppq = division || 480;

  const file: SmfFile = { format, ppq, tracks: [], tempos: [], timeSignatures: [], keySignatures: [] };
  for (let t = 0; t < trackCount && !r.done; t++) {
    const id = r.text(4);
    const len = r.u32();
    const end = Math.min(r.pos + len, r.bytes.length);
    if (id !== 'MTrk') {
      r.pos = end;
      continue;
    }
    file.tracks.push(readTrack(r, end, file));
  }
  file.tempos.sort((a, b) => a.tick - b.tick);
  file.timeSignatures.sort((a, b) => a.tick - b.tick);
  file.keySignatures.sort((a, b) => a.tick - b.tick);
  return file;
}

function readTrack(r: Reader, end: number, file: SmfFile): SmfTrack {
  const track: SmfTrack = { name: '', notes: [] };
  // Notes waiting for their note-off, by channel and key. A list, so the same key struck twice before a release still pairs up.
  const open = new Map<number, { tick: number; velocity: number }[]>();
  let tick = 0;
  let status = 0;

  const noteOff = (channel: number, midi: number) => {
    const list = open.get(channel * 128 + midi);
    const start = list?.shift();
    if (start) track.notes.push({ midi, channel, velocity: start.velocity, startTick: start.tick, endTick: Math.max(tick, start.tick + 1) });
  };

  while (r.pos < end) {
    tick += r.varLen();
    let b = r.u8();
    if (b === 0xff) {
      const type = r.u8();
      const len = r.varLen();
      const at = r.pos;
      if (type === 0x03 && !track.name) track.name = r.text(len).trim();
      else if (type === 0x51 && len === 3) file.tempos.push({ tick, usPerQuarter: (r.u8() << 16) | (r.u8() << 8) | r.u8() });
      else if (type === 0x58 && len >= 2) file.timeSignatures.push({ tick, numerator: r.u8(), denominator: 2 ** r.u8() });
      else if (type === 0x59 && len === 2) {
        const sf = r.u8();
        file.keySignatures.push({ tick, sf: sf > 127 ? sf - 256 : sf, minor: r.u8() === 1 });
      }
      r.pos = at + len;
      if (type === 0x2f) break;
      continue;
    }
    if (b === 0xf0 || b === 0xf7) {
      r.pos += r.varLen();
      continue;
    }
    if (b & 0x80) status = b;
    else {
      // Running status: this byte is the first data byte.
      r.pos--;
      b = status;
    }
    if (!status) throw new SmfError('The file has a broken event.');
    const kind = status & 0xf0;
    const channel = status & 0x0f;
    if (kind === 0x80 || kind === 0x90) {
      const midi = r.u8() & 0x7f;
      const velocity = r.u8() & 0x7f;
      if (kind === 0x90 && velocity > 0) {
        const key = channel * 128 + midi;
        const list = open.get(key) ?? [];
        list.push({ tick, velocity });
        open.set(key, list);
      } else noteOff(channel, midi);
    } else if (kind === 0xc0 || kind === 0xd0) r.u8();
    else r.pos += 2;
  }
  // Notes never released end where the track ends.
  for (const [key, list] of open) for (const _ of list) noteOff(Math.floor(key / 128), key % 128);
  r.pos = end;
  track.notes.sort((a, b) => a.startTick - b.startTick || a.midi - b.midi);
  return track;
}
