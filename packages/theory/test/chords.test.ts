import { describe, expect, it } from 'vitest';
import { identifyChord, identifyChords, noteToString, parseKey, parseMidi, spellChord, parseNote } from '../src/index.js';

const notes = (...names: string[]) => names.map((n) => parseMidi(n)!);
const name = (key: string, ...names: string[]) => identifyChord(notes(...names), parseKey(key)!)?.symbol ?? null;

describe('chord spelling', () => {
  it('spells chords by letter', () => {
    const s = (root: string, q: Parameters<typeof spellChord>[1]) => spellChord(parseNote(root)!.note, q).map(noteToString).join(' ');
    expect(s('C', 'major')).toBe('C E G');
    expect(s('Ab', 'major')).toBe('Ab C Eb');
    expect(s('B', 'dim')).toBe('B D F');
    expect(s('F#', 'm7')).toBe('F# A C# E');
    expect(s('C', 'dim7')).toBe('C Eb Gb Bbb');
    expect(s('G', '7')).toBe('G B D F');
  });
});

describe('chord naming', () => {
  it('names triads in root position', () => {
    expect(name('C', 'C4', 'E4', 'G4')).toBe('C');
    expect(name('C', 'A3', 'C4', 'E4')).toBe('Am');
    expect(name('C', 'B3', 'D4', 'F4')).toBe('Bdim');
    expect(name('C', 'C4', 'E4', 'G#4')).toBe('Caug');
    expect(name('C', 'D4', 'G4', 'A4')).toBe('Dsus4');
    expect(name('C', 'D4', 'E4', 'A4')).toBe('Dsus2');
  });

  it('names inversions as slash chords', () => {
    const first = identifyChord(notes('E3', 'G3', 'C4'))!;
    expect(first.symbol).toBe('C/E');
    expect(first.inversion).toBe('first');
    const second = identifyChord(notes('G3', 'C4', 'E4'))!;
    expect(second.symbol).toBe('C/G');
    expect(second.inversion).toBe('second');
    const third = identifyChord(notes('F3', 'G3', 'B3', 'D4'))!;
    expect(third.symbol).toBe('G7/F');
    expect(third.inversion).toBe('third');
  });

  it('ignores doubled notes and spread voicings', () => {
    expect(name('C', 'C2', 'G2', 'C3', 'E4', 'G4', 'C5')).toBe('C');
  });

  it('names seventh chords', () => {
    expect(name('C', 'G3', 'B3', 'D4', 'F4')).toBe('G7');
    expect(name('C', 'C4', 'E4', 'G4', 'B4')).toBe('Cmaj7');
    expect(name('C', 'D4', 'F4', 'A4', 'C5')).toBe('Dm7');
    expect(name('C', 'B3', 'D4', 'F4', 'A4')).toBe('Bm7b5');
    expect(name('C', 'C4', 'Eb4', 'Gb4', 'A4')).toBe('Cdim7');
  });

  it('prefers the bass note as root when notes are ambiguous', () => {
    expect(name('C', 'C4', 'E4', 'G4', 'A4')).toBe('C6');
    expect(name('C', 'A3', 'C4', 'E4', 'G4')).toBe('Am7');
    expect(identifyChords(notes('C4', 'E4', 'G4', 'A4')).map((m) => m.symbol)).toContain('Am7/C');
  });

  it('accepts 7th chords without the 5th', () => {
    const m = identifyChord(notes('C3', 'E3', 'Bb3'))!;
    expect(m.symbol).toBe('C7');
    expect(m.omittedFifth).toBe(true);
  });

  it('spells roots for the key', () => {
    expect(name('F', 'Bb3', 'D4', 'F4')).toBe('Bb');
    expect(name('E', 'A#3', 'C#4', 'E4')).toBe('A#dim');
    expect(name('Eb', 'Ab3', 'C4', 'Eb4')).toBe('Ab');
    expect(name('C', 'Bb3', 'D4', 'F4')).toBe('Bb');
  });

  it('names 9th and add9 chords', () => {
    expect(name('C', 'C4', 'D4', 'E4', 'G4')).toBe('Cadd9');
    expect(name('C', 'G3', 'B3', 'D4', 'F4', 'A4')).toBe('G9');
  });

  it('returns nothing for fewer than three note names', () => {
    expect(name('C', 'C4', 'E4')).toBeNull();
    expect(name('C', 'C4', 'C5', 'C6')).toBeNull();
    expect(identifyChord([])).toBeNull();
  });

  it('returns nothing for clusters it does not know', () => {
    expect(name('C', 'C4', 'C#4', 'D4')).toBeNull();
  });
});
