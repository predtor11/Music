/**
 * A plain metronome click for progressions with a tempo: a short tick on
 * every beat, a higher one on beat 1. Beats are scheduled a little ahead on
 * the audio clock, so the click stays steady when the page is busy.
 */

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tick(ac: AudioContext, at: number, accent: boolean) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'square';
  osc.frequency.value = accent ? 1760 : 1175;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(accent ? 0.18 : 0.11, at + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
  osc.connect(gain).connect(ac.destination);
  osc.start(at);
  osc.stop(at + 0.06);
}

const LOOKAHEAD_S = 0.12;
const TIMER_MS = 25;

/**
 * Start clicking at `bpm` with `beatsPerBar` beats to a bar. Calls `onBeat`
 * with the beat number (0 = beat 1) as each one sounds. Returns a stop function.
 */
export function startClick(bpm: number, onBeat?: (beat: number) => void, beatsPerBar = 4): () => void {
  const ac = audio();
  if (!ac) return () => {};
  const spb = 60 / bpm;
  let next = ac.currentTime + 0.08;
  let beat = 0;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const timer = setInterval(() => {
    while (next < ac.currentTime + LOOKAHEAD_S) {
      const b = beat % beatsPerBar;
      tick(ac, next, b === 0);
      if (onBeat) timers.push(setTimeout(() => onBeat(b), Math.max(0, (next - ac.currentTime) * 1000)));
      next += spb;
      beat++;
    }
    if (timers.length > 16) timers.splice(0, 8);
  }, TIMER_MS);
  return () => {
    clearInterval(timer);
    timers.forEach(clearTimeout);
  };
}
