/**
 * A metronome with a count-in, scheduled on the Web Audio clock so clicks
 * land exactly on time however busy the page is. Times come back on the
 * performance.now() clock, which is the clock key presses are stamped with,
 * so taps can be graded against what was actually heard.
 */

import { beatMs } from '@music/theory';

export interface MetronomePlan {
  bpm: number;
  beatsPerBar: number;
  /** Clicks before beat 0, usually one bar. */
  countInBeats: number;
  /** Beats after the count-in. */
  beats: number;
  /** Keep clicking after the count-in. */
  clickThrough?: boolean;
  /** Beats to sound as notes (a woodblock), for hearing a rhythm before tapping it. */
  pattern?: readonly number[];
}

export interface MetronomeRun {
  /** performance.now() time of beat 0, after the count-in. */
  startMs: number;
  /** performance.now() time the first count-in click sounds. */
  countInMs: number;
  /** performance.now() time the last beat ends. */
  endMs: number;
  beatMs: number;
  stop: () => void;
}

/** Breathing room before the first click, so it isn't clipped. */
const LEAD_MS = 150;

let ctx: AudioContext | null = null;

async function audio(): Promise<AudioContext | null> {
  if (typeof AudioContext === 'undefined') return null;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') {
    // Browsers may hold audio until a gesture; don't wait forever for it.
    await Promise.race([ctx.resume(), new Promise((r) => setTimeout(r, 250))]);
  }
  return ctx.state === 'running' ? ctx : null;
}

function click(ac: AudioContext, at: number, kind: 'accent' | 'beat' | 'note', out: AudioNode[]) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  const [freq, level, length, type] = kind === 'accent' ? [1760, 0.32, 0.05, 'square'] : kind === 'beat' ? [1320, 0.18, 0.04, 'square'] : [784, 0.5, 0.12, 'triangle'];
  osc.type = type as OscillatorType;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(level, at + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(gain).connect(ac.destination);
  osc.start(at);
  osc.stop(at + length + 0.02);
  out.push(osc);
}

/** Start clicking. Silent (but still timed) when the browser has no audio. */
export async function startMetronome(plan: MetronomePlan): Promise<MetronomeRun> {
  const beat = beatMs(plan.bpm);
  const ac = await audio();
  const nodes: AudioNode[] = [];
  let countInMs: number;
  if (ac) {
    const t0 = ac.currentTime + LEAD_MS / 1000;
    // Map the audio clock to performance.now(), including output latency, so a
    // tap in time with the heard click scores as on time.
    const stamp = ac.getOutputTimestamp?.();
    const latency = (ac.outputLatency || ac.baseLatency || 0) * 1000;
    const perfAt = (t: number) =>
      stamp?.performanceTime && stamp.contextTime !== undefined ? stamp.performanceTime + (t - stamp.contextTime) * 1000 + latency : performance.now() + (t - ac.currentTime) * 1000 + latency;
    countInMs = perfAt(t0);
    const sec = beat / 1000;
    for (let i = 0; i < plan.countInBeats; i++) click(ac, t0 + i * sec, i % plan.beatsPerBar === 0 ? 'accent' : 'beat', nodes);
    const start = t0 + plan.countInBeats * sec;
    if (plan.clickThrough) for (let i = 0; i < plan.beats; i++) click(ac, start + i * sec, i % plan.beatsPerBar === 0 ? 'accent' : 'beat', nodes);
    for (const b of plan.pattern ?? []) click(ac, start + b * sec, 'note', nodes);
  } else {
    countInMs = performance.now() + LEAD_MS;
  }
  const startMs = countInMs + plan.countInBeats * beat;
  return {
    startMs,
    countInMs,
    endMs: startMs + plan.beats * beat,
    beatMs: beat,
    stop: () => {
      for (const n of nodes) {
        try {
          (n as OscillatorNode).stop();
        } catch {
          // Already stopped.
        }
      }
    },
  };
}
