import { ChordChartSchema } from '@music/contracts';
import { keyLabel, parseKey } from '@music/theory';
import { describe, expect, it } from 'vitest';
import {
  MidiFileError,
  SAMPLE_BPM,
  analyzeAudio,
  analyzeMidiFile,
  analyzeNotes,
  buildChart,
  findLoop,
  labelChord,
  parseMidiFile,
  sampleNotes,
  withChord,
  withKey,
  writeMidiFile,
  type Analysis,
  type NoteEvent,
} from '../src/index.js';

/** Bars of chords (bass + upper notes) at a tempo, with optional tune notes per bar. */
function song(bars: Array<{ bass: number; chord: number[]; tune?: number[] }>, bpm = 100, beatsPerBar = 4): NoteEvent[] {
  const beat = 60 / bpm;
  const notes: NoteEvent[] = [];
  bars.forEach((bar, i) => {
    const t = i * beatsPerBar * beat;
    notes.push({ midi: bar.bass, start: t, end: t + beatsPerBar * beat, velocity: 0.7 });
    for (const m of bar.chord) notes.push({ midi: m, start: t, end: t + beatsPerBar * beat - 0.05, velocity: 0.6 });
    (bar.tune ?? []).forEach((m, j) => notes.push({ midi: m, start: t + j * beat, end: t + (j + 1) * beat - 0.03, velocity: 0.8 }));
  });
  return notes;
}

const symbols = (a: Analysis) => a.segments.filter((s) => s.chord).map((s) => s.chord!.symbol);

describe('MIDI files', () => {
  it('reads back what it writes: notes, tempo and metre', () => {
    const notes = sampleNotes();
    const file = parseMidiFile(writeMidiFile(notes, { bpm: SAMPLE_BPM, beatsPerBar: 4, title: 'Sample' }));
    expect(file.trackNames[0]).toBe('Sample');
    expect(file.notes).toHaveLength(notes.length);
    expect(file.notes[0]!.start).toBeCloseTo(notes[0]!.start, 2);
    expect(file.timeSignature).toEqual({ numerator: 4, denominator: 4 });
    expect(file.grid.bpm).toBeCloseTo(SAMPLE_BPM, 0);
    expect(file.grid.beatsPerBar).toBe(4);
  });

  it('handles running status, note-on with velocity 0, tempo changes and drums', () => {
    // Format 0, 96 ticks per quarter. Tempo 120, then 60 after one beat.
    const track = [
      0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20, // 500000 µs = 120 bpm
      0x00, 0x90, 60, 100, // C4 on
      0x00, 64, 100, // E4 on (running status)
      0x60, 60, 0, // C4 off (velocity 0) after 96 ticks
      0x00, 0xff, 0x51, 0x03, 0x0f, 0x42, 0x40, // 1000000 µs = 60 bpm
      0x60, 0x80, 64, 0, // E4 off after another 96 ticks
      0x00, 0x99, 36, 90, // kick on channel 10
      0x10, 0x89, 36, 0,
      0x00, 0xff, 0x2f, 0x00,
    ];
    const bytes = new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96, 0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, track.length, ...track]);
    const file = parseMidiFile(bytes);
    expect(file.notes.map((n) => n.midi)).toEqual([60, 64]);
    expect(file.notes[0]!.end).toBeCloseTo(0.5);
    expect(file.notes[1]!.end).toBeCloseTo(1.5);
    expect(file.drums).toHaveLength(1);
    expect(file.tempos.map((t) => Math.round(t.bpm))).toEqual([120, 60]);
  });

  it('refuses files that are not MIDI', () => {
    expect(() => parseMidiFile(new TextEncoder().encode('hello, this is not a song'))).toThrow(MidiFileError);
  });
});

