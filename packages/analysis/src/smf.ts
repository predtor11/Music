/**
 * Reading Standard MIDI Files (.mid, .midi, .kar): notes with their times in
 * seconds, the tempo map, the time signature and the track names. Drums
 * (channel 10) are kept apart, since they carry no pitch.
 *
 * Written from the SMF 1.0 spec, no library: formats 0 and 1 (and 2, read as
 * one song), running status, tempo changes and SMPTE time.
 */

import type { PedalChange } from './pedal.js';
import type { BeatGrid, NoteEvent } from './types.js';

export interface MidiFile {
  format: number;
  /** Ticks per quarter note (0 for SMPTE files). */
  ppq: number;
  trackNames: string[];
  /** Pitched notes, sorted by start. */
  notes: NoteEvent[];
  /** Drum hits (channel 10), sorted by start. */
  drums: NoteEvent[];
  /** Sustain pedal changes (controller 64), sorted by time. `notes` keep how long each key was held. */
  pedal: PedalChange[];
  /** Tempo changes: time in seconds and quarter notes per minute. */
  tempos: Array<{ time: number; bpm: number }>;
  timeSignature: { numerator: number; denominator: number };
  grid: BeatGrid;
  duration: number;
}

export class MidiFileError extends Error {}

class Reader {
  pos = 0;
  constructor(readonly bytes: Uint8Array, readonly end = bytes.length) {}
  get done() {
    return this.pos >= this.end;
  }
  u8(): number {
    if (this.pos >= this.end) throw new MidiFileError('The MIDI file ends too early.');
    return this.bytes[this.pos++]!;
  }
  u16(): number {
    return (this.u8() << 8) | this.u8();
  }
  u32(): number {
    return ((this.u8() << 24) >>> 0) + (this.u8() << 16) + (this.u8() << 8) + this.u8();
  }
  /** Variable-length quantity. */
  vlq(): number {
    let n = 0;
    for (let i = 0; i < 4; i++) {
      const b = this.u8();
      n = n * 128 + (b & 0x7f);
      if (!(b & 0x80)) return n;
    }
    return n;
  }
  text(n: number): string {
    const s = this.bytes.subarray(this.pos, Math.min(this.pos + n, this.end));
    this.pos += n;
    let out = '';
    for (const c of s) out += String.fromCharCode(c);
    return out;
  }
  tag(): string {
    return this.text(4);
  }
}

interface RawNote {
  tick: number;
  endTick: number;
  midi: number;
  velocity: number;
  channel: number;
  track: number;
}

const DEFAULT_TEMPO = 500_000; // microseconds per quarter note (120 bpm)

