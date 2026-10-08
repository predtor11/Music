import { z } from 'zod';

/**
 * Recordings: whatever you play, kept as notes (not audio) so the app can play
 * it back, export it as a MIDI file and name the chords in it. Times are
 * milliseconds from the start of the take.
 */

/** Longest take the service stores: 3 hours. */
export const MAX_TAKE_MS = 3 * 60 * 60 * 1000;
/** Most notes in one take; a fast pianist plays about 10 a second, so this is hours of playing. */
export const MAX_TAKE_NOTES = 50_000;

export const TakeNoteSchema = z.object({
  midi: z.number().int().min(0).max(127),
  /** When the key went down. */
  start: z.number().int().min(0).max(MAX_TAKE_MS),
  /** How long the key was held (the pedal is kept separately). */
  dur: z.number().int().min(0).max(MAX_TAKE_MS),
  velocity: z.number().int().min(1).max(127),
});
export type TakeNote = z.infer<typeof TakeNoteSchema>;

/** The sustain pedal going down or up. */
export const PedalChangeSchema = z.object({
  at: z.number().int().min(0).max(MAX_TAKE_MS),
  down: z.boolean(),
});
export type PedalChange = z.infer<typeof PedalChangeSchema>;

export const TakeSchema = z.object({
  notes: z.array(TakeNoteSchema).max(MAX_TAKE_NOTES),
  pedal: z.array(PedalChangeSchema).max(MAX_TAKE_NOTES),
  durationMs: z.number().int().min(0).max(MAX_TAKE_MS),
});
export type Take = z.infer<typeof TakeSchema>;

/** Chord qualities a correction can name; the same names as @music/theory's ChordQuality. */
export const ChordQualitySchema = z.enum([
  'major',
  'minor',
  'dim',
  'aug',
  'sus2',
  'sus4',
  '7',
  'maj7',
  'm7',
  'm7b5',
  'dim7',
  'mMaj7',
  '7sus4',
  '6',
  'm6',
  'add9',
  'madd9',
  '9',
  'maj9',
  'm9',
]);

/**
 * A chord the learner fixed by hand. `at` is a time inside the chord they
 * corrected; `rootPc` null means "no chord here, just melody".
 */
export const ChordCorrectionSchema = z.object({
  at: z.number().int().min(0).max(MAX_TAKE_MS),
  rootPc: z.number().int().min(0).max(11).nullable(),
  quality: ChordQualitySchema.nullable(),
});
export type ChordCorrection = z.infer<typeof ChordCorrectionSchema>;

export const RecordingSourceSchema = z.enum(['played', 'imported']);

/** POST /api/recordings/takes */
export const CreateRecordingSchema = z.object({
  title: z.string().trim().min(1).max(120),
  source: RecordingSourceSchema.default('played'),
  take: TakeSchema,
  /** A key the learner picked instead of the one the app detected, for example "G" or "Em". */
  keyOverride: z.string().max(8).nullable().default(null),
  corrections: z.array(ChordCorrectionSchema).max(2000).default([]),
});
export type CreateRecording = z.input<typeof CreateRecordingSchema>;

/** PATCH /api/recordings/takes/:id */
export const UpdateRecordingSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    keyOverride: z.string().max(8).nullable(),
    corrections: z.array(ChordCorrectionSchema).max(2000),
  })
  .partial();
export type UpdateRecording = z.infer<typeof UpdateRecordingSchema>;

export const RecordingSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  source: RecordingSourceSchema,
  durationMs: z.number().int(),
  noteCount: z.number().int(),
  keyOverride: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type RecordingSummary = z.infer<typeof RecordingSummarySchema>;

/** GET /api/recordings/takes, newest first. */
export const RecordingListSchema = z.array(RecordingSummarySchema);

/** GET /api/recordings/takes/:id */
export const RecordingSchema = RecordingSummarySchema.extend({
  take: TakeSchema,
  corrections: z.array(ChordCorrectionSchema),
});
export type Recording = z.infer<typeof RecordingSchema>;