describe('song analysis from notes', () => {
  it('finds the key, the chords, the inversions and the loop of the sample song', () => {
    const a = analyzeMidiFile(writeMidiFile(sampleNotes(), { bpm: SAMPLE_BPM }));
    expect(keyLabel(a.key.key)).toBe('G major');
    expect(a.key.confidence).toBeGreaterThan(0.75);
    expect(symbols(a).slice(0, 4)).toEqual(['G', 'D', 'Em', 'C']);
    expect(symbols(a)).toContain('D/F♯');
    expect(symbols(a)).toContain('C/E');
    const d = a.segments.find((s) => s.chord?.symbol === 'D/F♯')!.chord!;
    expect(d.number).toBe('5/7');
    expect(d.sargam).toBe('Pa');
    expect(a.summary.loop?.numbers).toEqual(['1', '5', '6m', '4']);
    expect(a.summary.loop?.count).toBe(4);
    expect(a.summary.sentences[0]).toMatch(/G major/);
  });

  it('keeps the chord through passing notes in the tune', () => {
    const C = { bass: 36, chord: [60, 64, 67] };
    const G = { bass: 43, chord: [59, 62, 67] };
    const a = analyzeNotes(
      song([
        { ...C, tune: [72, 74, 76, 77] },
        { ...C, tune: [79, 77, 76, 74] },
        { ...G, tune: [74, 72, 71, 69] },
        { ...C, tune: [72, 71, 72, 72] },
      ]),
      { bpm: 100 },
    );
    expect(symbols(a)).toEqual(['C', 'G', 'C']);
  });

  it('hears a minor key when the song rests on the minor chord', () => {
    const Am = { bass: 45, chord: [60, 64, 69] };
    const F = { bass: 41, chord: [60, 65, 69] };
    const C = { bass: 48, chord: [60, 64, 67] };
    const G = { bass: 43, chord: [59, 62, 67] };
    const E = { bass: 40, chord: [59, 64, 68] };
    const a = analyzeNotes(song([Am, F, C, G, Am, F, E, Am, Am]), { bpm: 90 });
    expect(keyLabel(a.key.key)).toBe('A minor');
    expect(a.segments.find((s) => s.chord?.symbol === 'E')!.chord!.inKey).toBe(true);
    expect(a.summary.loop).not.toBeNull();
  });

  it('names seventh chords', () => {
    const a = analyzeNotes(
      song([
        { bass: 38, chord: [60, 65, 69] }, // Dm7
        { bass: 43, chord: [59, 65, 67] }, // G7
        { bass: 36, chord: [59, 64, 67] }, // Cmaj7
        { bass: 36, chord: [59, 64, 67] },
      ]),
      { bpm: 100 },
    );
    expect(symbols(a)).toEqual(['Dm7', 'G7', 'Cmaj7']);
    expect(a.segments.map((s) => s.chord?.number).filter(Boolean)).toEqual(['2m7', '57', '1maj7']);
  });

  it('flags chords from outside the key', () => {
    const G = { bass: 43, chord: [59, 62, 67] };
    const F = { bass: 41, chord: [60, 65, 69] };
    const C = { bass: 36, chord: [60, 64, 67] };
    const D = { bass: 38, chord: [57, 62, 66] };
    const a = analyzeNotes(song([G, F, C, G, G, F, C, D, G]), { bpm: 100 });
    expect(keyLabel(a.key.key)).toBe('G major');
    const f = a.segments.find((s) => s.chord?.symbol === 'F')!.chord!;
    expect(f.inKey).toBe(false);
    expect(f.number).toBe('♭7');
    expect(a.summary.sentences.join(' ')).toMatch(/outside the key/);
  });

  it('finds the tempo of a take played without a click', () => {
    const notes = sampleNotes().map((n) => ({ ...n, start: n.start + 0.4, end: n.end + 0.4 }));
    const a = analyzeNotes(notes);
    expect(a.grid.bpm).toBeGreaterThan(SAMPLE_BPM - 3);
    expect(a.grid.bpm).toBeLessThan(SAMPLE_BPM + 3);
    expect(symbols(a).slice(0, 4)).toEqual(['G', 'D', 'Em', 'C']);
  });

  it('reads 3/4 with bars of three', () => {
    const notes = song(
      [
        { bass: 41, chord: [60, 65, 69] },
        { bass: 36, chord: [60, 64, 67] },
        { bass: 41, chord: [60, 65, 69] },
        { bass: 36, chord: [58, 64, 67] },
        { bass: 41, chord: [60, 65, 69] },
      ],
      120,
      3,
    );
    const a = analyzeMidiFile(writeMidiFile(notes, { bpm: 120, beatsPerBar: 3 }));
    expect(a.grid.beatsPerBar).toBe(3);
    expect(keyLabel(a.key.key)).toBe('F major');
    expect(symbols(a)).toEqual(['F', 'C', 'F', 'C7', 'F']);
  });
});

