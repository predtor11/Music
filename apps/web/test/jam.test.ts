import { readFileSync } from 'node:fs';
import { BandTalkSchema } from '@music/contracts';
import { C_MAJOR, chordFromNumeral, parseKey, pitchClass } from '@music/theory';
import { describe, expect, it } from 'vitest';
import { exampleSteps, searchText } from '../src/bandtalk/example.js';
import { PRESETS, STYLES, bassNote, beatEvents, chordsFor, fitFor, fitOf, parseProgression, position, voiceChord } from '../src/jam/logic.js';
import { parseRoute, href } from '../src/router.js';

const G = parseKey('G')!;
const chord = (n: string, key = C_MAJOR) => chordFromNumeral(n, key)!;

describe('jam progressions', () => {
  it('reads numbers, Roman numerals and dashes', () => {
    expect(parseProgression('1-5-6-4', G).chords.map((c) => c.chord.symbol)).toEqual(['G', 'D', 'Em', 'C']);
    expect(parseProgression('ii7, V7 Imaj7', C_MAJOR).chords.map((c) => c.chord.symbol)).toEqual(['Dm7', 'G7', 'Cmaj7']);
    expect(parseProgression('1 ♭7 4', C_MAJOR).chords.map((c) => c.chord.symbol)).toEqual(['C', 'Bb', 'F']);
    expect(parseProgression('1 9 x 4', C_MAJOR)).toMatchObject({ bad: ['9', 'x'] });
  });

  it('has presets that all spell in every key', () => {
    for (const p of PRESETS) expect(chordsFor(p.numerals, G)).toHaveLength(p.numerals.length);
    for (const p of PRESETS) if (p.style) expect(STYLES.map((s) => s.id)).toContain(p.style);
  });

  it('knows where it is in the progression', () => {
    expect(position(-2, 4, 4)).toMatchObject({ countIn: true, index: 0 });
    expect(position(0, 4, 4)).toMatchObject({ index: 0, beatInChord: 0, beatsLeft: 4, changing: true });
    expect(position(7, 4, 4)).toMatchObject({ index: 1, beatInChord: 3, beatsLeft: 1, changing: false });
    expect(position(16, 4, 4)).toMatchObject({ index: 0, changing: true });
    expect(position(5, 3, 2)).toMatchObject({ index: 2, beatInChord: 1 });
  });
});

describe('the band', () => {
  it('voices chords below the right hand and moves as little as it can', () => {
    const c = voiceChord(chord('1'), null);
    expect(c.map(pitchClass).sort()).toEqual([0, 4, 7]);
    for (const n of c) expect(n).toBeGreaterThanOrEqual(52);
    const f = voiceChord(chord('4'), c);
    expect(f.map(pitchClass).sort((a, b) => a - b)).toEqual([0, 5, 9]);
    // From C E G, the nearest F chord is C F A, not a jump to F A C up high.
    expect(Math.abs(f[0]! - c[0]!)).toBeLessThanOrEqual(5);
  });

  it('plays the slash note in the bass, around C2', () => {
    expect(bassNote(chord('1'))).toBe(36);
    expect(bassNote(chord('5/7'))).toBe(47);
    expect(bassNote(chord('6', G))).toBe(40);
  });

  it('hits every new chord, and never lets one ring into the next', () => {
    for (const style of STYLES.map((s) => s.id)) {
      for (let beat = 0; beat < 8; beat++) {
        const e = beatEvents(style, beat, 2, chord('1'));
        if (beat % 2 === 0) expect(e.bass.some((b) => b.at === 0)).toBe(true);
        const left = 2 - (beat % 2);
        for (const c of [...e.chords, ...e.bass]) expect(c.at + c.dur).toBeLessThanOrEqual(left);
      }
    }
  });

  it('keeps the backbeat: snare on 2 and 4, on 3 in half time, a kick on every beat for four on the floor', () => {
    const snares = (style: Parameters<typeof beatEvents>[0]) => [0, 1, 2, 3].filter((b) => beatEvents(style, b, 4, chord('1')).drums.some((d) => d.drum === 'snare'));
    expect(snares('pop')).toEqual([1, 3]);
    expect(snares('half-time')).toEqual([2]);
    expect([0, 1, 2, 3].every((b) => beatEvents('four-on-the-floor', b, 4, chord('1')).drums.some((d) => d.drum === 'kick' && d.at === 0))).toBe(true);
  });

  it('marks what fits: the chord, then the key', () => {
    const fit = fitFor(chord('5', G), G);
    expect(fitOf(62, fit)).toBe('chord');
    expect(fitOf(64, fit)).toBe('scale');
    expect(fitOf(65, fit)).toBe('outside');
  });
});

describe('jam links', () => {
  it('round-trips a preset through the address', () => {
    const setup = { numerals: ['ii7', 'V7', 'Imaj7'], key: 'Bb', style: 'ballad' as const, beatsPerChord: 2, bpm: 80 };
    expect(parseRoute(href.jam(setup))).toEqual({ page: 'jam', setup });
    expect(parseRoute('#/jam')).toEqual({ page: 'jam', setup: { numerals: undefined, key: undefined, style: undefined, beatsPerChord: undefined, bpm: undefined } });
    expect(parseRoute('#/jam?style=polka')).toMatchObject({ setup: { style: undefined } });
    expect(parseRoute('#/bandtalk/capo')).toEqual({ page: 'bandtalk', id: 'capo' });
  });
});

describe('band-talk examples', () => {
  const terms = BandTalkSchema.parse(JSON.parse(readFileSync(new URL('../../../services/curriculum/content/bandtalk.json', import.meta.url), 'utf8')));

  it('spell every step and fit a 25-key keyboard', () => {
    for (const t of terms) {
      const steps = exampleSteps(t);
      expect(steps.length, t.id).toBe(t.example.steps.length);
      for (const st of steps) for (const n of st.notes) expect([t.id, n >= 48 && n <= 72]).toEqual([t.id, true]);
    }
  });

  it('labels chords with their number, and the key when it changes', () => {
    const up = exampleSteps(terms.find((t) => t.id === 'up-a-tone')!);
    expect(up[0]!.label).toBe('C (1)');
    expect(up.at(-1)!.label).toBe('D (1 in D major)');
  });

  it('searches the phrase, other names and meaning', () => {
    const capo = terms.find((t) => t.id === 'capo')!;
    expect(searchText(capo)).toContain('clamp');
    expect(searchText(terms.find((t) => t.id === 'bridge')!)).toContain('middle eight');
  });
});
