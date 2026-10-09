/**
 * A built-in sample song, so the analyser can be tried without a file: the
 * 1-5-6-4 progression in G (G D Em C), the loop behind hundreds of pop songs,
 * with a bass line, chords and a simple tune. Twice through, with a C/E and a
 * D/F# in the second half so inversions show up too.
 */

import type { NoteEvent } from './types.js';

export const SAMPLE_TITLE = 'Sample: 1-5-6-4 in G';
export const SAMPLE_BPM = 92;

// Bass, then chord tones above middle C, per bar.
const BARS: Array<{ bass: number; chord: number[] }> = [
  { bass: 43, chord: [59, 62, 67] }, // G
  { bass: 38, chord: [57, 62, 66] }, // D
  { bass: 40, chord: [59, 64, 67] }, // Em
  { bass: 36, chord: [60, 64, 67] }, // C
];
const SECOND_HALF: Array<{ bass: number; chord: number[] }> = [
  { bass: 43, chord: [59, 62, 67] }, // G
  { bass: 42, chord: [57, 62, 66] }, // D/F#
  { bass: 40, chord: [59, 64, 67] }, // Em
  { bass: 40, chord: [60, 64, 67] }, // C/E
];
// A tune on top: one bar per chord, in quarter notes.
const TUNE = [
  [74, 71, 74, 79],
  [78, 74, 69, 74],
  [76, 71, 79, 76],
  [76, 72, 67, 72],
];

export function sampleNotes(): NoteEvent[] {
  const beat = 60 / SAMPLE_BPM;
  const notes: NoteEvent[] = [];
  const bars = [...BARS, ...BARS, ...SECOND_HALF, ...SECOND_HALF];
  bars.forEach((bar, i) => {
    const t = i * 4 * beat;
    notes.push({ midi: bar.bass, start: t, end: t + 2 * beat, velocity: 0.7 });
    notes.push({ midi: bar.bass, start: t + 2 * beat, end: t + 4 * beat, velocity: 0.6 });
    for (const m of bar.chord) {
      notes.push({ midi: m, start: t, end: t + 2 * beat - 0.05, velocity: 0.55 });
      notes.push({ midi: m, start: t + 2 * beat, end: t + 4 * beat - 0.05, velocity: 0.5 });
    }
    TUNE[i % 4]!.forEach((m, j) => notes.push({ midi: m, start: t + j * beat, end: t + (j + 1) * beat - 0.04, velocity: 0.8 }));
  });
  // End on the home chord.
  const end = bars.length * 4 * beat;
  for (const m of [43, 55, 59, 62, 67]) notes.push({ midi: m, start: end, end: end + 4 * beat, velocity: 0.6 });
  return notes.sort((a, b) => a.start - b.start || a.midi - b.midi);
}