describe('corrections', () => {
  const a = analyzeMidiFile(writeMidiFile(sampleNotes(), { bpm: SAMPLE_BPM }));

  it('recounts the numbers in another key', () => {
    const e = withKey(a, parseKey('Em')!);
    expect(e.segments[0]!.chord!.number).toBe('3');
    expect(e.segments[2]!.chord!.number).toBe('1m');
    expect(e.segments[2]!.chord!.sargam).toBe('Sa');
    expect(e.summary.sentences[0]).toMatch(/You set the key to E minor/);
  });

  it('replaces one chord by hand and keeps the old one as a choice', () => {
    const fixed = withChord(a, 1, { rootPc: 11, quality: 'minor', bassPc: 11 }, a.key.key);
    expect(fixed.segments[1]!.chord!.symbol).toBe('Bm');
    expect(fixed.segments[1]!.edited).toBe(true);
    expect(fixed.segments[1]!.alternatives[0]!.symbol).toBe('D');
    expect(fixed.segments[0]!.chord!.symbol).toBe('G');
  });

  it('labels a chord every way', () => {
    const l = labelChord({ rootPc: 2, quality: 'major', bassPc: 6 }, parseKey('G')!);
    expect(l).toMatchObject({ symbol: 'D/F♯', roman: 'V/7', number: '5/7', sargam: 'Pa', inKey: true, name: 'D major' });
  });
});

describe('chart and loop', () => {
  it('lays the chords out as bars of chord symbols, valid as a chart', () => {
    const a = analyzeMidiFile(writeMidiFile(sampleNotes(), { bpm: SAMPLE_BPM }));
    const chart = ChordChartSchema.parse(buildChart(a.segments, a.grid, a.key.key, 'Sample'));
    expect(chart.key).toBe('G');
    expect(chart.timeSignature).toBe('4/4');
    const bars = chart.sections.flatMap((s) => s.bars);
    expect(bars.slice(0, 4).map((b) => b.chords.map((c) => c.symbol).join())).toEqual(['G', 'D', 'Em', 'C']);
    expect(bars.every((b) => b.chords.reduce((n, c) => n + (c.beats ?? 0), 0) <= 4)).toBe(true);
    expect(bars.flatMap((b) => b.chords).some((c) => c.symbol === 'D/F#')).toBe(true);
  });

  it('finds the loop that repeats most, not one chord twice', () => {
    const k = parseKey('C')!;
    const l = (root: number, q: 'major' | 'minor') => labelChord({ rootPc: root, quality: q, bassPc: root }, k);
    const seq = [l(9, 'minor'), l(5, 'major'), l(0, 'major'), l(7, 'major')];
    expect(findLoop([...seq, ...seq, ...seq])?.symbols).toEqual(['Am', 'F', 'C', 'G']);
    expect(findLoop([l(0, 'major'), l(7, 'major')])).toBeNull();
  });
});

describe('audio', () => {
  /** A rough piano-ish render of notes, with noise. */
  function render(notes: readonly NoteEvent[], sr = 22050): Float32Array {
    const dur = Math.max(...notes.map((n) => n.end)) + 0.5;
    const out = new Float32Array(Math.ceil(dur * sr));
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    for (const n of notes) {
      const f = 440 * 2 ** ((n.midi - 69) / 12);
      const s0 = Math.floor(n.start * sr);
      const s1 = Math.min(out.length, Math.floor(n.end * sr));
      for (let i = s0; i < s1; i++) {
        const t = (i - s0) / sr;
        const env = Math.exp(-t * 1.2);
        out[i]! += 0.06 * n.velocity * env * (Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(4 * Math.PI * f * t) + 0.25 * Math.sin(6 * Math.PI * f * t));
      }
    }
    for (let i = 0; i < out.length; i++) out[i]! += 0.01 * rand();
    return out;
  }

  it('hears the key and most chords of a clean recording, and says it is guessing', () => {
    const notes = sampleNotes().filter((n) => n.start < 21);
    const a = analyzeAudio(render(notes), 22050);
    expect(a.source).toBe('audio');
    expect(keyLabel(a.key.key)).toBe('G major');
    const base = symbols(a).map((s) => s.split('/')[0]);
    expect(base.slice(0, 4)).toEqual(['G', 'D', 'Em', 'C']);
    expect(a.confidence).toBeLessThan(0.8);
    expect(a.summary.sentences.join(' ')).toMatch(/guesses/);
  });

  it('reports no chords for silence', () => {
    const a = analyzeAudio(new Float32Array(22050 * 4), 22050);
    expect(symbols(a)).toEqual([]);
    expect(a.summary.sentences[0]).toMatch(/No chords/);
  });
});
