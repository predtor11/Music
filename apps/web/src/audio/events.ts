/** One note to sound: when (seconds from now) and for how long. */
export interface NoteEvent {
  midi: number;
  at: number;
  dur: number;
}

/** What was asked for, in the shape tests record (see window.__sound in sound.ts). */
export interface Clip {
  kind: 'chord' | 'sequence' | 'note';
  notes: number[];
}

export const CHORD_SECONDS = 1.6;
export const SEQUENCE_GAP = 0.42;
export const SEQUENCE_NOTE_SECONDS = 0.9;
export const NOTE_SECONDS = 1.2;

/** Note events for a clip, and how long it lasts. */
export function clipEvents(clip: Clip, opts: { seconds?: number; gap?: number } = {}): { events: NoteEvent[]; seconds: number } {
  switch (clip.kind) {
    case 'chord': {
      const dur = opts.seconds ?? CHORD_SECONDS;
      return { events: clip.notes.map((midi) => ({ midi, at: 0, dur })), seconds: clip.notes.length ? dur : 0 };
    }
    case 'note': {
      const dur = opts.seconds ?? NOTE_SECONDS;
      return { events: clip.notes.map((midi) => ({ midi, at: 0, dur })), seconds: clip.notes.length ? dur : 0 };
    }
    case 'sequence': {
      const gap = opts.gap ?? SEQUENCE_GAP;
      const events = clip.notes.map((midi, i) => ({ midi, at: i * gap, dur: SEQUENCE_NOTE_SECONDS }));
      return { events, seconds: clip.notes.length ? (clip.notes.length - 1) * gap + SEQUENCE_NOTE_SECONDS : 0 };
    }
  }
}
