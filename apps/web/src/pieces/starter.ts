/**
 * Starter pieces, written out note by note for this app from public-domain
 * works (Beethoven, Bach). Openings only: load a MIDI file of the whole piece
 * to go further. Notes are in beats (quarter notes).
 */

import type { HandSide } from '@music/contracts';
import type { Piece, PieceNote } from './piece.js';

const note = (hand: HandSide, midi: number, start: number, dur: number): PieceNote => ({ hand, midi, start, dur });
const R = (midi: number, start: number, dur: number) => note('right', midi, start, dur);
const L = (midi: number, start: number, dur: number) => note('left', midi, start, dur);

/** Notes one after another, `step` beats apart, each `dur` long. */
const run = (hand: HandSide, midis: number[], start: number, step: number, dur = step) => midis.map((m, i) => note(hand, m, start + i * step, dur));

function moonlight(): Piece {
  const T = 1 / 3; // a triplet eighth
  const notes: PieceNote[] = [];
  const triplets = (bar: number, groups: number[][]) => groups.forEach((g, i) => notes.push(...run('right', g, bar * 4 + i, T)));
  const octave = (low: number, start: number, dur: number) => notes.push(L(low, start, dur), L(low + 12, start, dur));
  // Bar 1: C# minor. Bar 2: over B in the bass. Bar 3: A, then D over F#. Bar 4: G#7.
  triplets(0, Array(4).fill([56, 61, 64]));
  octave(37, 0, 4);
  triplets(1, Array(4).fill([56, 61, 64]));
  octave(35, 4, 4);
  triplets(2, [[57, 61, 64], [57, 61, 64], [57, 62, 66], [57, 62, 66]]);
  octave(33, 8, 2);
  octave(30, 10, 2);
  triplets(3, [[56, 60, 66], [56, 61, 64], [56, 61, 63], [54, 60, 63]]);
  octave(32, 12, 2);
  octave(32, 14, 2);
  return {
    id: 'starter-moonlight',
    title: 'Moonlight Sonata (opening)',
    composer: 'Beethoven',
    source: 'starter',
    about: 'Bars 1 to 4. The left hand holds low octaves and moves down; the right hand plays the same three-note pattern over and over. Learn each hand alone first.',
    bpm: 54,
    timeSignature: [2, 2],
    pickup: 0,
    notes,
  };
}

function furElise(): Piece {
  const S = 0.25; // a sixteenth
  const notes: PieceNote[] = [...run('right', [76, 75], 0, S)];
  const turn = (start: number) => notes.push(...run('right', [76, 75, 76, 71, 74, 72], start, S));
  /** Left hand broken chord under a held right-hand note, then three right-hand notes. */
  const bar = (start: number, top: number, left: number[], right: number[]) => {
    notes.push(R(top, start, 2 * S), ...run('left', left, start, S), ...run('right', right, start + 3 * S, S));
  };
  turn(0.5);
  bar(2, 69, [45, 52, 57], [60, 64, 69]);
  bar(3.5, 71, [40, 52, 56], [64, 68, 71]);
  bar(5, 72, [45, 52, 57], [64, 76, 75]);
  turn(6.5);
  bar(8, 69, [45, 52, 57], [60, 64, 69]);
  bar(9.5, 71, [40, 52, 56], [64, 72, 71]);
  notes.push(R(69, 11, 1), ...run('left', [45, 52, 57], 11, S));
  return {
    id: 'starter-fur-elise',
    title: 'Für Elise (opening)',
    composer: 'Beethoven',
    source: 'starter',
    about: 'Bars 1 to 8. The left hand plays quick broken chords (A minor, E major) that hand over to the right hand. Good for a fast, light left hand.',
    bpm: 66,
    timeSignature: [3, 8],
    pickup: 0.5,
    notes,
  };
}

function prelude(): Piece {
  const S = 0.25;
  // Each bar: two left-hand notes, then three right-hand notes played twice, all twice per bar.
  const bars: [number, number, number[]][] = [
    [60, 64, [67, 72, 76]], // C
    [60, 62, [69, 74, 77]], // Dm7 over C
    [59, 62, [67, 74, 77]], // G7 over B
    [60, 64, [67, 72, 76]], // C
    [60, 64, [69, 76, 81]], // Am over C
    [60, 62, [66, 69, 74]], // D7 over C
    [59, 62, [67, 74, 79]], // G over B
    [59, 60, [64, 67, 72]], // Cmaj7 over B
    [57, 60, [64, 67, 72]], // Am7
    [50, 57, [62, 66, 72]], // D7
    [55, 59, [62, 67, 71]], // G
  ];
  const notes: PieceNote[] = [];
  bars.forEach(([a, b, top], i) => {
    for (const half of [0, 2]) {
      const t = i * 4 + half;
      notes.push(L(a, t, 2), L(b, t + S, 2 - S), ...run('right', [...top, ...top], t + 2 * S, S));
    }
  });
  return {
    id: 'starter-prelude-c',
    title: 'Prelude in C (opening)',
    composer: 'J. S. Bach',
    source: 'starter',
    about: 'Bars 1 to 11. One broken chord per bar, so it is the clearest way to watch chords change: look at the chord row while you play.',
    bpm: 66,
    timeSignature: [4, 4],
    pickup: 0,
    notes,
  };
}

function odeToJoy(): Piece {
  const C = [48, 52, 55];
  const G = [43, 47, 50];
  const notes: PieceNote[] = [];
  const line = (start: number, midis: number[]) => notes.push(...run('right', midis, start, 1));
  const chord = (pcs: number[], start: number, dur: number) => notes.push(...pcs.map((m) => L(m, start, dur)));
  line(0, [64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64]);
  notes.push(R(64, 12, 1.5), R(62, 13.5, 0.5), R(62, 14, 2));
  line(16, [64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64]);
  notes.push(R(62, 28, 1.5), R(60, 29.5, 0.5), R(60, 30, 2));
  [C, G, C, G, C, G, C].forEach((c, i) => chord(c, i * 4, 4));
  chord(G, 28, 2);
  chord(C, 30, 2);
  return {
    id: 'starter-ode-to-joy',
    title: 'Ode to Joy',
    composer: 'Beethoven',
    source: 'starter',
    about: 'The melody over left-hand chords that jump between C and G. Start here to practise hands together.',
    bpm: 100,
    timeSignature: [4, 4],
    pickup: 0,
    notes,
  };
}

export const STARTER_PIECES: readonly Piece[] = [odeToJoy(), furElise(), prelude(), moonlight()];
