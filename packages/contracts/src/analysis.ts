import { z } from 'zod';
import { ChordChartSchema } from './charts.js';
import { PerformanceSchema } from './performance.js';

/**
 * Song analysis: from notes someone played (or a MIDI file), find the key and
 * the chords over time, and offer them as a chord chart.
 */

/** POST /api/theory/analyze */
export const SongAnalysisRequestSchema = PerformanceSchema.extend({
  /** A key the player says it is in; the analysis still reports its own guess. */
  keyHint: z.string().optional(),
});
export type SongAnalysisRequest = z.infer<typeof SongAnalysisRequestSchema>;

export const KeyGuessSchema = z.object({
  /** As parseKey reads it: "G", "Am". */
  key: z.string(),
  /** 0 to 1. */
  confidence: z.number().min(0).max(1),
});
export type KeyGuess = z.infer<typeof KeyGuessSchema>;

/** A stretch of time where one chord (or none) was sounding. */
export const ChordSegmentSchema = z.object({
  startMs: z.number().min(0),
  endMs: z.number().min(0),
  /** "Em", "D/F#"; null when the notes don't make a chord. */
  symbol: z.string().nullable(),
  /** Roman numeral in the detected key; null when there is no chord. */
  roman: z.string().nullable(),
  notes: z.array(z.string()),
});
export type ChordSegment = z.infer<typeof ChordSegmentSchema>;

export const SongAnalysisSchema = z.object({
  key: KeyGuessSchema,
  /** Next best keys, most likely first (the relative minor or major is usually here). */
  otherKeys: z.array(KeyGuessSchema),
  /** Tempo found from the note onsets; null when the timing is too loose to tell. */
  bpm: z.number().nullable(),
  segments: z.array(ChordSegmentSchema),
  /** The chords laid out as bars, when a tempo was found. */
  chart: ChordChartSchema.nullable(),
});
export type SongAnalysis = z.infer<typeof SongAnalysisSchema>;