/** Parse a MIDI file. Throws MidiFileError when the bytes aren't one. */
export function parseMidiFile(input: ArrayBuffer | Uint8Array): MidiFile {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const r = new Reader(bytes);
  // RIFF-wrapped MIDI (.rmi): skip to the MThd chunk.
  let start = 0;
  for (let i = 0; i + 4 <= Math.min(bytes.length, 64); i++) {
    if (bytes[i] === 0x4d && bytes[i + 1] === 0x54 && bytes[i + 2] === 0x68 && bytes[i + 3] === 0x64) {
      start = i;
      break;
    }
  }
  r.pos = start;
  if (bytes.length < 14 || r.tag() !== 'MThd') throw new MidiFileError("This isn't a MIDI file.");
  const headerLen = r.u32();
  const format = r.u16();
  const trackCount = r.u16();
  const division = r.u16();
  r.pos += headerLen - 6;

  const smpte = (division & 0x8000) !== 0;
  const ppq = smpte ? 0 : division;
  const ticksPerSecond = smpte ? (256 - (division >> 8)) * (division & 0xff) : 0;
  if (!smpte && ppq === 0) throw new MidiFileError('The MIDI file has no timing.');

  const raw: RawNote[] = [];
  const pedalTicks: Array<{ tick: number; down: boolean }> = [];
  const tempoTicks: Array<{ tick: number; tempo: number }> = [];
  const trackNames: string[] = [];
  let timeSig: { tick: number; numerator: number; denominator: number } | null = null;
  let lastTick = 0;
  let trackOffset = 0; // format 2: tracks play one after another

  for (let t = 0; t < trackCount && !r.done; t++) {
    const tag = r.tag();
    const len = r.u32();
    const end = Math.min(r.pos + len, bytes.length);
    if (tag !== 'MTrk') {
      r.pos = end;
      continue;
    }
    const tr = new Reader(bytes, end);
    tr.pos = r.pos;
    r.pos = end;
    let tick = trackOffset;
    let status = 0;
    const open = new Map<number, Array<{ tick: number; velocity: number }>>();
    let name = '';
    while (!tr.done) {
      tick += tr.vlq();
      let b = tr.u8();
      if (b < 0x80) {
        if (!status) throw new MidiFileError('The MIDI file is damaged (no status byte).');
        tr.pos--; // running status: this byte is data
        b = status;
      } else if (b < 0xf0) {
        status = b;
      }
      if (b === 0xff) {
        const type = tr.u8();
        const n = tr.vlq();
        const at = tr.pos;
        if (type === 0x51 && n >= 3) tempoTicks.push({ tick, tempo: (tr.u8() << 16) | (tr.u8() << 8) | tr.u8() });
        else if (type === 0x58 && n >= 2) {
          const numerator = tr.u8();
          const denominator = 2 ** tr.u8();
          if (!timeSig) timeSig = { tick, numerator, denominator };
        } else if (type === 0x03 && !name) name = tr.text(n).trim();
        tr.pos = at + n;
        if (type === 0x2f) break;
        continue;
      }
      if (b === 0xf0 || b === 0xf7) {
        tr.pos += tr.vlq();
        continue;
      }
      const kind = b & 0xf0;
      const channel = b & 0x0f;
      if (kind === 0x80 || kind === 0x90) {
        const midi = tr.u8();
        const vel = tr.u8();
        const id = channel * 128 + midi;
        if (kind === 0x90 && vel > 0) {
          const list = open.get(id) ?? [];
          list.push({ tick, velocity: vel });
          open.set(id, list);
        } else {
          const on = open.get(id)?.shift();
          if (on) raw.push({ tick: on.tick, endTick: tick, midi, velocity: on.velocity, channel, track: t });
        }
      } else if (kind === 0xb0) {
        const controller = tr.u8();
        const value = tr.u8();
        if (controller === 64 && channel !== 9) pedalTicks.push({ tick, down: value >= 64 });
      } else if (kind === 0xc0 || kind === 0xd0) tr.pos += 1;
      else tr.pos += 2;
    }
    // Notes never released end with the track.
    for (const [id, list] of open) for (const on of list) raw.push({ tick: on.tick, endTick: tick, midi: id % 128, velocity: on.velocity, channel: Math.floor(id / 128), track: t });
    trackNames[t] = name;
    lastTick = Math.max(lastTick, tick);
    if (format === 2) trackOffset = tick;
  }

  // Tempo map: ticks to seconds.
  tempoTicks.sort((a, b) => a.tick - b.tick);
  const map: Array<{ tick: number; sec: number; tempo: number }> = [{ tick: 0, sec: 0, tempo: DEFAULT_TEMPO }];
  for (const t of tempoTicks) {
    const prev = map[map.length - 1]!;
    const sec = prev.sec + ((t.tick - prev.tick) * prev.tempo) / 1e6 / ppq;
    if (t.tick === prev.tick) map[map.length - 1] = { ...prev, tempo: t.tempo };
    else map.push({ tick: t.tick, sec, tempo: t.tempo });
  }
  const seconds = (tick: number): number => {
    if (smpte) return tick / ticksPerSecond;
    let seg = map[0]!;
    for (const m of map) {
      if (m.tick > tick) break;
      seg = m;
    }
    return seg.sec + ((tick - seg.tick) * seg.tempo) / 1e6 / ppq;
  };

  const toEvent = (n: RawNote): NoteEvent => ({
    midi: n.midi,
    start: seconds(n.tick),
    end: Math.max(seconds(n.endTick), seconds(n.tick) + 0.02),
    velocity: n.velocity / 127,
    channel: n.channel,
    track: n.track,
  });
  const byStart = (a: NoteEvent, b: NoteEvent) => a.start - b.start || a.midi - b.midi;
  const notes = raw.filter((n) => n.channel !== 9).map(toEvent).sort(byStart);
  const drums = raw.filter((n) => n.channel === 9).map(toEvent).sort(byStart);
  const duration = Math.max(seconds(lastTick), ...notes.map((n) => n.end), 0);

  const numerator = timeSig?.numerator ?? 4;
  const denominator = timeSig?.denominator ?? 4;
  const grid = smpte
    ? steadyGrid(120, duration, numerator)
    : tickGrid(ppq, numerator, denominator, timeSig?.tick ?? 0, lastTick, seconds);
  const tempos = map.map((m) => ({ time: m.sec, bpm: 60e6 / m.tempo }));
  const pedal: PedalChange[] = [];
  for (const p of pedalTicks.sort((a, b) => a.tick - b.tick)) {
    if ((pedal[pedal.length - 1]?.down ?? false) !== p.down) pedal.push({ time: seconds(p.tick), down: p.down });
  }

  return { format, ppq, trackNames, notes, drums, pedal, tempos, timeSignature: { numerator, denominator }, grid, duration };
}

/** Beats from the file's own timing, so bars line up with the music. */
function tickGrid(ppq: number, numerator: number, denominator: number, sigTick: number, lastTick: number, seconds: (tick: number) => number): BeatGrid {
  // Compound time (6/8, 9/8, 12/8) is felt in dotted quarters.
  const compound = denominator === 8 && numerator % 3 === 0 && numerator > 3;
  const beatTicks = compound ? (ppq * 3) / 2 : (ppq * 4) / denominator;
  const beatsPerBar = compound ? numerator / 3 : numerator;
  const beats: number[] = [];
  for (let tick = 0; tick <= lastTick + beatTicks / 2; tick += beatTicks) beats.push(seconds(tick));
  if (beats.length < 2) beats.push(seconds(beatTicks));
  const firstDownbeat = Math.round(sigTick / beatTicks) % beatsPerBar;
  const span = beats[beats.length - 1]! - beats[0]!;
  const bpm = span > 0 ? (60 * (beats.length - 1)) / span : 120;
  return { beats, beatsPerBar, firstDownbeat, bpm };
}

/** An even beat grid at a fixed tempo. */
export function steadyGrid(bpm: number, duration: number, beatsPerBar = 4, offset = 0): BeatGrid {
  const step = 60 / bpm;
  const beats: number[] = [];
  // Music before the first full beat gets a short beat of its own from 0.
  if (offset > 0.02) beats.push(0);
  for (let t = offset; t <= duration + step / 2; t += step) beats.push(t);
  if (beats.length < 2) beats.push(offset + step);
  return { beats, beatsPerBar, firstDownbeat: 0, bpm };
}

/** Index of the beat nearest time t. */
export function beatIndex(grid: BeatGrid, t: number): number {
  const { beats } = grid;
  let lo = 0;
  let hi = beats.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (beats[mid]! < t) lo = mid + 1;
    else hi = mid;
  }
  return lo > 0 && t - beats[lo - 1]! < beats[lo]! - t ? lo - 1 : lo;
}
