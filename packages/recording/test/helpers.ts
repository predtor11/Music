import type { Take, TakeNote } from '@music/contracts';
import { parseMidi } from '@music/theory';

/** Notes by name, struck together: chord(0, 1000, 'G2 G3 B3 D4'). */
export function chord(start: number, dur: number, names: string, velocity = 90): TakeNote[] {
  return names.split(' ').map((n) => ({ midi: parseMidi(n)!, start, dur, velocity }));
}

/** Notes one after another, each `step` ms apart and `dur` long. */
export function line(start: number, step: number, dur: number, names: string, velocity = 80): TakeNote[] {
  return names.split(' ').map((n, i) => ({ midi: parseMidi(n)!, start: start + i * step, dur, velocity }));
}

export function take(notes: TakeNote[], pedal: Take['pedal'] = []): Take {
  const sorted = [...notes].sort((a, b) => a.start - b.start || a.midi - b.midi);
  return { notes: sorted, pedal, durationMs: Math.max(0, ...sorted.map((n) => n.start + n.dur)) + 200 };
}
