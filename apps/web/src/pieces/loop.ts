/**
 * The practice loop's rules, apart from the screen so they are unit tested:
 * which notes you play for the hands and bars chosen, how a key press is
 * judged in "Wait for me" and "In time", and how the tempo climbs.
 */

import type { HandSide } from '@music/contracts';
import { barOf, barStart, barCount, type Piece, type PieceNote } from './piece.js';

export type HandChoice = HandSide | 'both';

export interface Selection {
  hands: HandChoice;
  fromBar: number;
  toBar: number;
}

export const plays = (choice: HandChoice, hand: HandSide) => choice === 'both' || choice === hand;

/** The beats a selection covers: from the start of `fromBar` to the start of the bar after `toBar`. */
export function loopSpan(piece: Piece, sel: Pick<Selection, 'fromBar' | 'toBar'>): { from: number; to: number } {
  const from = barStart(piece, sel.fromBar);
  const to = sel.toBar >= barCount(piece) ? Math.max(barStart(piece, sel.toBar + 1), ...piece.notes.map((n) => n.start + 1e-3)) : barStart(piece, sel.toBar + 1);
  return { from, to };
}

/** Notes that start inside the loop, split into yours to play and the other hand's (which the app can play). */
export function loopNotes(piece: Piece, sel: Selection): { yours: PieceNote[]; others: PieceNote[] } {
  const { from, to } = loopSpan(piece, sel);
  const inLoop = piece.notes.filter((n) => n.start >= from - 1e-6 && n.start < to - 1e-6);
  return { yours: inLoop.filter((n) => plays(sel.hands, n.hand)), others: inLoop.filter((n) => !plays(sel.hands, n.hand)) };
}

/** One moment to play: every note of yours that starts together. */
export interface Step {
  at: number;
  bar: number;
  notes: PieceNote[];
}

export function steps(piece: Piece, sel: Selection): Step[] {
  const map = new Map<number, PieceNote[]>();
  for (const n of loopNotes(piece, sel).yours) {
    const key = Math.round(n.start * 96);
    const list = map.get(key) ?? [];
    list.push(n);
    map.set(key, list);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, notes]) => ({ at: notes[0]!.start, bar: barOf(piece, notes[0]!.start), notes: notes.sort((a, b) => a.midi - b.midi) }));
}

/**
 * Wait for me: a step is done when every one of its keys has been pressed
 * since the step began (or is being held down). A key that isn't in the
 * step is a slip.
 */
export function judgeWait(step: Step, pressed: ReadonlySet<number>, note: number): 'slip' | 'partial' | 'done' {
  const want = step.notes.map((n) => n.midi);
  if (!want.includes(note)) return 'slip';
  return want.every((m) => pressed.has(m) || m === note) ? 'done' : 'partial';
}

/** In time: how far from the beat a press may land and still count, in seconds. */
export const HIT_WINDOW_S = 0.22;

/** The index of the note a press at `beat` plays: the nearest unplayed note of that key inside the window, or -1 for a slip. */
export function judgeTimed(notes: readonly PieceNote[], played: ReadonlySet<number>, midi: number, beat: number, bpm: number): number {
  const window = (HIT_WINDOW_S * bpm) / 60;
  let best = -1;
  let bestGap = Infinity;
  notes.forEach((n, i) => {
    if (played.has(i) || n.midi !== midi) return;
    const gap = Math.abs(n.start - beat);
    if (gap <= window && gap < bestGap) {
      best = i;
      bestGap = gap;
    }
  });
  return best;
}

export interface LoopResult {
  notes: number;
  hit: number;
  slips: number;
  /** Notes missed or wrong, per bar. */
  troubleByBar: Map<number, number>;
}

/** A loop is clean when nearly every note was played with very few wrong keys. */
export function isClean(r: LoopResult): boolean {
  return r.notes > 0 && r.hit / r.notes >= 0.9 && r.slips <= Math.max(1, Math.floor(r.notes / 20));
}

export const START_TEMPO = 50;
export const TEMPO_STEP = 5;
export const MIN_TEMPO = 25;

/** After a loop in time: speed up a notch when it was clean, stay put when it wasn't. */
export function nextTempo(percent: number, clean: boolean): number {
  return clean ? Math.min(100, percent + TEMPO_STEP) : percent;
}

/** Bars with the most trouble across loops, worst first, at most `n`. */
export function troubleBars(totals: ReadonlyMap<number, number>, n = 3): number[] {
  return [...totals.entries()]
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, n)
    .map(([bar]) => bar);
}

/**
 * Move notes your keyboard doesn't have by octaves until they fit, so every
 * note can be played. Returns the piece unchanged when nothing needed moving.
 */
export function foldIntoRange(piece: Piece, low: number, high: number): { piece: Piece; moved: number } {
  let moved = 0;
  const notes = piece.notes.map((n) => {
    let midi = n.midi;
    while (midi < low) midi += 12;
    while (midi > high) midi -= 12;
    if (midi === n.midi) return n;
    moved++;
    return { ...n, midi };
  });
  return moved ? { piece: { ...piece, notes }, moved } : { piece, moved };
}
