/** A plain metronome click for the speed and control drills. */

export interface Click {
  setBpm: (bpm: number) => void;
  stop: () => void;
}

const LOOKAHEAD_S = 0.12;
const TICK_MS = 25;

export function startClick(bpm: number, onBeat?: (n: number) => void): Click | null {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  let ctx: AudioContext;
  try {
    ctx = new Ctor();
  } catch {
    return null;
  }
  void ctx.resume();
  let tempo = bpm;
  let next = ctx.currentTime + 0.1;
  let n = 0;
  const blip = (at: number, accent: boolean) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = accent ? 1500 : 1000;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(accent ? 0.25 : 0.16, at + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.06);
  };
  const timer = setInterval(() => {
    while (next < ctx.currentTime + LOOKAHEAD_S) {
      blip(next, n % 4 === 0);
      const beat = n;
      const delay = Math.max(0, (next - ctx.currentTime) * 1000);
      if (onBeat) setTimeout(() => onBeat(beat), delay);
      n += 1;
      next += 60 / tempo;
    }
  }, TICK_MS);
  return {
    setBpm: (b) => {
      tempo = b;
    },
    stop: () => {
      clearInterval(timer);
      void ctx.close().catch(() => undefined);
    },
  };
}
