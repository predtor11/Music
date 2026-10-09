/**
 * A take and the shared song analysis (@music/analysis): what the chords
 * were, MIDI file export and import, and the learner's fixes.
 */

import {
  analyzeNotes,
  parseMidiFile,
  withChord,
  writeMidiFile,
  type Analysis,
  type NoteEvent,
  type PedalChange,
} from '@music/analysis';
import { MAX_TAKE_MS, MAX_TAKE_NOTES, type ChordCorrection, type Take } from '@music/contracts';
import { parseKey } from '@music/theory';

/** The take's notes as the analyser reads them: seconds, loudness 0 to 1. */
export function analysisNotes(take: Take): NoteEvent[] {
  return take.notes.map((n) => ({ midi: n.midi, start: n.startMs / 1000, end: (n.startMs + n.durationMs) / 1000, velocity: n.velocity / 127 }));
}

export function analysisPedal(take: Take): PedalChange[] {
  return take.pedal.map((p) => ({ time: p.atMs / 1000, down: p.down }));
}

/**
 * Key and chords of a take. `keyOverride` is a key the learner picked ("G",
 * "Em"); each correction replaces the chord sounding at its time.
 */
export function analyseTake(take: Take, title: string, keyOverride: string | null, corrections: readonly ChordCorrection[]): Analysis {
  const key = keyOverride ? parseKey(keyOverride) : null;
  let analysis = analyzeNotes(analysisNotes(take), { title, key, bpm: take.bpm, pedal: analysisPedal(take), duration: take.durationMs / 1000 });
  const named = key ?? analysis.key.key;
  for (const c of corrections) {
    const t = c.atMs / 1000;
    const index = analysis.segments.findIndex((s) => t >= s.start && t < s.end);
    if (index < 0) continue;
    const before = analysis.segments[index]!.chord;
    const chord = c.rootPc === null || c.quality === null ? null : { rootPc: c.rootPc, quality: c.quality, bassPc: before?.bassPc ?? c.rootPc };
    analysis = withChord(analysis, index, chord, named);
  }
  return analysis;
}

/** A correction for the segment at `index`, replacing any earlier fix of the same segment. */
export function correct(corrections: readonly ChordCorrection[], analysis: Analysis, index: number, chord: Pick<ChordCorrection, 'rootPc' | 'quality'>): ChordCorrection[] {
  const seg = analysis.segments[index]!;
  const inside = (c: ChordCorrection) => c.atMs / 1000 >= seg.start && c.atMs / 1000 < seg.end;
  return [...corrections.filter((c) => !inside(c)), { atMs: Math.round(((seg.start + seg.end) / 2) * 1000), ...chord }];
}

/** Undo the fix of the segment at `index`. */
export function uncorrect(corrections: readonly ChordCorrection[], analysis: Analysis, index: number): ChordCorrection[] {
  const seg = analysis.segments[index]!;
  return corrections.filter((c) => !(c.atMs / 1000 >= seg.start && c.atMs / 1000 < seg.end));
}

/** The take as a .mid file, with the pedal, that any music program opens. */
export function takeToMidi(take: Take, title: string): Uint8Array {
  return writeMidiFile(analysisNotes(take), { title, pedal: analysisPedal(take), duration: take.durationMs / 1000, bpm: take.bpm });
}

export class ImportError extends Error {}

/** A .mid file as a take. Throws ImportError (or the reader's MidiFileError) with a readable message. */
export function midiToTake(bytes: ArrayBuffer | Uint8Array): { take: Take; title: string | null } {
  const file = parseMidiFile(bytes);
  if (file.notes.length === 0) throw new ImportError('That MIDI file has no notes to play (only drums, or nothing at all).');
  if (file.notes.length > MAX_TAKE_NOTES) throw new ImportError(`That MIDI file has more than ${MAX_TAKE_NOTES.toLocaleString('en')} notes, which is more than the app keeps.`);
  if (file.duration * 1000 > MAX_TAKE_MS) throw new ImportError('That MIDI file is longer than 3 hours, which is more than the app keeps.');
  const steady = file.tempos.length <= 1;
  const take: Take = {
    notes: file.notes.map((n) => ({
      midi: n.midi,
      velocity: Math.min(127, Math.max(1, Math.round(n.velocity * 127))),
      startMs: Math.round(n.start * 1000),
      durationMs: Math.max(1, Math.round((n.end - n.start) * 1000)),
    })),
    pedal: file.pedal.map((p) => ({ atMs: Math.round(p.time * 1000), down: p.down })),
    durationMs: Math.round(file.duration * 1000),
    ...(steady && file.grid.bpm >= 20 && file.grid.bpm <= 300 ? { bpm: Math.round(file.grid.bpm * 10) / 10 } : {}),
  };
  return { take, title: file.trackNames.find((n) => n) ?? null };
}

/** "1:05" */
export function formatTime(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** A file name for a title: "Evening jam.mid". */
export function midiFileName(title: string): string {
  const safe = title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Recording';
  return `${safe}.mid`;
}
