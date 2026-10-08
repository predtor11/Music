import { z } from 'zod';

/**
 * A test item is data, so new questions need content, not code. `kind` picks
 * the grader in @music/theory; `expect` says what counts as right.
 */
export const TestItemSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('find-note'),
    id: z.string(),
    prompt: z.string(),
    /** Pitch class 0-11 when any octave is fine. */
    pc: z.number().int().min(0).max(11).optional(),
    /** Exact MIDI note when the octave matters. */
    midi: z.number().int().min(0).max(127).optional(),
  }),
  z.object({
    kind: z.literal('play-interval'),
    id: z.string(),
    prompt: z.string(),
    /** Starting note, or null to let the player pick it. */
    startMidi: z.number().int().nullable(),
    semitones: z.number().int().min(-24).max(24),
  }),
  z.object({
    kind: z.literal('play-scale'),
    id: z.string(),
    prompt: z.string(),
    /** Pitch classes in order, tonic first. */
    sequence: z.array(z.number().int().min(0).max(11)).min(2),
    direction: z.enum(['up', 'down', 'up-down']).default('up'),
  }),
  z.object({
    kind: z.literal('build-chord'),
    id: z.string(),
    prompt: z.string(),
    pitchClasses: z.array(z.number().int().min(0).max(11)).min(2),
    /** Pitch class that must be lowest, or null for any inversion. */
    bassPc: z.number().int().min(0).max(11).nullable().default(null),
  }),
  z.object({
    kind: z.literal('name-it'),
    id: z.string(),
    prompt: z.string(),
    /** Keys lit on screen, or only played as sound when `audioOnly` is set. */
    shownMidi: z.array(z.number().int()).min(1),
    /** Ear training: play the notes without lighting the keys. */
    audioOnly: z.boolean().optional(),
    choices: z.array(z.string()).min(2),
    answer: z.string(),
  }),
]);
export type TestItem = z.infer<typeof TestItemSchema>;
export const TestItemKindSchema = z.enum(['find-note', 'play-interval', 'play-scale', 'build-chord', 'name-it']);
export type TestItemKind = z.infer<typeof TestItemKindSchema>;

/** Text drawn on keys, keyed by MIDI note number as a string: { "60": "Sa" }. */
export const KeyLabelsSchema = z.record(z.string().regex(/^\d{1,3}$/), z.string());
export type KeyLabels = z.infer<typeof KeyLabelsSchema>;

export const LessonStepSchema = z.discriminatedUnion('type', [
  /** Short explanation; markdown body, optional notes to play as a sound example. */
  z.object({
    type: z.literal('explain'),
    title: z.string(),
    body: z.string(),
    /** Notes sounded and lit on the keyboard as the example. */
    exampleMidi: z.array(z.number().int()).optional(),
    labels: KeyLabelsSchema.optional(),
  }),
  /** Concept shown on the on-screen keyboard. */
  z.object({ type: z.literal('show'), title: z.string(), body: z.string(), highlightMidi: z.array(z.number().int()), labels: KeyLabelsSchema.optional() }),
  /** App lights keys and checks you play them. */
  z.object({ type: z.literal('play-along'), title: z.string(), items: z.array(TestItemSchema).min(1) }),
  /** Free play: the app names whatever you play. */
  z.object({ type: z.literal('explore'), title: z.string(), body: z.string() }),
  /** End-of-lesson quiz. */
  z.object({ type: z.literal('quiz'), title: z.string(), items: z.array(TestItemSchema).min(1) }),
]);
export type LessonStep = z.infer<typeof LessonStepSchema>;

export const LessonSchema = z.object({
  id: z.string(),
  unitId: z.string(),
  order: z.number().int().min(1),
  title: z.string(),
  summary: z.string(),
  minutes: z.number().int().min(1),
  steps: z.array(LessonStepSchema).min(1),
});
export type Lesson = z.infer<typeof LessonSchema>;

export const UnitSchema = z.object({
  id: z.string(),
  order: z.number().int().min(1),
  title: z.string(),
  summary: z.string(),
  /** What you can do after the unit, shown on the unit card. */
  outcome: z.string(),
  lessonIds: z.array(z.string()),
  /** Checkpoint test that unlocks the next unit. */
  checkpoint: z.object({ passPercent: z.number().min(0).max(100).default(80), items: z.array(TestItemSchema).min(1) }),
});
export type Unit = z.infer<typeof UnitSchema>;

/** GET /api/curriculum/units. Also: GET /units/:id → Unit (with checkpoint), GET /lessons/:id → Lesson, 404 when unknown. */
export const UnitListSchema = z.array(UnitSchema.omit({ checkpoint: true }));
