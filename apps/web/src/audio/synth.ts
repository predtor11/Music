/**
 * A small Web Audio voice for examples and ear-training questions. It is not
 * a piano sample, just a soft, bell-like tone that is clear on laptop speakers.
 */

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

const freq = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

function voice(ac: AudioContext, midi: number, at: number, length: number) {
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(0.22, at + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.08, at + 0.25);
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

/** Play notes together (a chord). */
export function playChord(notes: readonly number[], seconds = 1.6): void {
  const ac = audio();
  if (!ac) return;
  for (const n of notes) voice(ac, n, ac.currentTime + 0.02, seconds);
}

/** Play notes one after another. */
export function playSequence(notes: readonly number[], gap = 0.42): void {
  const ac = audio();
  if (!ac) return;
  notes.forEach((n, i) => voice(ac, n, ac.currentTime + 0.02 + i * gap, 0.9));
}
