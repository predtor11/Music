import { z } from 'zod';

/**
 * Technique sessions: hand position and finger training. They are their own
 * track beside the units, so they can be taken at any time. The app can hear
 * which key you press but not which finger pressed it, so every session shows
 * an animated hand with the finger to use and checks the keys.
 */

export const HandSideSchema = z.enum(['left', 'right']);
export type HandSide = z.infer<typeof HandSideSchema>;

/** Finger numbers as pianists use them: 1 is the thumb, 5 the little finger, on both hands. */
export const FingerSchema = z.number().int().min(1).max(5);
export type Finger = z.infer<typeof FingerSchema>;

/** Where one hand rests: the key under each finger, thumb (finger 1) first. */
export const HandPositionSchema = z.object({
  hand: HandSideSchema,
  keys: z.array(z.number().int().min(21).max(108)).length(5),
});
export type HandPosition = z.infer<typeof HandPositionSchema>;

/** One key to play, and the finger to play it with. */
export const FingeredNoteSchema = z.object({
  midi: z.number().int().min(21).max(108),
  hand: HandSideSchema,
  finger: FingerSchema,
});
export type FingeredNote = z.infer<typeof FingeredNoteSchema>;

/** Keys played together, after the hands move to `move` if given. */
export const TechniqueBeatSchema = z.object({
  notes: z.array(FingeredNoteSchema).min(1),
  /** New positions for the hands named, taken before this beat (thumb under, crossing over, a new chord). */
  move: z.array(HandPositionSchema).optional(),
});
export type TechniqueBeat = z.infer<typeof TechniqueBeatSchema>;

export const TechniqueStepSchema = z.discriminatedUnion('type', [
  /** Text with the hands resting on the keyboard. `demo` is played by the Watch button. */
  z.object({
    type: z.literal('explain'),
    title: z.string(),
    body: z.string(),
    hands: z.array(HandPositionSchema).min(1),
    demo: z.array(TechniqueBeatSchema).optional(),
  }),
  /** Play the beats in order on your keyboard; the hand shows each finger as it comes. */
  z.object({
    type: z.literal('drill'),
    title: z.string(),
    body: z.string(),
    hands: z.array(HandPositionSchema).min(1),
    beats: z.array(TechniqueBeatSchema).min(2),
    /** Clean-enough runs needed before moving on. */
    rounds: z.number().int().min(1).max(5).default(2),
  }),
]);
export type TechniqueStep = z.infer<typeof TechniqueStepSchema>;

export const TechniqueSessionSchema = z.object({
  id: z.string(),
  order: z.number().int().min(1),
  title: z.string(),
  summary: z.string(),
  steps: z.array(TechniqueStepSchema).min(1),
});
export type TechniqueSession = z.infer<typeof TechniqueSessionSchema>;

/** GET /api/curriculum/technique: every session in order, without its steps. */
export const TechniqueListSchema = z.array(TechniqueSessionSchema.omit({ steps: true }));
export type TechniqueSummary = z.infer<typeof TechniqueListSchema>[number];
