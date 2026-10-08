import { z } from 'zod';

/**
 * Band chord charts. A chart stores chords as numerals in its key ("I", "V",
 * "vi", "IV", "V7/V"), so it transposes by changing `key` alone. The theory
 * package's chordFromNumeral turns a numeral into names and notes.
 */

/** How a chart shows its chords: names (G, D, Em), roman numerals, or Nashville numbers. */
export const ChartViewSchema = z.enum(['names', 'roman', 'nashville']);
export type ChartView = z.infer<typeof ChartViewSchema>;

export const ChartChordSchema = z.object({
  /** Roman numeral in the chart's key, as chordFromNumeral reads it. */
  numeral: z.string().min(1),
  /** Beats this chord lasts; a bar's chords add up to the time signature's beats. */
  beats: z.number().positive(),
  /** Bass note under the chord, as a numeral degree ("5" for G under C), for slash chords. */
  bass: z.string().optional(),
});
export type ChartChord = z.infer<typeof ChartChordSchema>;

export const ChartBarSchema = z.object({ chords: z.array(ChartChordSchema).min(1) });
export type ChartBar = z.infer<typeof ChartBarSchema>;

export const ChartSectionSchema = z.object({
  /** "Intro", "Verse", "Chorus", "Bridge"... */
  name: z.string().min(1),
  bars: z.array(ChartBarSchema).min(1),
  /** How many times the band plays this section in a row. */
  repeat: z.number().int().min(1).max(16).default(1),
});
export type ChartSection = z.infer<typeof ChartSectionSchema>;

export const ChordChartSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  /** The key, as parseKey reads it: "G", "Eb", "Am". */
  key: z.string(),
  timeSignature: z
    .object({ beats: z.number().int().min(1).max(12), unit: z.union([z.literal(2), z.literal(4), z.literal(8)]) })
    .default({ beats: 4, unit: 4 }),
  bpm: z.number().min(20).max(300).optional(),
  sections: z.array(ChartSectionSchema).min(1),
});
export type ChordChart = z.infer<typeof ChordChartSchema>;

/** One chord of a chart worked out in a key, ready to show and play. */
export const RenderedChartChordSchema = z.object({
  numeral: z.string(),
  beats: z.number(),
  /** "Em", "D/F#". */
  symbol: z.string(),
  nashville: z.string(),
  notes: z.array(z.string()),
  /** MIDI notes of a playable voicing around middle C, bass first. */
  midi: z.array(z.number().int().min(0).max(127)),
});
export type RenderedChartChord = z.infer<typeof RenderedChartChordSchema>;
