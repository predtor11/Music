import { z } from 'zod';

/**
 * Band chord charts. Chords are stored as absolute symbols in the chart's
 * key ("D/F#", "Am7"); numbers and sargam are worked out when the chart is
 * shown. Transposing means a new key plus re-spelled symbols. Song analysis
 * and the recorder hand charts to the charts page in this shape.
 */

/** How a chart shows its chords: names (G, D, Em), roman numerals, Nashville numbers or sargam. */
export const ChartViewSchema = z.enum(['names', 'roman', 'nashville', 'sargam']);
export type ChartView = z.infer<typeof ChartViewSchema>;

export const ChartChordSchema = z.object({
  /** "D/F#", "Am7"; "%" means the chord before carries on. */
  symbol: z.string().min(1),
  /** Beats this chord lasts; when left out, a bar's chords share its beats evenly. */
  beats: z.number().positive().optional(),
});
export type ChartChord = z.infer<typeof ChartChordSchema>;

export const ChartBarSchema = z.object({ chords: z.array(ChartChordSchema).min(1) });
export type ChartBar = z.infer<typeof ChartBarSchema>;

export const SectionKindSchema = z.enum(['intro', 'verse', 'pre-chorus', 'chorus', 'bridge', 'solo', 'interlude', 'outro', 'other']);
export type SectionKind = z.infer<typeof SectionKindSchema>;

export const ChartSectionSchema = z.object({
  id: z.string().min(1),
  /** "Verse 1". */
  name: z.string().min(1),
  kind: SectionKindSchema,
  bars: z.array(ChartBarSchema).min(1),
  /** How many times the band plays this section in a row ("x2"). */
  repeat: z.number().int().min(1).max(16).optional(),
});
export type ChartSection = z.infer<typeof ChartSectionSchema>;

export const ChordChartSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1),
  title: z.string().min(1),
  artist: z.string().optional(),
  /** The key, as parseKey reads it: "G", "Eb", "F#m". */
  key: z.string(),
  timeSignature: z.string().regex(/^\d{1,2}\/(2|4|8|16)$/),
  /** Beats per minute. */
  tempo: z.number().min(20).max(300).optional(),
  sections: z.array(ChartSectionSchema).min(1),
  source: z.object({ kind: z.enum(['manual', 'analysis', 'recording']), ref: z.string().optional() }).optional(),
  notes: z.string().optional(),
  /** ISO date-time. */
  updatedAt: z.string(),
});
export type ChordChart = z.infer<typeof ChordChartSchema>;
