/**
 * Cleaning up a take. Everything here works on the notes as numbers (no AI, no
 * paid service) and only ever *suggests*: each suggestion is a list of small
 * changes the learner can accept or skip, and accepting is one undo step.
 *
 *  - Stray notes: a key grazed or a finger slip. Judged by how short and how
 *    quiet the note is, whether a harder-struck neighbour next to it was the
 *    key that was meant, and whether it is outside both the key and the chord
 *    playing at that moment. One reason alone is never enough, so a short
 *    staccato note or a chord from outside the key is left alone.
 *  - Double hits: the same key struck twice within a blink, joined into one.
 *  - Tiny overlaps: the same key starting again before it ended, trimmed.
 *  - Snap to the beat: moves note starts toward a beat grid, as much as the
 *    learner chooses.
 *
 * The key and chords come from @music/analysis, the same analyser as the rest
 * of the app.
 */

import { keyScalePcs, type Analysis } from '@music/analysis';
import { MAX_TAKE_MS, type Take } from '@music/contracts';
import { chordPitchClasses, keyTonicPc, mod12, type Key } from '@music/theory';

/** A note in the editor: the take's note plus an id that stays with it through every edit. */
export interface EditNote {
  id: number;
  midi: number;
  velocity: number;
  startMs: number;
  durationMs: number;
}

export function toEditNotes(take: Take, firstId = 1): EditNote[] {
  return take.notes.map((n, i) => ({ id: firstId + i, ...n }));
}

/** The take with these notes, in playing order. The length grows if a note now ends after it. */
export function withNotes(take: Take, notes: readonly EditNote[]): Take {
  const sorted = notes
    .map(({ id: _id, ...n }) => n)
    .sort((a, b) => a.startMs - b.startMs || a.midi - b.midi);
  const end = sorted.reduce((m, n) => Math.max(m, n.startMs + n.durationMs), 0);
  return { ...take, notes: sorted, durationMs: Math.min(MAX_TAKE_MS, Math.max(take.durationMs, Math.ceil(end))) };
}

export type Sensitivity = 'gentle' | 'normal' | 'strong';
const SCALE: Record<Sensitivity, number> = { gentle: 0.6, normal: 1, strong: 1.5 };

export type SuggestionKind = 'remove' | 'merge' | 'trim' | 'fix-pitch';

/** One small change: drop a note, or set some of its fields. */
export interface Change {
  id: number;
  remove?: true;
  set?: Partial<Pick<EditNote, 'midi' | 'startMs' | 'durationMs' | 'velocity'>>;
}

export interface Suggestion {
  /** Stable for the same note ids and kind, so a skipped suggestion stays skipped. */
  key: string;
  kind: SuggestionKind;
  /** "likely" is sure enough to accept in bulk; "maybe" is left for the learner to judge. */
  confidence: 'likely' | 'maybe';
  title: string;
  why: string;
  /** The notes it is about, for highlighting. */
  noteIds: number[];
  changes: Change[];
}

/** What the cleaner needs to know about the music: the key and the chord sounding at each moment. */
export interface CleanContext {
  scale: ReadonlySet<number>;
  chordAt(ms: number): ReadonlySet<number> | null;
}

export function cleanContext(analysis: Analysis, key: Key): CleanContext {
  const scale = keyScalePcs(key);
  // A minor key's raised 7th is part of its harmony.
  if (key.mode === 'minor') scale.add(mod12(keyTonicPc(key) + 11));
  return {
    scale,
    chordAt(ms) {
      const t = ms / 1000;
      const seg = analysis.segments.find((s) => t >= s.start && t < s.end);
      return seg?.chord ? new Set(chordPitchClasses(seg.chord.rootPc, seg.chord.quality)) : null;
    },
  };
}

export const applyChanges = (notes: readonly EditNote[], changes: readonly Change[]): EditNote[] => {
  const by = new Map(changes.map((c) => [c.id, c]));
  return notes.flatMap((n) => {
    const c = by.get(n.id);
    if (!c) return [n];
    return c.remove ? [] : [{ ...n, ...c.set }];
  });
};

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const noteName = (midi: number) => `${NAMES[mod12(midi)]}${Math.floor(midi / 12) - 1}`;
const ms = (x: number) => `${Math.round(x)} ms`;
const at = (n: EditNote) => `${noteName(n.midi)} at ${(n.startMs / 1000).toFixed(1)}s`;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : 0;
};

