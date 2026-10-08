/**
 * Saying what the analysis found in plain English, for someone who plays by
 * ear: the key and where home is, the chords that matter, the loop that
 * repeats, and anything from outside the key.
 */

import { keyLabel, keyTonicPc, noteToString, pretty, type Key } from '@music/theory';
import type { BeatGrid, ChordLabel, ChordSegment, KeyGuess, Loop, SourceKind, Summary } from './types.js';

export function sureWord(confidence: number): string {
  return confidence >= 0.75 ? 'sure' : confidence >= 0.5 ? 'fairly sure' : 'not sure';
}

/** A chord without its slash bass: D/F♯ counts as D when looking at the harmony. */
export const baseOf = (c: ChordLabel): ChordLabel =>
  c.bassPc === c.rootPc ? c : { ...c, bassPc: c.rootPc, symbol: c.symbol.split('/')[0]!, roman: c.roman.split('/')[0]!, number: c.number.split('/')[0]! };

/** The repeating progression that covers the most of the song. Inversions count as their chord. */
export function findLoop(chords: readonly ChordLabel[]): Loop | null {
  // One entry per change of chord.
  const seq: ChordLabel[] = [];
  for (const c of chords.map(baseOf)) if (seq[seq.length - 1]?.symbol !== c.symbol) seq.push(c);
  if (seq.length < 4) return null;
  const ids = seq.map((c) => c.symbol);
  let best: { start: number; len: number; count: number; score: number } | null = null;
  for (let len = 2; len <= Math.min(8, Math.floor(seq.length / 2)); len++) {
    const seen = new Map<string, { start: number; count: number; last: number }>();
    for (let i = 0; i + len <= ids.length; i++) {
      const slice = ids.slice(i, i + len);
      // A loop of the same chord twice isn't a loop; neither is "A B A B" when "A B" exists.
      if (new Set(slice).size < 2) continue;
      if (len % 2 === 0 && slice.slice(0, len / 2).join() === slice.slice(len / 2).join()) continue;
      const k = slice.join(' ');
      const entry = seen.get(k);
      if (!entry) seen.set(k, { start: i, count: 1, last: i });
      else if (i >= entry.last + len) {
        entry.count++;
        entry.last = i;
      }
    }
    for (const { start, count } of seen.values()) {
      if (count < 2) continue;
      const score = count * len;
      if (!best || score > best.score || (score === best.score && len < best.len)) best = { start, len, count, score };
    }
  }
  if (!best) return null;
  const loop = seq.slice(best.start, best.start + best.len);
  return { numbers: loop.map((c) => c.number), symbols: loop.map((c) => c.symbol), count: best.count };
}

function listWords(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export interface SummaryInput {
  key: Key;
  guess: KeyGuess;
  alternatives: readonly KeyGuess[];
  segments: readonly ChordSegment[];
  grid: BeatGrid;
  source: SourceKind;
  /** False when the beat couldn't be found reliably (then tempo isn't mentioned). */
  steadyBeat: boolean;
}

/** Sentences describing the song, most useful first. */
export function summarize({ key, guess, alternatives, segments, grid, source, steadyBeat }: SummaryInput): Summary {
  const real = segments.filter((s): s is ChordSegment & { chord: ChordLabel } => !!s.chord);
  const total = real.reduce((s, x) => s + (x.end - x.start), 0);
  const bySymbol = new Map<string, { label: ChordLabel; time: number }>();
  for (const s of real) {
    const label = baseOf(s.chord);
    const e = bySymbol.get(label.symbol) ?? { label, time: 0 };
    e.time += s.end - s.start;
    bySymbol.set(label.symbol, e);
  }
  const chords = [...bySymbol.values()].sort((a, b) => b.time - a.time).map((e) => ({ label: e.label, share: total ? e.time / total : 0 }));
  const sentences: string[] = [];

  if (real.length === 0) {
    sentences.push(source === 'audio' ? "No chords could be heard. It may be very quiet, or mostly drums or speech." : 'No chords were found: the notes never make a chord (three or more different notes at once).');
    return { sentences, loop: null, chords };
  }

  const tonic = keyTonicPc(key);
  const home = pretty(keyLabel(key));
  const own = guess.key.mode === key.mode && keyTonicPc(guess.key) === tonic;
  if (own) {
    sentences.push(`It's in ${home}: ${pretty(noteToString(key.tonic))} is home (Sa). I'm ${sureWord(guess.confidence)} about this.`);
    const relative = alternatives.find((a) => a.key.mode !== key.mode);
    if (relative && guess.confidence < 0.75) {
      sentences.push(`It could also be ${pretty(keyLabel(relative.key))}, which uses the same notes. Whichever chord sounds most "finished" at the end is home.`);
    }
  } else {
    sentences.push(`You set the key to ${home}, so the numbers count from ${pretty(noteToString(key.tonic))} (Sa). My own guess was ${pretty(keyLabel(guess.key))}.`);
  }

  if (steadyBeat) sentences.push(`About ${Math.round(grid.bpm)} beats a minute, counted in ${grid.beatsPerBar}s.`);

  const main = chords.filter((c) => c.share >= 0.05).slice(0, 6);
  if (main.length) {
    const named = main.map((c) => `${c.label.symbol} (${c.label.number})`);
    sentences.push(`The main chord${main.length > 1 ? 's are' : ' is'} ${listWords(named)}.`);
  }

  const loop = findLoop(real.map((s) => s.chord));
  if (loop && loop.count >= 2) {
    sentences.push(`The progression ${loop.numbers.join(' – ')} (${loop.symbols.join(' ')}) repeats ${loop.count} times. Learn it and you can play along with much of the song.`);
  }

  const outside = chords.filter((c) => !c.label.inKey && c.share >= 0.02).slice(0, 3);
  if (outside.length) {
    const names = outside.map((c) => `${c.label.symbol} (${c.label.number})`);
    sentences.push(`${listWords(names)} ${outside.length > 1 ? 'are' : 'is'} from outside the key. Songs borrow chords like this for colour; the rest fit the key.`);
  }

  const changes = real.length;
  const beats = total / (60 / grid.bpm);
  if (steadyBeat && changes > 1) {
    const per = beats / changes;
    if (per >= 3.5) sentences.push(`Chords change slowly, about every ${Math.round(per / grid.beatsPerBar) <= 1 ? 'bar' : `${Math.round(per / grid.beatsPerBar)} bars`}.`);
    else if (per <= 2.2) sentences.push('Chords change quickly, about every two beats or faster.');
  }

  if (source === 'audio') sentences.push('This came from an audio recording, so treat the chords as guesses: play each one, and fix any that sound wrong.');
  else {
    const unsure = real.filter((s) => s.confidence < 0.5).length;
    if (unsure > 0) sentences.push(`${unsure} chord${unsure > 1 ? 's are' : ' is'} marked unsure: the notes there fit more than one chord. Tap to hear and change them.`);
  }
  return { sentences, loop, chords };
}
