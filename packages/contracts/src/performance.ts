import { z } from 'zod';

/**
 * Notes as someone played them, with timing. Song analysis reads this, and
 * the recorder (Phase 6) saves it and exports it as a MIDI file.
 */

export const NoteEventSchema = z.object({
  midi: z.number().int().min(0).max(127),
  velocity: z.number().int().min(1).max(127),
  /** From the start of the take, in milliseconds. */
  startMs: z.number().min(0),
  durationMs: z.number().min(0),
});
export type NoteEvent = z.infer<typeof NoteEventSchema>;

export const PerformanceSchema = z.object({
  notes: z.array(NoteEventSchema).max(20_000),
  /** The tempo the player chose, if a metronome was on. */
  bpm: z.number().min(20).max(300).optional(),
});
export type Performance = z.infer<typeof PerformanceSchema>;