/** Notes that were most likely not meant, double hits and tiny overlaps, best first. */
export function suggestCleanup(notes: readonly EditNote[], ctx: CleanContext, sensitivity: Sensitivity = 'normal'): Suggestion[] {
  const k = SCALE[sensitivity];
  const tinyMs = 35 * k;
  const shortMs = 90 * k;
  const quietRatio = 0.35 * k;
  const sorted = [...notes].sort((a, b) => a.startMs - b.startMs || a.midi - b.midi);
  const medVelocity = median(sorted.map((n) => n.velocity));
  const out: Suggestion[] = [];
  const claimed = new Set<number>();

  // Stray notes.
  for (const n of sorted) {
    // A note held this long was played on purpose, however it sounds.
    if (n.durationMs >= 300) continue;
    const reasons: string[] = [];
    let points = 0;
    if (n.durationMs < tinyMs) {
      points += 2;
      reasons.push(`it lasts only ${ms(n.durationMs)}`);
    } else if (n.durationMs < shortMs) {
      points += 1;
      reasons.push(`it is very short (${ms(n.durationMs)})`);
    }
    if (n.velocity <= Math.max(14, medVelocity * quietRatio)) {
      points += 1;
      reasons.push('it was hardly pressed');
    }
    const meant = sorted.find(
      (m) =>
        m !== n &&
        Math.abs(m.midi - n.midi) === 1 &&
        Math.abs(m.startMs - n.startMs) <= 50 &&
        m.velocity > n.velocity * 1.4 &&
        m.durationMs >= n.durationMs,
    );
    if (meant) {
      points += 1.5;
      reasons.push(`it sounds with a harder ${noteName(meant.midi)}, the key next to it`);
    }
    const chord = ctx.chordAt(n.startMs + n.durationMs / 2);
    const outside = !ctx.scale.has(mod12(n.midi)) && !chord?.has(mod12(n.midi));
    if (outside) {
      points += 1;
      reasons.push('it is not in the key or the chord');
    }
    if (points < 2) continue;
    claimed.add(n.id);
    out.push({
      key: `remove:${n.id}`,
      kind: 'remove',
      confidence: points >= 3 ? 'likely' : 'maybe',
      title: `Remove ${at(n)}`,
      why: `${reasons[0]![0]!.toUpperCase()}${reasons[0]!.slice(1)}${reasons.length > 1 ? `, ${reasons.slice(1).join(', ')}` : ''}.`,
      noteIds: [n.id],
      changes: [{ id: n.id, remove: true }],
    });
  }

  // Double hits and overlaps, among the notes that stay.
  const kept = sorted.filter((n) => !claimed.has(n.id));
  const byKey = new Map<number, EditNote[]>();
  for (const n of kept) byKey.set(n.midi, [...(byKey.get(n.midi) ?? []), n]);
  for (const list of byKey.values()) {
    for (let i = 0; i + 1 < list.length; i++) {
      const a = list[i]!;
      const b = list[i + 1]!;
      if (claimed.has(a.id) || claimed.has(b.id)) continue;
      const gap = b.startMs - (a.startMs + a.durationMs);
      if (b.startMs - a.startMs <= 70 * k && gap <= 40) {
        claimed.add(a.id).add(b.id);
        out.push({
          key: `merge:${a.id}:${b.id}`,
          kind: 'merge',
          confidence: 'likely',
          title: `Join the double hit on ${at(a)}`,
          why: `${noteName(a.midi)} was struck twice within ${ms(b.startMs - a.startMs)}, probably one press.`,
          noteIds: [a.id, b.id],
          changes: [
            { id: a.id, set: { durationMs: Math.max(a.startMs + a.durationMs, b.startMs + b.durationMs) - a.startMs, velocity: Math.max(a.velocity, b.velocity) } },
            { id: b.id, remove: true },
          ],
        });
      } else if (gap < 0 && -gap <= 120) {
        claimed.add(a.id);
        out.push({
          key: `trim:${a.id}`,
          kind: 'trim',
          confidence: 'likely',
          title: `Fix the overlap on ${at(a)}`,
          why: `${noteName(a.midi)} starts again ${ms(-gap)} before the first one ends, so the first is shortened to end where the second starts.`,
          noteIds: [a.id, b.id],
          changes: [{ id: a.id, set: { durationMs: Math.max(1, b.startMs - a.startMs) } }],
        });
      }
    }
  }

  // A short slip next to a note of the key: move it there.
  for (const n of kept) {
    if (claimed.has(n.id) || n.durationMs >= 250) continue;
    const pc = mod12(n.midi);
    const chord = ctx.chordAt(n.startMs + n.durationMs / 2);
    if (ctx.scale.has(pc) || chord?.has(pc)) continue;
    const fits = (m: number) => ctx.scale.has(mod12(m)) || Boolean(chord?.has(mod12(m)));
    const targets = [n.midi - 1, n.midi + 1].filter(fits);
    if (targets.length === 0) continue;
    // A chord note is the likelier intention.
    const target = targets.find((m) => chord?.has(mod12(m))) ?? targets[0]!;
    out.push({
      key: `fix-pitch:${n.id}`,
      kind: 'fix-pitch',
      confidence: 'maybe',
      title: `Move ${at(n)} to ${noteName(target)}`,
      why: `${noteName(n.midi)} is not in the key or the chord. It may have been ${noteName(target)}, the key next to it. Skip this if the note is on purpose.`,
      noteIds: [n.id],
      changes: [{ id: n.id, set: { midi: target } }],
    });
  }

  return out.sort((a, b) => Number(b.confidence === 'likely') - Number(a.confidence === 'likely') || (notes.find((n) => n.id === a.noteIds[0])?.startMs ?? 0) - (notes.find((n) => n.id === b.noteIds[0])?.startMs ?? 0));
}

