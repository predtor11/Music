import { KeyLabelsSchema } from '@music/contracts';
import { z } from 'zod';

/**
 * One glossary entry: a term, what it means, why it matters to a player, and
 * the lesson that teaches it. Defined here until it moves into
 * @music/contracts (requested on the PR); the shape is what GET /glossary returns.
 */
export const GlossaryTermSchema = z.object({
  id: z.string(),
  term: z.string(),
  /** Other names for the same thing, such as "semitone" for half step. */
  aliases: z.array(z.string()).default([]),
  meaning: z.string(),
  whyItMatters: z.string(),
  /** The lesson that introduces the term; nothing earlier may use it. */
  lessonId: z.string(),
  /** Keys to light (and sound) as the example. */
  exampleMidi: z.array(z.number().int()).min(1),
  labels: KeyLabelsSchema.optional(),
});
export type GlossaryTerm = z.infer<typeof GlossaryTermSchema>;

/** GET /api/curriculum/glossary: every term, in the order the course teaches them. */
export const GlossarySchema = z.array(GlossaryTermSchema);
