import { z } from 'zod';
import { InstrumentIdSchema } from './instruments.js';

export const NoteNamingSchema = z.enum(['western', 'sargam', 'both']);
export type NoteNaming = z.infer<typeof NoteNamingSchema>;

export const ThemeSettingSchema = z.enum(['dark', 'light', 'system']);
export type ThemeSetting = z.infer<typeof ThemeSettingSchema>;

export const KeyboardSizeSchema = z.union([z.literal(25), z.literal(37), z.literal(49), z.literal(61), z.literal(76), z.literal(88)]);

export const UserSettingsSchema = z.object({
  noteNaming: NoteNamingSchema.default('western'),
  keyboardSize: KeyboardSizeSchema.default(61),
  /** Lowest MIDI note on the keyboard; 36 (C2) for a 61-key board. */
  lowestNote: z.number().int().min(0).max(127).default(36),
  /** Key used by the Chord Namer and lessons, for example "C", "Eb", "F#m". */
  currentKey: z.string().max(16).default('C'),
  /** MIDI input id last used, so the app reconnects to the same keyboard. */
  midiInputId: z.string().max(256).nullable().default(null),
  /** The instrument being learned. Missing or null = not chosen yet: show the picker, behave as piano meanwhile. */
  instrument: InstrumentIdSchema.nullish(),
  /** Colour theme; system follows the computer's light or dark mode. */
  theme: ThemeSettingSchema.default('dark'),
});
export type UserSettings = z.infer<typeof UserSettingsSchema>;

export const UserSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().min(1),
  createdAt: z.string().datetime(),
  settings: UserSettingsSchema,
});
export type User = z.infer<typeof UserSchema>;

/** PATCH /api/identity/me/settings */
export const UpdateSettingsSchema = UserSettingsSchema.partial();
export type UpdateSettings = z.infer<typeof UpdateSettingsSchema>;
