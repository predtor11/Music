import { describe, expect, it } from 'vitest';
import { analyseTake, chordChart, chordLabel, chordSequence, detectKey, findLoop, pitchClassWeights, soundingNotes, summarise } from '../src/index.js';
import { chord, line, take } from './helpers.js';

const symbols = (t: ReturnType<typeof take>, opts = {}) => chordSequence(analyseTake(t, opts).spans).map((c) => c.symbol);

/** The 1-5-6-4 in G: left hand chords, right hand melody on top, twice through. */
function axisInG() {
  const bars = [
    ['G2 B3 D4', 'B4 A4 G4 D5'],
    ['D3 F#3 A3', 'A4 F#4 D5 A4'],
    ['E3 G3 B3', 'G4 E5 B4 G4'],
    ['C3 E3 G3', 'E4 G4 C5 E5'],
  ];
  const notes = [];
  for (let round = 0; round < 2; round++) {
    for (let i = 0; i < 4; i++) {
      const t = (round * 4 + i) * 2000;
      notes.push(...chord(t, 1900, bars[i]![0]!), ...line(t + 100, 450, 400, bars[i]![1]!));
    }
  }
  return take(notes);
}

describe('detectKey', () => {
  it('finds C major from its scale, and A minor from a minor progression', () => {
    expect(detectKey(pitchClassWeights(soundingNotes(take(line(0, 400, 380, 'C4 D4 E4 F4 G4 A4 B4 C5 G4 E4 C4')))))!.best.label).toBe('C major');
    const minor = take([...chord(0, 1000, 'A2 C3 E3'), ...chord(1000, 1000, 'D3 F3 A3'), ...chord(2000, 1000, 'E3 G#3 B3'), ...chord(3000, 1500, 'A2 C3 E3 A3')]);
    expect(analyseTake(minor).key).toMatchObject({ mode: 'minor', tonic: { letter: 'A', accidental: 0 } });
  });

  it('is null for silence', () => {
    expect(detectKey(new Array(12).fill(0))).toBeNull();
  });
});

describe('analyseTake', () => {
  it('names a 1-5-6-4 with a melody on top', () => {
    const a = analyseTake(axisInG());
    expect(a.key).toMatchObject({ mode: 'major', tonic: { letter: 'G', accidental: 0 } });
    expect(chordSequence(a.spans).map((c) => c.symbol)).toEqual(['G', 'D', 'Em', 'C', 'G', 'D', 'Em', 'C']);
    expect(chordSequence(a.spans).map((c) => c.nashville).slice(0, 4)).toEqual(['1', '5', '6m', '4']);
    expect(a.spans.every((s) => s.chord?.inKey)).toBe(true);
  });

  it('names broken chords (arpeggios) played without the pedal', () => {
    const t = take([...line(0, 300, 280, 'A2 E3 A3 C4 E3 A3'), ...line(1800, 300, 280, 'F2 C3 F3 A3 C3 F3'), ...line(3600, 300, 280, 'C3 G3 C4 E4 G3 C4')]);
    expect(symbols(t)).toEqual(['Am', 'F', 'C']);
  });

  it('names inversions and 7th chords, and treats a lone melody as no chord', () => {
    const t = take([...chord(0, 1000, 'E3 G3 C4'), ...chord(1000, 1000, 'G2 B3 D4 F4'), ...line(3000, 400, 380, 'C5 D5 E5 G5 E5 D5 C5')]);
    const a = analyseTake(t);
    expect(chordSequence(a.spans).map((c) => c.symbol)).toEqual(['C/E', 'G7']);
    expect(a.spans.at(-1)!.chord).toBeNull();
  });

  it('uses the key and the corrections the learner picked', () => {
    const t = axisInG();
    const a = analyseTake(t, { keyOverride: 'Em', corrections: [{ at: 2500, rootPc: 2, quality: '7' }] });
    expect(a.keyFromUser).toBe(true);
    const seq = chordSequence(a.spans);
    expect(seq[1]!.symbol).toBe('D7');
    expect(a.spans.find((s) => s.corrected)!.chord!.symbol).toBe('D7');
    // In E minor, G is the 3 chord.
    expect(seq[0]!.nashville).toBe('3');

    const none = analyseTake(t, { corrections: [{ at: 100, rootPc: null, quality: null }] });
    expect(none.spans[0]!.chord).toBeNull();
    expect(none.spans[0]!.corrected).toBe(true);
  });

  it('handles an empty take', () => {
    const a = analyseTake({ notes: [], pedal: [], durationMs: 0 });
    expect(a.spans).toEqual([]);
    expect(a.detected).toBeNull();
  });
});

