import { z } from 'zod';
import { InstrumentIdSchema } from './instruments.js';

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
    /** Ear test: the app plays the answer first and the prompt doesn't name it. */
    byEar: z.boolean().optional(),
    /** The prompt points at lit keys ("Play the lit key"), so the answer keys are lit wherever the item is used, even in a quiz or review. */
    showKeys: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal('play-interval'),
    id: z.string(),
    prompt: z.string(),
    /** Starting note, or null to let the player pick it. */
    startMidi: z.number().int().nullable(),
    semitones: z.number().int().min(-24).max(24),
    /** Ear test: the app plays the answer first and the prompt doesn't name it. */
    byEar: z.boolean().optional(),
    /** The prompt points at lit keys ("Play the lit key"), so the answer keys are lit wherever the item is used, even in a quiz or review. */
    showKeys: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal('play-scale'),
    id: z.string(),
    prompt: z.string(),
    /** Pitch classes in order, tonic first. */
    sequence: z.array(z.number().int().min(0).max(11)).min(2),
    direction: z.enum(['up', 'down', 'up-down']).default('up'),
    /** Ear test: the app plays the answer first and the prompt doesn't name it. */
    byEar: z.boolean().optional(),
    /** The prompt points at lit keys ("Play the lit key"), so the answer keys are lit wherever the item is used, even in a quiz or review. */
    showKeys: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal('build-chord'),
    id: z.string(),
    prompt: z.string(),
    pitchClasses: z.array(z.number().int().min(0).max(11)).min(2),
    /** Pitch class that must be lowest, or null for any inversion. */
    bassPc: z.number().int().min(0).max(11).nullable().default(null),
    /** Ear test: the app plays the answer first and the prompt doesn't name it. */
    byEar: z.boolean().optional(),
    /** The prompt points at lit keys ("Play the lit key"), so the answer keys are lit wherever the item is used, even in a quiz or review. */
    showKeys: z.boolean().optional(),
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
  z.object({
    kind: z.literal('play-progression'),
    id: z.string(),
    prompt: z.string(),
    /** The key, as parseKey reads it: "G", "Eb", "Am". */
    key: z.string(),
    /** Roman numerals ("I", "vi", "V7", "bVII") or Nashville numbers ("1", "6m", "5/7"), one per chord. */
    numerals: z.array(z.string()).min(2),
    /** Tempo for the optional metronome; no timing is graded when unset. */
    bpm: z.number().int().min(30).max(240).optional(),
    byEar: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal('read-staff'),
    id: z.string(),
    prompt: z.string(),
    clef: z.enum(['treble', 'bass']),
    /** Notes drawn on the staff; more than one is a chord, played together. */
    midi: z.array(z.number().int().min(0).max(127)).min(1),
    /** Key signature to draw, as parseKey reads it; C major when unset. */
    key: z.string().optional(),
  }),
  z.object({
    kind: z.literal('tap-rhythm'),
    id: z.string(),
    prompt: z.string(),
    bpm: z.number().int().min(30).max(240),
    timeSignature: z.tuple([z.number().int().min(1).max(12), z.number().int().min(1).max(16)]).default([4, 4]),
    /** When each note starts, in beats from the first downbeat after the count-in: [0, 1, 2, 2.5, 3]. */
    onsets: z.array(z.number().min(0)).min(1),
    /** Note lengths in beats, for drawing the rhythm; same length as onsets. */
    durations: z.array(z.number().positive()).optional(),
    /** How far off the beat a tap may land and still count. */
    toleranceMs: z.number().int().min(20).max(400).default(120),
  }),
]);
export type TestItem = z.infer<typeof TestItemSchema>;
export const TestItemKindSchema = z.enum([
  'find-note',
  'play-interval',
  'play-scale',
  'build-chord',
  'name-it',
  'play-progression',
  'read-staff',
  'tap-rhythm',
]);
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
  /** Missing means piano. */
  instrument: InstrumentIdSchema.optional(),
  /** Optional beginner illustration, shown beside every step in a guitar lesson. */
  guitarDiagram: z.enum(['parts', 'tab']).optional(),
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
  /** Missing means piano. Units unlock in order within one instrument. */
  instrument: InstrumentIdSchema.optional(),
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

/** One glossary entry: a term, what it means, why it matters to a player, and the lesson that teaches it. */
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
