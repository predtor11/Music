/**
 * The backing band: chords, bass and drums, scheduled a little ahead on the
 * Web Audio clock so the groove stays steady however busy the page is. Bass
 * and drums are synthesised here, so they need no downloads; the chords use
 * the sampled piano when it has loaded, and a soft synth until then.
 *
 * Tests set `window.__sound = { played: [] }` before the app loads; the band
 * then keeps time on the page clock, silently, and records each chord it
 * would play there.
 */

import type { MidiNote } from '@music/theory';
import type { Clip, NoteEvent } from '../audio/events.js';
import { loadPiano, pianoIfReady } from '../audio/piano.js';
import { beatEvents, bassNote, countInEvents, voiceChord, type BeatEvents, type Drum, type JamChord, type JamStyle } from './logic.js';

export interface BandConfig {
  chords: JamChord[];
  style: JamStyle;
  bpm: number;
  beatsPerChord: number;
  parts: { chords: boolean; bass: boolean; drums: boolean };
}

export interface Band {
  /** Change anything while playing; it takes effect from the next beat. */
  update(config: BandConfig): void;
  stop(): void;
}

const LOOKAHEAD_S = 0.15;
const TIMER_MS = 25;
const COUNT_IN = 4;

const freq = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function recorder(): { played: Clip[] } | undefined {
  return typeof window === 'undefined' ? undefined : (window as unknown as { __sound?: { played: Clip[] } }).__sound;
}

// ---- Instruments ----

let noise: AudioBuffer | null = null;
function noiseBuffer(ac: AudioContext): AudioBuffer {
  if (noise && noise.sampleRate === ac.sampleRate) return noise;
  noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return noise;
}

function envelope(ac: AudioContext, out: AudioNode, at: number, peak: number, decay: number): GainNode {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  g.connect(out);
  return g;
}

function drum(ac: AudioContext, out: AudioNode, kind: Drum, at: number, level: number) {
  if (kind === 'kick') {
    const osc = ac.createOscillator();
    osc.frequency.setValueAtTime(140, at);
    osc.frequency.exponentialRampToValueAtTime(42, at + 0.14);
    osc.connect(envelope(ac, out, at, 0.9 * level, 0.32));
    osc.start(at);
    osc.stop(at + 0.35);
    return;
  }
  if (kind === 'rim') {
    const osc = ac.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 1900;
    osc.connect(envelope(ac, out, at, 0.35 * level, 0.04));
    osc.start(at);
    osc.stop(at + 0.06);
    return;
  }
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac);
  const filter = ac.createBiquadFilter();
  if (kind === 'snare') {
    filter.type = 'bandpass';
    filter.frequency.value = 1800;
    filter.Q.value = 0.8;
    src.connect(filter).connect(envelope(ac, out, at, 0.55 * level, 0.18));
    const body = ac.createOscillator();
    body.type = 'triangle';
    body.frequency.setValueAtTime(220, at);
    body.frequency.exponentialRampToValueAtTime(160, at + 0.08);
    body.connect(envelope(ac, out, at, 0.3 * level, 0.1));
    body.start(at);
    body.stop(at + 0.12);
  } else {
    filter.type = 'highpass';
    filter.frequency.value = 7000;
    src.connect(filter).connect(envelope(ac, out, at, 0.22 * level, kind === 'open-hat' ? 0.28 : 0.05));
  }
  src.start(at, Math.random() * 0.5);
  src.stop(at + 0.4);
}

function bass(ac: AudioContext, out: AudioNode, midi: MidiNote, at: number, length: number, level: number) {
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(900, at);
  filter.frequency.exponentialRampToValueAtTime(260, at + 0.25);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(0.5 * level, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.25 * level, at + 0.15);
  g.gain.setValueAtTime(0.25 * level, at + Math.max(0.16, length - 0.05));
  g.gain.exponentialRampToValueAtTime(0.0001, at + length + 0.06);
  filter.connect(g).connect(out);
  for (const [type, mult] of [
    ['sawtooth', 1],
    ['sine', 0.5],
  ] as const) {
    const osc = ac.createOscillator();
    osc.type = type;
    osc.frequency.value = freq(midi) * mult;
    osc.connect(filter);
    osc.start(at);
    osc.stop(at + length + 0.1);
  }
}

