/**
 * Shapes shared by every part of the analysis. A song reaches the analyser in
 * one of two forms: notes (a MIDI file, or something you played and recorded)
 * or frames of pitch energy (an audio file). Both end up as frames, and the
 * same key and chord finder runs on them.
 */

import type { ChordQuality, Key } from '@music/theory';

/** One note: MIDI number, start and end in seconds, loudness 0 to 1. */
export interface NoteEvent {
  midi: number;
  start: number;
  end: number;
  velocity: number;
  /** MIDI channel 0-15, when known. */
  channel?: number;
  /** Track index in the file, when known. */
  track?: number;
}

/** The beat grid: when each beat falls, and which beats start a bar. */
export interface BeatGrid {
  /** Beat times in seconds, ascending. */
  beats: number[];
  /** Beats per bar (4 in 4/4, 3 in 3/4, 6 in 6/8). */
  beatsPerBar: number;
  /** Index into `beats` of the first downbeat. */
  firstDownbeat: number;
  /** Average tempo in beats per minute. */
  bpm: number;
}

/**
 * A slice of time and how much of each pitch class sounds in it.
 * `chroma[0]` is C, `chroma[1]` C#/Db, and so on. `bass` is the same for the
 * lowest notes only, which tells root position from inversions.
 */
export interface Frame {
  start: number;
  end: number;
  chroma: number[];
  bass: number[];
  /** Overall loudness, 0 for silence. */
  energy: number;
}

/** A chord as the analyser stores it: root, type and bass as pitch classes. */
export interface ChordValue {
  rootPc: number;
  quality: ChordQuality;
  /** Bass pitch class; the root unless the chord is inverted. */
  bassPc: number;
}

/** A chord with every name the app shows for it, in a given key. */
export interface ChordLabel extends ChordValue {
  /** Chord symbol spelled in the key, for example "Em7" or "D/F#". */
  symbol: string;
  /** Roman numeral, for example "vi" or "V/7". */
  roman: string;
  /** Number as bands say it (Nashville), for example "6m" or "5/7". */
  number: string;
  /** Sargam name of the root with Sa on the key's tonic, for example "Dha" or "komal Ni". */
  sargam: string;
  /** Chord tones spelled in the key, root first. */
  notes: string[];
  /** Plain name, for example "E minor 7th". */
  name: string;
  /** True when the root and type both belong to the key. */
  inKey: boolean;
}

export interface ChordSegment {
  start: number;
  end: number;
  /** null when nothing (or no chord) sounds. */
  chord: ChordLabel | null;
  /** 0 to 1: how clearly the notes fit this chord over the alternatives. */
  confidence: number;
  /** Other likely chords, best first, for the correction picker. */
  alternatives: ChordLabel[];
  /** True when the person changed this chord by hand. */
  edited?: boolean;
}

export interface KeyGuess {
  key: Key;
  /** 0 to 1. */
  confidence: number;
}

export interface Loop {
  /** Numbers of the repeating chords, for example ["1", "5", "6m", "4"]. */
  numbers: string[];
  symbols: string[];
  /** How many times it is heard. */
  count: number;
}

export interface Summary {
  /** Short plain-English sentences, most useful first. */
  sentences: string[];
  /** The progression that repeats most, if one does. */
  loop: Loop | null;
  /** Chords used, most heard first, with how much of the song each covers (0 to 1). */
  chords: Array<{ label: ChordLabel; share: number }>;
}

export type SourceKind = 'midi' | 'recording' | 'audio';

export interface Analysis {
  source: SourceKind;
  title: string;
  /** Length in seconds. */
  duration: number;
  grid: BeatGrid;
  key: KeyGuess;
  /** Other keys that fit, best first. */
  keyAlternatives: KeyGuess[];
  segments: ChordSegment[];
  summary: Summary;
  /** The notes, for MIDI and recordings (empty for audio). */
  notes: NoteEvent[];
  /** True when a steady beat was found (so bars and tempo mean something). */
  steadyBeat: boolean;
  /** Overall confidence 0 to 1, lower for audio. */
  confidence: number;
}
