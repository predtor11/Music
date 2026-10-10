/**
 * Everything the app plays: examples, ear-training prompts, answers and
 * on-screen key presses. The sampled piano plays when it's loaded; otherwise
 * the synth does, so sound always works.
 *
 * Tests set `window.__sound = { played: [] }` before the app loads; every clip
 * is then recorded there instead of played, so e2e runs need no audio or
 * network.
 */

import { clipEvents, type Clip, type NoteEvent } from './events.js';
import { loadPiano, pianoIfReady } from './piano.js';
import { synthPlay } from './synthVoice.js';
import { beginPlayback } from './playback.js';

export type { Clip, NoteEvent } from './events.js';

/** How long a prompt waits for the piano to finish loading before using the synth. */
const PIANO_WAIT_MS = 2500;

interface SoundStub {
  played: Clip[];
}

function stub(): SoundStub | undefined {
  return typeof window === 'undefined' ? undefined : (window as unknown as { __sound?: SoundStub }).__sound;
}

/** Start fetching the piano now, so it's ready when something plays. */
export function preloadPiano(): void {
  if (!stub()) void loadPiano();
}

async function sound(events: readonly NoteEvent[], wait: boolean): Promise<void> {
  const piano = pianoIfReady() ?? (wait ? await Promise.race([loadPiano(), new Promise<null>((r) => setTimeout(() => r(null), PIANO_WAIT_MS))]) : null);
  if (piano) piano.play(events);
  else {
    synthPlay(events);
    if (!wait) preloadPiano();
  }
}

/** Play a clip. Resolves when it has finished sounding. */
export async function play(clip: Clip, opts: { seconds?: number; gap?: number; wait?: boolean } = {}): Promise<void> {
  const recorder = stub();
  if (recorder) {
    recorder.played.push({ kind: clip.kind, notes: [...clip.notes] });
    return;
  }
  const { events, seconds } = clipEvents(clip, opts);
  if (events.length === 0) return;
  const finish = beginPlayback();
  try {
    await sound(events, opts.wait ?? true);
    await new Promise((r) => setTimeout(r, seconds * 1000));
  } finally {
    finish();
  }
}

/** Play notes together (a chord). */
export const playChord = (notes: readonly number[], seconds?: number) => play({ kind: 'chord', notes: [...notes] }, { seconds });

/** Play notes one after another. */
export const playSequence = (notes: readonly number[], gap?: number) => play({ kind: 'sequence', notes: [...notes] }, { gap });

/**
 * Notes at set times, right away (no waiting for the piano), for pieces: the
 * other hand under your practice, and Listen. Recorded as a sequence in tests (and for playing back recordings).
 */
export function playEvents(events: readonly NoteEvent[]): void {
  if (events.length === 0) return;
  const recorder = stub();
  if (recorder) {
    recorder.played.push({ kind: 'sequence', notes: events.map((e) => e.midi) });
    return;
  }
  const finish = beginPlayback();
  void sound(events, false).then(() => {
    setTimeout(finish, Math.max(...events.map((event) => event.at + event.dur)) * 1000);
  }, finish);
}

/** One key, right away (no waiting for the piano), for key presses. */
export const playKey = (note: number) => play({ kind: 'note', notes: [note] }, { wait: false });
