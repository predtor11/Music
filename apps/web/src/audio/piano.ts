/**
 * The sampled piano: Tone.js playing the Salamander Grand Piano recordings
 * (CC BY 3.0, Alexander Holm). Tone and the samples load on first use, so the
 * app starts fast and works offline; until they're in, the synth plays.
 *
 * Set VITE_PIANO_SAMPLES_URL to serve the samples from somewhere else (for
 * example a copy in public/ for a desktop build).
 */

import type { NoteEvent } from './events.js';

const DEFAULT_SAMPLES_URL = 'https://tonejs.github.io/audio/salamander/';
/** Give up on the samples after this long and stay on the synth for this visit. */
const LOAD_TIMEOUT_MS = 20_000;

/** One recording every minor third from C2 to C7; Tone pitches the rest. */
function sampleUrls(): Record<string, string> {
  const urls: Record<string, string> = {};
  for (let octave = 2; octave <= 6; octave++) {
    for (const [name, file] of [
      ['C', 'C'],
      ['D#', 'Ds'],
      ['F#', 'Fs'],
      ['A', 'A'],
    ] as const) {
      urls[`${name}${octave}`] = `${file}${octave}.mp3`;
    }
  }
  urls.C7 = 'C7.mp3';
  return urls;
}

export interface Piano {
  play(events: readonly NoteEvent[]): void;
}

let loading: Promise<Piano | null> | null = null;
let ready: Piano | null = null;

/** The piano if it has finished loading, else null (without starting a load). */
export const pianoIfReady = (): Piano | null => ready;

/** Start loading (once) and resolve to the piano, or null if it can't load. */
export function loadPiano(): Promise<Piano | null> {
  loading ??= (async () => {
    try {
      const Tone = await import('tone');
      const baseUrl = (import.meta.env.VITE_PIANO_SAMPLES_URL as string | undefined) || DEFAULT_SAMPLES_URL;
      const sampler = await new Promise<InstanceType<typeof Tone.Sampler>>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Piano samples timed out')), LOAD_TIMEOUT_MS);
        const s: InstanceType<typeof Tone.Sampler> = new Tone.Sampler({
          urls: sampleUrls(),
          baseUrl,
          release: 1.2,
          onload: () => {
            clearTimeout(timer);
            resolve(s);
          },
          onerror: (err) => {
            clearTimeout(timer);
            reject(err);
          },
        }).toDestination();
        s.volume.value = -4;
      });
      ready = {
        play(events) {
          // Resumes the audio context if the browser suspended it.
          void Tone.start();
          const now = Tone.now() + 0.03;
          for (const e of events) sampler.triggerAttackRelease(Tone.Frequency(e.midi, 'midi').toNote(), e.dur, now + e.at, e.velocity ?? 0.75);
        },
      };
      return ready;
    } catch (err) {
      console.warn('Sampled piano unavailable, using the built-in sound.', err);
      return null;
    }
  })();
  return loading;
}
