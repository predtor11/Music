/**
 * Saying what you played in plain words: the key, the chords as names and
 * numbers, the loop you kept coming back to, chords from outside the key, and
 * how far your left hand had to jump.
 */

import type { NoteNaming, Take } from '@music/contracts';
import { chordType, keyLabel, keyName, keyTonicPc, midiName, pretty, sargam, type Key, type PitchClass } from '@music/theory';
import type { Analysis, ChordSpan, NamedChord } from './chords.js';

/** A chord's name in the learner's note naming: "G", "Pa", or "G (Pa)". */
export function chordLabel(chord: NamedChord, key: Key, naming: NoteNaming): string {
  const western = pretty(chord.symbol);
  if (naming === 'western') return western;
  const syllable = sargam(chord.rootPc, keyTonicPc(key)).label;
  const shape = chord.quality === 'major' ? '' : chord.quality === 'minor' ? ' minor' : ` ${chordType(chord.quality).name}`;
  const s = syllable + shape;
  return naming === 'sargam' ? s : `${western} (${s})`;
}

const SUPERSCRIPT: Readonly<Record<string, string>> = { '6': '⁶', '7': '⁷', '9': '⁹' };

/**
 * A chord's number for reading: "5⁷" rather than "57", so a dominant 7th on
 * the 5 doesn't read as fifty-seven. Other numbers stay as they are ("6m7").
 */
