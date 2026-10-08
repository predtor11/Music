import { z } from 'zod';

/** GET /api/theory/chord?notes=60,64,67&key=C */
export const ChordQuerySchema = z.object({
  notes: z
    .string()
    .transform((s) => s.split(',').map((n) => Number(n.trim())))
    .pipe(z.array(z.number().int().min(0).max(127)).min(1)),
  key: z.string().default('C'),
});

export const ChordAnswerSchema = z.object({
  symbol: z.string().nullable(),
  name: z.string().nullable(),
  inversion: z.string().nullable(),
  roman: z.string().nullable(),
  nashville: z.string().nullable(),
  notes: z.array(z.string()),
  alternatives: z.array(z.string()),
});
export type ChordAnswer = z.infer<typeof ChordAnswerSchema>;

/** GET /api/theory/scale/:key?type=major */
export const ScaleAnswerSchema = z.object({ key: z.string(), type: z.string(), notes: z.array(z.string()) });
export type ScaleAnswer = z.infer<typeof ScaleAnswerSchema>;