/** A soft electric-piano tone for the chords until the sampled piano is in. */
function keys(ac: AudioContext, out: AudioNode, notes: readonly MidiNote[], at: number, length: number, level: number) {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(0.09 * level, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.045 * level, at + 0.3);
  g.gain.setValueAtTime(0.045 * level, at + Math.max(0.31, length - 0.05));
  g.gain.exponentialRampToValueAtTime(0.0001, at + length + 0.25);
  g.connect(out);
  for (const n of notes) {
    for (const [type, mult, lvl] of [
      ['triangle', 1, 1],
      ['sine', 2, 0.3],
    ] as const) {
      const osc = ac.createOscillator();
      const og = ac.createGain();
      osc.type = type;
      osc.frequency.value = freq(n) * mult;
      og.gain.value = lvl;
      osc.connect(og).connect(g);
      osc.start(at);
      osc.stop(at + length + 0.3);
    }
  }
}

// ---- The scheduler ----

/**
 * Start the band. A bar of count-in clicks comes first; `onBeat` gets each
 * beat's number as it sounds (-4 to -1 for the count-in, then 0, 1, 2 ...).
 */
export function startBand(initial: BandConfig, onBeat: (beat: number) => void): Band {
  let config = initial;
  const rec = recorder();
  const ac = rec ? null : audio();
  if (!rec) void loadPiano();
  const now = () => (ac ? ac.currentTime : performance.now() / 1000);

  let master: GainNode | null = null;
  if (ac) {
    master = ac.createGain();
    master.gain.value = 0.8;
    master.connect(ac.destination);
  }

  let beat = -COUNT_IN;
  let next = now() + 0.1;
  let voicing: MidiNote[] | null = null;
  let lastChord = -1;
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const schedule = (events: BeatEvents, t: number, chordNotes: MidiNote[], bassRoot: MidiNote | null, spb: number) => {
    if (rec) {
      if (events.chords.length > 0 && config.parts.chords) rec.played.push({ kind: 'chord', notes: [...chordNotes] });
      return;
    }
    if (!ac || !master) return;
    if (config.parts.drums) for (const d of events.drums) drum(ac, master, d.drum, t + d.at * spb, d.level);
    if (config.parts.bass && bassRoot !== null) for (const b of events.bass) bass(ac, master, bassRoot + b.offset, t + b.at * spb, b.dur * spb, b.level);
    if (config.parts.chords && chordNotes.length > 0) {
      const piano = pianoIfReady();
      for (const c of events.chords) {
        if (piano) {
          const evs: NoteEvent[] = chordNotes.map((midi) => ({ midi, at: Math.max(0, t + c.at * spb - ac.currentTime), dur: c.dur * spb, velocity: 0.45 * c.level + 0.1 }));
          piano.play(evs);
        } else keys(ac, master, chordNotes, t + c.at * spb, c.dur * spb, c.level);
      }
    }
  };

  const tick = () => {
    while (next < now() + LOOKAHEAD_S) {
      const spb = 60 / config.bpm;
      const n = config.chords.length;
      let events: BeatEvents;
      let chordNotes: MidiNote[] = [];
      let bassRoot: MidiNote | null = null;
      if (beat < 0 || n === 0) events = countInEvents(beat);
      else {
        const index = Math.floor(beat / config.beatsPerChord) % n;
        const { chord } = config.chords[index]!;
        if (index !== lastChord || !voicing) {
          voicing = voiceChord(chord, voicing);
          lastChord = index;
        }
        chordNotes = voicing;
        bassRoot = bassNote(chord);
        events = beatEvents(config.style, beat, config.beatsPerChord, chord);
      }
      schedule(events, next, chordNotes, bassRoot, spb);
      const b = beat;
      const delay = Math.max(0, (next - now()) * 1000);
      const t = setTimeout(() => {
        timers.delete(t);
        onBeat(b);
      }, delay);
      timers.add(t);
      next += spb;
      beat++;
    }
  };

  tick();
  const timer = setInterval(tick, TIMER_MS);
  return {
    update(c) {
      if (c.chords !== config.chords) lastChord = -1;
      config = c;
    },
    stop() {
      clearInterval(timer);
      timers.forEach(clearTimeout);
      timers.clear();
      if (master && ac) {
        // Fade out whatever is already scheduled, rather than cutting it dead.
        master.gain.setTargetAtTime(0, ac.currentTime, 0.05);
        const m = master;
        setTimeout(() => m.disconnect(), 400);
      }
    },
  };
}
