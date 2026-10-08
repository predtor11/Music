/**
 * The offline voice: a soft, bell-like Web Audio tone that needs no
 * downloads. It plays when the sampled piano hasn't loaded (no network, or
 * still loading) and for key clicks before the piano is ready.
 */

import type { NoteEvent } from './events.js';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

const freq = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

function voice(ac: AudioContext, midi: number, at: number, length: number, level = 1) {
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(0.22 * level, at + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.08 * level, at + 0.25);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  gain.connect(ac.destination);
  for (const [type, mult, level] of [
    ['triangle', 1, 1],
    ['sine', 2, 0.25],
  ] as const) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.value = freq(midi) * mult;
    g.gain.value = level;
    osc.connect(g).connect(gain);
    osc.start(at);
    osc.stop(at + length + 0.05);
  }
}

/** Play note events on the synth. */
export function synthPlay(events: readonly NoteEvent[]): void {
  const ac = audio();
  if (!ac) return;
  const start = ac.currentTime + 0.02;
  for (const e of events) voice(ac, e.midi, start + e.at, e.dur, e.velocity === undefined ? 1 : 0.3 + e.velocity);
}
