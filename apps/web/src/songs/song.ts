/**
 * Getting a song into the app: a MIDI file, an audio file, or the built-in
 * sample. Everything runs in the browser; nothing is uploaded anywhere.
 */

import { analyzeAudio, analyzeMidiFile, analyzeNotes, SAMPLE_BPM, SAMPLE_TITLE, sampleNotes, type Analysis } from '@music/analysis';

export interface Song {
  analysis: Analysis;
  /** Where the audio file plays from, for audio songs. */
  audioUrl: string | null;
}

/** About 12 minutes at 44.1 kHz mono; bigger files make the browser run out of memory. */
export const MAX_AUDIO_BYTES = 40 * 1024 * 1024;

export class SongError extends Error {}

const stripExtension = (name: string) => name.replace(/\.[^.]+$/, '');
const isMidi = (file: File) => /\.midi?$/i.test(file.name) || file.type === 'audio/midi' || file.type === 'audio/x-midi';

export function sampleSong(): Song {
  return { analysis: analyzeNotes(sampleNotes(), { title: SAMPLE_TITLE, bpm: SAMPLE_BPM, source: 'midi' }), audioUrl: null };
}

export async function loadSongFile(file: File, onProgress?: (p: number) => void): Promise<Song> {
  const title = stripExtension(file.name);
  if (isMidi(file)) {
    try {
      const analysis = analyzeMidiFile(await file.arrayBuffer(), { title });
      if (analysis.notes.length === 0) throw new SongError('That MIDI file has no notes to play (only drums, or nothing at all).');
      return { analysis, audioUrl: null };
    } catch (e) {
      if (e instanceof SongError) throw e;
      throw new SongError(`That doesn't look like a MIDI file I can read. ${e instanceof Error ? e.message : ''}`.trim());
    }
  }
  if (file.size > MAX_AUDIO_BYTES) throw new SongError('That audio file is too big for the browser to listen to (the limit is 40 MB). Try a shorter clip.');
  let decoded: AudioBuffer;
  try {
    const ctx = new AudioContext();
    try {
      decoded = await ctx.decodeAudioData(await file.arrayBuffer());
    } finally {
      void ctx.close();
    }
  } catch {
    throw new SongError('I could not open that file. Use a MIDI file (.mid) or an audio file such as .mp3, .wav or .m4a.');
  }
  // Let the "Listening..." message paint before the heavy work starts.
  await new Promise((r) => setTimeout(r, 30));
  const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i));
  const analysis = analyzeAudio(channels, decoded.sampleRate, { title, onProgress });
  return { analysis, audioUrl: URL.createObjectURL(file) };
}