describe('summary', () => {
  it('says the key, the chords as numbers and names the loop', () => {
    const t = axisInG();
    const s = summarise(analyseTake(t), t);
    expect(s.headline).toBe('You played in G major.');
    const text = s.points.join('\n');
    expect(text).toContain('4 different chords: G, D, Em and C');
    expect(text).toContain('1, 5, 6m and 4');
    expect(text).toContain('the 1-5-6-4');
    expect(text).toContain('played 2 times');
  });

  it('labels chords in sargam', () => {
    const t = axisInG();
    const a = analyseTake(t);
    const [g, d, em] = chordSequence(a.spans);
    expect(chordLabel(g!, a.key, 'sargam')).toBe('Sa');
    expect(chordLabel(d!, a.key, 'sargam')).toBe('Pa');
    expect(chordLabel(em!, a.key, 'both')).toBe('Em (Dha minor)');
  });

  it('flags chords outside the key and left-hand jumps', () => {
    const t = take([...chord(0, 1000, 'C2 E3 G3'), ...chord(1000, 1000, 'Bb2 D3 F3'), ...chord(2000, 1000, 'F2 A3 C4'), ...chord(3000, 1500, 'C3 E3 G3')]);
    const text = summarise(analyseTake(t), t).points.join('\n');
    expect(text).toContain('B♭ is not in C major (b7)');
    expect(text).toContain('ended on the 1 chord');
  });

  it('builds a chart of chord changes, four to a line', () => {
    const rows = chordChart(analyseTake(axisInG()).spans);
    expect(rows.map((r) => r.map((s) => s.chord!.symbol))).toEqual([
      ['G', 'D', 'Em', 'C'],
      ['G', 'D', 'Em', 'C'],
    ]);
    expect(findLoop(chordSequence(analyseTake(axisInG()).spans))!.known!.name).toBe('the 1-5-6-4');
  });
});

/** Small, repeatable timing and loudness wobble, like a real player. */
function humanise(notes: ReturnType<typeof chord>, seed = 7) {
  let x = seed;
  const rnd = () => (x = (x * 16807) % 2147483647) / 2147483647;
  return notes.map((n) => ({ ...n, start: Math.max(0, n.start + Math.round((rnd() - 0.5) * 60)), velocity: 50 + Math.round(rnd() * 60) }));
}

describe('analyseTake on real-sounding playing', () => {
  it('follows the opening of the Moonlight Sonata: held bass octaves, pedal, broken chords on top', () => {
    const bars: Array<[string, string]> = [
      ['C#2 C#3', 'G#3 C#4 E4'],
      ['B1 B2', 'G#3 C#4 E4'],
      ['A1 A2', 'A3 C#4 E4'],
      ['F#1 F#2', 'A3 D4 F#4'],
      ['G#1 G#2', 'G#3 B#3 F#4'],
      ['C#2 C#3', 'G#3 C#4 E4'],
    ];
    const notes = [];
    const pedal = [];
    for (const [i, [lh, rh]] of bars.entries()) {
      const t = i * 2400;
      notes.push(...chord(t, 2300, lh));
      for (let k = 0; k < 12; k++) notes.push(...line(t + k * 200, 200, 150, rh.split(' ')[k % 3]!));
      pedal.push({ at: t + 30, down: true }, { at: t + 2380, down: false });
    }
    const t = take(humanise(notes), pedal);
    const a = analyseTake(t);
    expect(a.key).toMatchObject({ mode: 'minor', tonic: { letter: 'C', accidental: 1 } });
    expect(chordSequence(a.spans).map((c) => c.symbol)).toEqual(['C#m', 'C#m7/B', 'A', 'D/F#', 'G#7', 'C#m']);
    expect(summarise(a, t).points.join('\n')).toContain('5⁷');
  });

  it('keeps up with a chord every half second', () => {
    const changes = ['C3 E3 G3', 'A2 C3 E3', 'F2 A2 C3', 'G2 B2 D3'];
    const notes = [...changes, ...changes].flatMap((c, i) => chord(i * 500, 480, c));
    expect(symbols(take(humanise(notes)))).toEqual(['C', 'Am', 'F', 'G', 'C', 'Am', 'F', 'G']);
  });
});
