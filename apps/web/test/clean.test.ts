import { parseMidi } from '@music/theory';
import type { Take } from '@music/contracts';
import { describe, expect, it } from 'vitest';
import { analyseTake } from '../src/record/take.js';
import {
  applyChanges,
  cleanContext,
  nearestGridTime,
  snapSummary,
  snapToBeat,
  suggestCleanup,
  toEditNotes,
  withNotes,
  type EditNote,
  type Sensitivity,
} from '../src/record/clean.js';

type Spec = [names: string, startMs: number, durationMs: number, velocity?: number];

/** A take from [names, start, length, velocity] rows. */
function take(rows: Spec[], extra: Partial<Take> = {}): Take {
  const notes = rows.flatMap(([names, startMs, durationMs, velocity = 85]) =>
    names.split(' ').map((n) => ({ midi: parseMidi(n)!, velocity, startMs, durationMs })),
  );
  const durationMs = Math.max(...notes.map((n) => n.startMs + n.durationMs)) + 300;
  return { notes: notes.sort((a, b) => a.startMs - b.startMs), pedal: [], durationMs, ...extra };
}

/** The 1-5-6-4 in G, a second a chord, with a simple melody over it. */
const MUSIC: Spec[] = [
  ['G2 B3 D4', 0, 950, 80], ['B4', 0, 450, 90], ['D5', 500, 450, 88],
  ['D3 F#3 A3', 1000, 950, 78], ['A4', 1000, 450, 90], ['F#4', 1500, 450, 86],
  ['E3 G3 B3', 2000, 950, 80], ['B4', 2000, 450, 92], ['G4', 2500, 450, 88],
  ['C3 E3 G3', 3000, 950, 78], ['E5', 3000, 450, 90], ['C5', 3500, 450, 86],
];

/** Mistakes a player makes, each tagged with what it is. */
const MISTAKES: Array<{ name: string; rows: Spec[] }> = [
  // C5 grazed while playing B4 at 2000 ms.
  { name: 'grazed neighbour', rows: [['C5', 2012, 55, 22]] },
  // A key brushed for a blink, outside the key.
  { name: 'blip', rows: [['G#3', 1700, 25, 30]] },
  // A barely touched wrong note.
  { name: 'quiet wrong note', rows: [['D#4', 2200, 200, 16]] },
];

const CLEAN = take(MUSIC);
const messy = take([...MUSIC, ...MISTAKES.flatMap((m) => m.rows)]);

function suggestions(t: Take, sensitivity: Sensitivity = 'normal') {
  const notes = toEditNotes(t);
  const analysis = analyseTake(t, 'x', null, []);
  return { notes, list: suggestCleanup(notes, cleanContext(analysis, analysis.key.key), sensitivity) };
}

describe('auto-clean', () => {
  it('finds the stray notes in a messy take and leaves every real note alone', () => {
    const { notes, list } = suggestions(messy);
    const removed = new Set(list.filter((s) => s.kind === 'remove').flatMap((s) => s.noteIds));
    const strays = notes.filter((n) => [parseMidi('C5')! + 0, parseMidi('G#3')!, parseMidi('D#4')!].includes(n.midi) && (n.durationMs < 250 && n.velocity < 40));
    expect(strays).toHaveLength(3);
    for (const s of strays) expect(removed.has(s.id)).toBe(true);
    expect(removed.size).toBe(3);
    const cleaned = applyChanges(notes, list.flatMap((s) => s.changes));
    expect(cleaned).toHaveLength(CLEAN.notes.length);
    expect(withNotes(messy, cleaned).notes).toEqual(CLEAN.notes);
  });

  it('suggests nothing for a take with no mistakes', () => {
    expect(suggestions(CLEAN).list).toEqual([]);
  });

  it('keeps a loud staccato note, a long out-of-key note and a chord from outside the key', () => {
    const t = take([
      ...MUSIC,
      // Staccato: short but played hard, in the key.
      ['G5', 3800, 60, 100],
      // A chromatic note held on purpose.
      ['A#4', 2600, 400, 70],
      // Borrowed bVII (F) chord, played firmly.
      ['F2 A3 C4', 4000, 500, 80],
    ]);
    const { list } = suggestions(t);
    expect(list.filter((s) => s.kind === 'remove')).toEqual([]);
  });

  it('joins double hits, even when one is a blink long', () => {
    const t = take([...MUSIC, ['D5', 4000, 300, 80], ['D5', 4040, 250, 60]]);
    const { notes, list } = suggestions(t);
    const merge = list.find((s) => s.kind === 'merge')!;
    expect(merge).toBeDefined();
    const after = applyChanges(notes, merge.changes);
    const joined = after.filter((n) => n.midi === parseMidi('D5')! && n.startMs === 4000);
    expect(joined).toHaveLength(1);
    expect(joined[0]).toMatchObject({ startMs: 4000, durationMs: 300, velocity: 80 });
    expect(after).toHaveLength(notes.length - 1);
  });

  it('does not join the same key played again at a normal speed', () => {
    const t = take([...MUSIC, ['D5', 4000, 150, 80], ['D5', 4250, 150, 80]]);
    expect(suggestions(t).list.filter((s) => s.kind === 'merge' || s.kind === 'trim')).toEqual([]);
  });

  it('trims a tiny overlap of the same key', () => {
    const t = take([...MUSIC, ['A4', 4000, 520, 80], ['A4', 4450, 300, 80]]);
    const { notes, list } = suggestions(t);
    const trim = list.find((s) => s.kind === 'trim')!;
    const after = applyChanges(notes, trim.changes);
    expect(after.find((n) => n.id === trim.noteIds[0])!.durationMs).toBe(450);
  });

  it('offers to move a short slip to the key next to it, only as a maybe', () => {
    // A short A-sharp, played firmly: not quiet and not tiny, so only a "maybe".
    const t = take([...MUSIC, ['A#4', 4000, 200, 80]]);
    const { notes, list } = suggestions(t);
    const fix = list.find((s) => s.kind === 'fix-pitch')!;
    expect(fix.confidence).toBe('maybe');
    const after = applyChanges(notes, fix.changes);
    expect([parseMidi('A4')!, parseMidi('B4')!]).toContain(after.find((n) => n.id === fix.noteIds[0])!.midi);
  });

  it('is gentler or stricter by sensitivity', () => {
    const t = take([...MUSIC, ['D#4', 4000, 80, 70]]);
    const count = (s: Sensitivity) => suggestions(t, s).list.filter((x) => x.kind === 'remove').length;
    expect(count('gentle')).toBeLessThanOrEqual(count('normal'));
    expect(count('normal')).toBeLessThanOrEqual(count('strong'));
  });

  it('explains each suggestion in plain words', () => {
    for (const s of suggestions(messy).list) {
      expect(s.title.length).toBeGreaterThan(5);
      expect(s.why).toMatch(/[.]$/);
    }
  });
});

