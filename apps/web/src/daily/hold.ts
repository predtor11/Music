/**
 * Stability mode: press the keys of a beat and hold them for a while without
 * any other key going down and without letting go early. A small state
 * machine so the rules are testable apart from the screen.
 */

export type HoldPhase = 'waiting' | 'holding' | 'failed';

export interface HoldState {
  phase: HoldPhase;
  /** Keys down right now. */
  down: ReadonlySet<number>;
  /** When all target keys were first down together, while holding. */
  since: number | null;
  /** Wrong keys pressed while still looking for the chord. */
  slips: number;
  reason: 'stray' | 'early' | null;
}

export const newHold = (): HoldState => ({ phase: 'waiting', down: new Set(), since: null, slips: 0, reason: null });

export type HoldEvent = { type: 'on' | 'off'; note: number; at: number };

const containsAll = (down: ReadonlySet<number>, target: readonly number[]) => target.every((t) => down.has(t));

export function stepHold(state: HoldState, target: readonly number[], ev: HoldEvent): HoldState {
  if (state.phase === 'failed') return state;
  const down = new Set(state.down);
  if (ev.type === 'on') down.add(ev.note);
  else down.delete(ev.note);
  const inTarget = target.includes(ev.note);

  if (state.phase === 'waiting') {
    if (ev.type === 'on' && !inTarget) return { ...state, down, slips: state.slips + 1 };
    const extras = [...down].some((n) => !target.includes(n));
    if (containsAll(down, target) && !extras) return { ...state, down, phase: 'holding', since: ev.at };
    return { ...state, down };
  }

  // Holding.
  if (ev.type === 'on' && !inTarget) return { ...state, down, phase: 'failed', reason: 'stray', since: null };
  if (ev.type === 'off' && inTarget) return { ...state, down, phase: 'failed', reason: 'early', since: null };
  return { ...state, down };
}

/** Progress of the hold from 0 to 1 at time `now`. */
export function holdProgress(state: HoldState, now: number, holdMs: number): number {
  if (state.phase !== 'holding' || state.since === null) return 0;
  return Math.max(0, Math.min(1, (now - state.since) / holdMs));
}

/** Next hold length in seconds: one second longer after a clean hold, capped. */
export function nextHold(current: number, clean: boolean): number {
  return clean ? Math.min(10, current + 1) : Math.max(2, current - 1);
}
