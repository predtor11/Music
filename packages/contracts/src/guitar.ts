import { z } from 'zod';

/** String 1 is the thinnest (high e), fret 0 is the open string. */
export const FretPositionSchema = z.object({
  string: z.number().int().min(1).max(12),
  fret: z.number().int().min(0).max(36),
});
export type FretPosition = z.infer<typeof FretPositionSchema>;

/** MIDI note per string, thickest string first. Standard is [40, 45, 50, 55, 59, 64]. */
export const GuitarTuningSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  strings: z.array(z.number().int().min(0).max(127)).min(4).max(12),
});
export type GuitarTuning = z.infer<typeof GuitarTuningSchema>;

/** `frets` and `fingers` list the thickest string first; null means the string is not played. */
export const ChordShapeSchema = z.object({
  name: z.string().min(1),
  frets: z.array(z.number().int().min(0).max(36).nullable()),
  fingers: z.array(z.number().int().min(1).max(4).nullable()),
  baseFret: z.number().int().min(1).max(36),
});
export type ChordShape = z.infer<typeof ChordShapeSchema>;