/** The grid line nearest `t` (seconds), with `division` lines per beat. */
export function nearestGridTime(t: number, beats: readonly number[], bpm: number, division: number): number {
  const period = 60 / bpm;
  const last = beats.length - 1;
  if (last < 0) return t;
  if (t <= beats[0]! || t >= beats[last]!) {
    const origin = t <= beats[0]! ? beats[0]! : beats[last]!;
    const step = period / division;
    return origin + Math.round((t - origin) / step) * step;
  }
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (beats[mid]! <= t) lo = mid;
    else hi = mid;
  }
  const step = (beats[lo + 1]! - beats[lo]!) / division;
  return beats[lo]! + Math.round((t - beats[lo]!) / step) * step;
}

export interface SnapOptions {
  beats: readonly number[];
  bpm: number;
  /** Grid lines per beat: 1 (quarter notes), 2 (eighths), 4 (sixteenths). */
  division: 1 | 2 | 4;
  /** 0 leaves every note where it was; 1 puts each exactly on the grid. */
  strength: number;
}

/** Note starts moved toward the grid by `strength`; lengths stay the same. */
export function snapToBeat(notes: readonly EditNote[], opts: SnapOptions): EditNote[] {
  if (opts.strength <= 0) return [...notes];
  return notes.map((n) => {
    const target = nearestGridTime(n.startMs / 1000, opts.beats, opts.bpm, opts.division) * 1000;
    const start = Math.max(0, Math.round(n.startMs + (target - n.startMs) * opts.strength));
    return start === n.startMs ? n : { ...n, startMs: start };
  });
}

/** How many notes a snap would move and by how much on average, for the preview. */
export function snapSummary(before: readonly EditNote[], after: readonly EditNote[]): { moved: number; averageMs: number } {
  const byId = new Map(before.map((n) => [n.id, n]));
  let moved = 0;
  let total = 0;
  for (const n of after) {
    const d = Math.abs(n.startMs - (byId.get(n.id)?.startMs ?? n.startMs));
    if (d > 0) {
      moved += 1;
      total += d;
    }
  }
  return { moved, averageMs: moved ? total / moved : 0 };
}