export function chordNumber(chord: NamedChord): string {
  return chord.nashville.replace(/^([b#]*\d)([679])/, (_, degree: string, ext: string) => degree + SUPERSCRIPT[ext]!);
}

/** "1:05" */
export function formatTime(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Chord changes only: the same chord twice in a row (across a rest) counts once. */
export function chordSequence(spans: readonly ChordSpan[]): NamedChord[] {
  const out: NamedChord[] = [];
  for (const s of spans) {
    if (!s.chord) continue;
    if (out[out.length - 1]?.symbol !== s.chord.symbol) out.push(s.chord);
  }
  return out;
}

/** Nashville number without the slash bass, for matching progressions: "6m", "5", "4". */
const rootNumber = (c: NamedChord) => c.nashville.split('/')[0]!;

/** Well-known progressions, written in Nashville numbers. */
const KNOWN: ReadonlyArray<{ steps: string[]; name: string; about: string }> = [
  { steps: ['1', '5', '6m', '4'], name: 'the 1-5-6-4', about: 'the most used progression in pop songs' },
  { steps: ['1', '6m', '4', '5'], name: 'the 1-6-4-5', about: 'the "50s progression" from doo-wop and old ballads' },
  { steps: ['6m', '4', '1', '5'], name: 'the 6-4-1-5', about: 'the 1-5-6-4 started from the 6, which makes it sound sadder' },
  { steps: ['1', '4', '6m', '5'], name: 'the 1-4-6-5', about: 'a common pop and worship progression' },
  { steps: ['2m', '5', '1'], name: 'a two-five-one (2-5-1)', about: 'the cadence jazz musicians talk about most' },
  { steps: ['2m7', '57', '1maj7'], name: 'a two-five-one (2-5-1)', about: 'the cadence jazz musicians talk about most' },
  { steps: ['1', '4', '5'], name: 'the 1-4-5', about: 'the "three-chord trick" behind rock and roll and folk songs' },
  { steps: ['1', '4'], name: 'a 1-4 back and forth', about: 'a gentle sway used in gospel and pop' },
  { steps: ['1', '5'], name: 'a 1-5 back and forth', about: 'home and away, the simplest progression there is' },
  { steps: ['6m', '4', '5'], name: 'the 6-4-5', about: 'a minor-sounding climb that sets up the 1' },
  { steps: ['1m', '6', '7'], name: 'the minor 1-6-7', about: 'the classic minor-key rock and film progression' },
];

function isRotation(loop: readonly string[], steps: readonly string[]): boolean {
  if (loop.length !== steps.length) return false;
  const doubled = [...loop, ...loop].join(' ');
  return ` ${doubled} `.includes(` ${steps.join(' ')} `);
}

export interface Loop {
  chords: NamedChord[];
  /** Times it was played through, back to back. */
  times: number;
  known: { name: string; about: string } | null;
}

/** The chord loop you came back to most, if any was played twice in a row. */
export function findLoop(sequence: readonly NamedChord[]): Loop | null {
  let best: Loop | null = null;
  for (const len of [4, 3, 2]) {
    for (let start = 0; start + len * 2 <= sequence.length; start++) {
      const pattern = sequence.slice(start, start + len);
      if (new Set(pattern.map((c) => c.symbol)).size < len) continue;
      let times = 1;
      while (sequence.slice(start + times * len, start + (times + 1) * len).map((c) => c.symbol).join() === pattern.map((c) => c.symbol).join()) times++;
      if (times < 2) continue;
      if (!best || times * len > best.times * best.chords.length) best = { chords: pattern, times, known: null };
    }
  }
  if (!best) return null;
  const nums = best.chords.map(rootNumber);
  const known = KNOWN.find((k) => k.steps.join() === nums.join()) ?? KNOWN.find((k) => isRotation(nums, k.steps));
  return { ...best, known: known ? { name: known.name, about: known.about } : null };
}

/** A known progression played straight through at least once (not looped). */
function findKnown(sequence: readonly NamedChord[]): (typeof KNOWN)[number] | null {
  const nums = sequence.map(rootNumber).join(' ');
  return KNOWN.find((k) => k.steps.length >= 3 && ` ${nums} `.includes(` ${k.steps.join(' ')} `)) ?? null;
}

export interface LeftHand {
  /** Biggest move of the lowest note from one chord to the next, in half steps. */
  biggestJump: number;
  from: string;
  to: string;
  at: number;
  /** Chord changes per minute. */
  changesPerMinute: number;
}

/** How the bass (your left hand, below middle C) moved between chords. */
export function leftHand(take: Take, spans: readonly ChordSpan[]): LeftHand | null {
  const chords = spans.filter((s) => s.chord);
  if (chords.length < 2) return null;
  const lowest = (s: ChordSpan) => {
    const starts = take.notes.filter((n) => n.start >= s.start - 50 && n.start < s.start + 300 && n.midi < 60);
    return starts.length ? Math.min(...starts.map((n) => n.midi)) : null;
  };
  let best: LeftHand | null = null;
  for (let i = 1; i < chords.length; i++) {
    const a = lowest(chords[i - 1]!);
    const b = lowest(chords[i]!);
    if (a === null || b === null) continue;
    const jump = Math.abs(b - a);
    if (!best || jump > best.biggestJump) best = { biggestJump: jump, from: midiName(a, 'flat'), to: midiName(b, 'flat'), at: chords[i]!.start, changesPerMinute: 0 };
  }
  if (!best) return null;
  const minutes = Math.max(1 / 60, (chords[chords.length - 1]!.end - chords[0]!.start) / 60_000);
  return { ...best, changesPerMinute: Math.round((chords.length - 1) / minutes) };
}

function list(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export interface Summary {
  headline: string;
  points: string[];
}

/** What you played, in plain English. */
export function summarise(analysis: Analysis, take: Take, naming: NoteNaming = 'western'): Summary {
  const { key, detected } = analysis;
  const label = (c: NamedChord) => chordLabel(c, key, naming);
  const number = chordNumber;
  const keyText = pretty(keyLabel(key));
  if (take.notes.length === 0) return { headline: 'Nothing was recorded yet.', points: [] };

  const points: string[] = [];
  let headline: string;
  if (analysis.keyFromUser) headline = `You told the app this is in ${keyText}.`;
  else if (!detected || detected.confidence === 'clear') headline = `You played in ${keyText}.`;
  else {
    const other = detected.others[0]!;
    headline =
      detected.confidence === 'likely'
        ? `You most likely played in ${keyText}.`
        : `This sounds like ${keyText}, though ${pretty(other.label)} is close.`;
  }
  const sa = pretty(keyName(key).replace(/m$/, ''));
  points.push(`Tell the band "it's in ${pretty(keyName(key)).replace(/m$/, ' minor')}". In sargam, Sa is ${sa}.`);

  const sequence = chordSequence(analysis.spans);
  const distinct = [...new Map(sequence.map((c) => [c.symbol, c])).values()];
  if (distinct.length === 0) {
    points.push('There were no chords to name: you played single notes (a melody). Hold two or three keys together and the app will name them.');
    return { headline, points };
  }
  points.push(
    `You used ${distinct.length === 1 ? 'one chord' : `${distinct.length} different chords`}: ${list(distinct.map(label))}. As numbers in the key that is ${list(distinct.map(number))}.`,
  );

  const loop = findLoop(sequence);
  if (loop) {
    const shown = loop.chords.map(number).join(' - ');
    points.push(
      loop.known
        ? `Your main loop was ${shown} (${loop.chords.map(label).join(', ')}), played ${loop.times} times. That's ${loop.known.name}, ${loop.known.about}.`
        : `Your main loop was ${shown} (${loop.chords.map(label).join(', ')}), played ${loop.times} times.`,
    );
  } else {
    const known = findKnown(sequence);
    if (known) points.push(`You played ${known.name}: ${known.about}.`);
  }

  const outside = distinct.filter((c) => !c.inKey);
  if (outside.length > 0) {
    points.push(
      `${list(outside.map(label))} ${outside.length === 1 ? 'is' : 'are'} not in ${keyText} (${list(outside.map(number))}). Chords from outside the key add colour; musicians call them borrowed or chromatic chords.`,
    );
  }

  const last = sequence[sequence.length - 1]!;
  const tonic: PitchClass = keyTonicPc(key);
  if (last.rootPc === tonic) points.push(`You ended on the 1 chord (${label(last)}), which is why it sounds finished.`);
  else if (number(last).startsWith('5')) points.push(`You ended on the 5 chord (${label(last)}), which leaves it hanging, waiting to go home to the 1.`);

  const melodyOnly = analysis.spans.filter((s) => !s.chord && s.end - s.start >= 2000);
  if (melodyOnly.length > 0) {
    const s = melodyOnly[0]!;
    points.push(`From ${formatTime(s.start)} to ${formatTime(s.end)} you played single notes only (melody), so there was no chord to name there.`);
  }

  const hand = leftHand(take, analysis.spans);
  if (hand && hand.biggestJump >= 9) {
    points.push(
      `Your biggest left-hand jump was ${hand.biggestJump} half steps, from ${pretty(hand.from)} to ${pretty(hand.to)} at ${formatTime(hand.at)}. If jumps like that are hard, keep your left hand in one place and play the next chord as an inversion (the same notes in a different order).`,
    );
  }

  const corrected = analysis.spans.filter((s) => s.corrected).length;
  if (corrected > 0) points.push(`${corrected === 1 ? 'One chord was' : `${corrected} chords were`} set by you.`);
  return { headline, points };
}

/** The chord chart: one box per chord change, four to a line, like a band's chart. */
export function chordChart(spans: readonly ChordSpan[], perLine = 4): Array<Array<ChordSpan>> {
  const changes: ChordSpan[] = [];
  for (const s of spans) {
    const last = changes[changes.length - 1];
    if (last && (last.chord?.symbol ?? null) === (s.chord?.symbol ?? null)) continue;
    changes.push(s);
  }
  const rows: ChordSpan[][] = [];
  for (let i = 0; i < changes.length; i += perLine) rows.push(changes.slice(i, i + perLine));
  return rows;
}
