import { z } from 'zod';

/**
 * Band talk: a cheat sheet of what musicians say at rehearsal ("take it from
 * the bridge", "two-five-one", "up a tone"), each with a playable example.
 * It is a reference beside the lessons, not a lesson, so it can be opened at
 * any time. A phrase the course glossary already teaches links to that entry
 * (`glossaryId`) instead of defining it again.
 */

export const BandTalkCategorySchema = z.enum(['chords', 'form', 'key', 'rhythm', 'playing']);
export type BandTalkCategory = z.infer<typeof BandTalkCategorySchema>;

/**
 * One moment of an example: a chord named by its number in the key (spelled
 * and voiced by the app), or plain keys with a label (a bass line, a riff).
 */
export const BandTalkStepSchema = z.union([
  z.object({
    numeral: z.string(),
    /** Key for this chord when it differs from the example's (a key change). */
    key: z.string().optional(),
    /** How long it lasts, in beats. */
    beats: z.number().int().min(1).max(8).default(2),
  }),
  z.object({
    midi: z.array(z.number().int().min(21).max(108)).min(1),
    label: z.string(),
    beats: z.number().int().min(1).max(8).default(1),
  }),
]);
export type BandTalkStep = z.infer<typeof BandTalkStepSchema>;

/** Backing-band styles the jam-along mode plays. */
export const JamStyleSchema = z.enum(['pop', 'rock', 'ballad', 'four-on-the-floor', 'half-time', 'shuffle']);
export type JamStyle = z.infer<typeof JamStyleSchema>;

export const BandTalkTermSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    /** The words as a band says them: "two-five-one", "the bridge". */
    phrase: z.string(),
    /** Other ways people say it: "2-5-1", "ii-V-I". */
    aliases: z.array(z.string()).default([]),
    category: BandTalkCategorySchema,
    /** What it means. Leave out when `glossaryId` names the glossary entry that explains it. */
    meaning: z.string().optional(),
    /** Why a player should care. Leave out with `glossaryId`. */
    whyItMatters: z.string().optional(),
    /** The course glossary entry that already teaches this phrase. */
    glossaryId: z.string().optional(),
    /** How you'd hear it at rehearsal: "Vamp on the four till I cue you." */
    sayIt: z.string(),
    /** Other glossary terms worth knowing alongside it. */
    related: z.array(z.string()).default([]),
    example: z.object({
      /** What the example shows, in one line. */
      caption: z.string(),
      key: z.string().default('C'),
      bpm: z.number().int().min(40).max(200).default(90),
      steps: z.array(BandTalkStepSchema).min(1),
    }),
    /** Open the jam-along with this progression, to try it with the band. */
    jam: z
      .object({
        numerals: z.array(z.string()).min(1),
        key: z.string().default('C'),
        style: JamStyleSchema.default('pop'),
        beatsPerChord: z.number().int().min(1).max(8).default(4),
        bpm: z.number().int().min(40).max(200).default(90),
      })
      .optional(),
  })
  .refine((t) => (t.glossaryId ? !t.meaning && !t.whyItMatters : !!t.meaning && !!t.whyItMatters), {
    message: 'give either glossaryId or both meaning and whyItMatters',
  });
export type BandTalkTerm = z.infer<typeof BandTalkTermSchema>;

/** GET /api/curriculum/bandtalk: every phrase, grouped by category in the order written. */
export const BandTalkSchema = z.array(BandTalkTermSchema);
