/**
 * A piece to practise: its notes in beats (quarter notes), each tagged with
 * the hand that plays it, plus tempo and bar length. Starter pieces and
 * imported MIDI files both end up in this shape. Pure, so it is unit tested.
 */

import type { HandSide } from '@music/contracts';
import { parseSmf, type SmfFile } from './smf.js';

export interface PieceNote {
  midi: number;
  /** Start, in beats (quarter notes) from the beginning. */
  start: number;
  /** Length in beats. */
  dur: number;
  hand: HandSide;
}

export interface Piece {
  id: string;
  title: string;
  composer?: string;
  /** Where it came from, shown under the title. */
  source: 'starter' | 'import';
  /** A sentence on what the piece trains, for starter pieces. */
  about?: string;
  /** Quarter notes per minute at full speed. */
  bpm: number;
  timeSignature: [number, number];
  /** Beats before bar 1 (an upbeat), 0 for most pieces. */
  pickup: number;
  notes: PieceNote[];
}

/** Quarter-note beats in one bar: 4 in 4/4, 1.5 in 3/8. */
export const barBeats = (p: Pick<Piece, 'timeSignature'>) => (p.timeSignature[0] * 4) / p.timeSignature[1];

/** Bar number of a beat: bar 0 is the upbeat, if there is one; bar 1 starts after it. */
export function barOf(p: Pick<Piece, 'timeSignature' | 'pickup'>, beat: number): number {
  if (beat < p.pickup - 1e-6) return 0;
  return Math.floor((beat - p.pickup) / barBeats(p) + 1e-6) + 1;
}

/** First beat of a bar. */
export const barStart = (p: Pick<Piece, 'timeSignature' | 'pickup'>, bar: number) => (bar <= 0 ? 0 : p.pickup + (bar - 1) * barBeats(p));

export function lastBeat(p: Pick<Piece, 'notes'>): number {
  return p.notes.reduce((m, n) => Math.max(m, n.start + n.dur), 0);
}

/** Number of the last bar with notes in it. */
export function barCount(p: Piece): number {
  const last = p.notes.reduce((m, n) => Math.max(m, n.start), 0);
  return Math.max(1, barOf(p, last));
}

/** Where to split the hands when a file doesn't say: below middle C is the left hand. */
export const DEFAULT_SPLIT = 60;

const DRUM_CHANNEL = 9;

/**
 * Turn a MIDI file into a piece. When it has two or more tracks with notes,
 * the track with the highest notes on average is the right hand and the rest
 * are the left (how most piano MIDI files are saved). With one track, notes
 * below `split` go to the left hand.
 */
export function pieceFromSmf(smf: SmfFile, opts: { id: string; title: string; split?: number }): Piece {
  const split = opts.split ?? DEFAULT_SPLIT;
  const tracks = smf.tracks
    .map((t) => ({ ...t, notes: t.notes.filter((n) => n.channel !== DRUM_CHANNEL) }))
    .filter((t) => t.notes.length > 0);
  if (tracks.length === 0) throw new Error('This MIDI file has no notes to play.');

  const toBeats = (tick: number) => tick / smf.ppq;
  let notes: PieceNote[];
  if (tracks.length >= 2) {
    const avg = (t: (typeof tracks)[number]) => t.notes.reduce((s, n) => s + n.midi, 0) / t.notes.length;
    const right = tracks.reduce((best, t) => (avg(t) > avg(best) ? t : best));
    notes = tracks.flatMap((t) =>
      t.notes.map((n) => ({ midi: n.midi, start: toBeats(n.startTick), dur: toBeats(n.endTick - n.startTick), hand: t === right ? ('right' as const) : ('left' as const) })),
    );
  } else {
    notes = tracks[0]!.notes.map((n) => ({ midi: n.midi, start: toBeats(n.startTick), dur: toBeats(n.endTick - n.startTick), hand: n.midi < split ? 'left' : 'right' }));
  }

  // Start at the first note, on a whole beat, so silence before it isn't practised.
  const first = Math.floor(Math.min(...notes.map((n) => n.start)));
  notes = notes.map((n) => ({ ...n, start: round(n.start - first), dur: Math.max(round(n.dur), 1 / 16) })).sort((a, b) => a.start - b.start || a.midi - b.midi);

  const tempo = smf.tempos[0]?.usPerQuarter ?? 500_000;
  const ts = smf.timeSignatures[0];
  return {
    id: opts.id,
    title: opts.title,
    source: 'import',
    bpm: Math.round(60_000_000 / tempo),
    timeSignature: ts ? [ts.numerator, ts.denominator] : [4, 4],
    pickup: 0,
    notes,
  };
}

/** To 1/96 of a beat, which keeps triplets and 64th notes. */
const round = (beats: number) => Math.round(beats * 96) / 96;

/** Read a .mid file's bytes into a piece. Throws an Error with a plain message when it can't. */
export function pieceFromMidiBytes(bytes: ArrayBuffer, name: string, id: string): Piece {
  const title = name.replace(/\.(mid|midi|kar)$/i, '').replace(/[_-]+/g, ' ').trim() || 'Untitled';
  return pieceFromSmf(parseSmf(bytes), { id, title });
}

/** Move every note to the hand a split point says, for files whose tracks don't match the hands. */
export function resplit(piece: Piece, split: number): Piece {
  return { ...piece, notes: piece.notes.map((n) => ({ ...n, hand: n.midi < split ? 'left' : 'right' })) };
}