describe('snap to the beat', () => {
  // 120 beats a minute: a beat every 500 ms. Eighth notes with a loose hand.
  const beats = Array.from({ length: 20 }, (_, i) => i * 0.5);
  const jitter = [18, -25, 31, -12, 0, 22, -30, 9];
  const loose: EditNote[] = jitter.map((j, i) => ({ id: i + 1, midi: 60 + i, velocity: 80, startMs: i * 250 + j + 1000, durationMs: 200 }));

  it('finds the nearest grid line, inside the beats and past their ends', () => {
    expect(nearestGridTime(1.03, beats, 120, 2)).toBeCloseTo(1.0);
    expect(nearestGridTime(1.2, beats, 120, 2)).toBeCloseTo(1.25);
    expect(nearestGridTime(1.2, beats, 120, 1)).toBeCloseTo(1.0);
    expect(nearestGridTime(12.07, beats, 120, 2)).toBeCloseTo(12.0);
    expect(nearestGridTime(-0.01, beats, 120, 2)).toBeCloseTo(0);
  });

  it('puts notes on the grid at full strength, halfway at half, and leaves them at zero', () => {
    const grid = { beats, bpm: 120, division: 2 as const };
    const full = snapToBeat(loose, { ...grid, strength: 1 });
    full.forEach((n, i) => expect(n.startMs).toBe(1000 + i * 250));
    const half = snapToBeat(loose, { ...grid, strength: 0.5 });
    half.forEach((n, i) => expect(Math.abs(n.startMs - (1000 + i * 250))).toBeLessThanOrEqual(Math.ceil(Math.abs(jitter[i]!) / 2)));
    expect(snapToBeat(loose, { ...grid, strength: 0 })).toEqual(loose);
    // Lengths and pitches never change.
    expect(full.map((n) => [n.midi, n.durationMs])).toEqual(loose.map((n) => [n.midi, n.durationMs]));
  });

  it('reports what a snap would do', () => {
    const after = snapToBeat(loose, { beats, bpm: 120, division: 2, strength: 1 });
    const { moved, averageMs } = snapSummary(loose, after);
    expect(moved).toBe(7);
    expect(averageMs).toBeGreaterThan(15);
  });

  it('never moves a note before the start of the take', () => {
    const early: EditNote[] = [{ id: 1, midi: 60, velocity: 80, startMs: 10, durationMs: 100 }];
    expect(snapToBeat(early, { beats, bpm: 120, division: 4, strength: 1 })[0]!.startMs).toBe(0);
  });
});

describe('editing helpers', () => {
  it('puts notes back in playing order and grows the take to fit', () => {
    const t = take([['C4', 0, 200]]);
    const notes: EditNote[] = [
      { id: 2, midi: 64, velocity: 80, startMs: 500, durationMs: 100 },
      { id: 1, midi: 60, velocity: 80, startMs: 0, durationMs: 9000 },
    ];
    const out = withNotes(t, notes);
    expect(out.notes.map((n) => n.midi)).toEqual([60, 64]);
    expect(out.durationMs).toBe(9000);
  });
});
