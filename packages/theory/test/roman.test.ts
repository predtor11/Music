import { describe, expect, it } from 'vitest';
import { chordFromNumeral, identifyChord, nashvilleNumber, parseKey, parseMidi, romanNumeral } from '../src/index.js';

const chord = (key: string, ...names: string[]) => identifyChord(names.map((n) => parseMidi(n)!), parseKey(key)!)!;
const roman = (key: string, ...names: string[]) => romanNumeral(chord(key, ...names), parseKey(key)!);
const nash = (key: string, ...names: string[]) => nashvilleNumber(chord(key, ...names), parseKey(key)!);

describe('Roman numerals', () => {
  it('names the diatonic chords of C major', () => {
    expect(roman('C', 'C4', 'E4', 'G4')).toBe('I');
    expect(roman('C', 'D4', 'F4', 'A4')).toBe('ii');
    expect(roman('C', 'E4', 'G4', 'B4')).toBe('iii');
    expect(roman('C', 'F4', 'A4', 'C5')).toBe('IV');
    expect(roman('C', 'G4', 'B4', 'D5')).toBe('V');
    expect(roman('C', 'A3', 'C4', 'E4')).toBe('vi');
    expect(roman('C', 'B3', 'D4', 'F4')).toBe('vii°');
  });

  it('works in other keys', () => {
    expect(roman('G', 'D4', 'F#4', 'A4')).toBe('V');
    expect(roman('G', 'E4', 'G4', 'B4')).toBe('vi');
    expect(roman('Eb', 'Ab3', 'C4', 'Eb4')).toBe('IV');
    expect(roman('Am', 'E4', 'G#4', 'B4')).toBe('V');
    expect(roman('Am', 'D4', 'F4', 'A4')).toBe('iv');
  });

  it('marks chords from outside the key', () => {
    expect(roman('C', 'Bb3', 'D4', 'F4')).toBe('bVII');
    expect(roman('C', 'Ab3', 'C4', 'Eb4')).toBe('bVI');
  });

  it('adds 7ths and inversions', () => {
    expect(roman('C', 'G3', 'B3', 'D4', 'F4')).toBe('V7');
    expect(roman('C', 'D4', 'F4', 'A4', 'C5')).toBe('ii7');
    expect(roman('C', 'E3', 'G3', 'C4')).toBe('I/3');
  });
});

describe('Nashville numbers', () => {
  it('numbers chords in G', () => {
    expect(nash('G', 'G3', 'B3', 'D4')).toBe('1');
    expect(nash('G', 'D4', 'F#4', 'A4')).toBe('5');
    expect(nash('G', 'E4', 'G4', 'B4')).toBe('6m');
    expect(nash('G', 'C4', 'E4', 'G4')).toBe('4');
    expect(nash('G', 'F#3', 'A3', 'D4')).toBe('5/7');
  });
});

describe('chordFromNumeral', () => {
  const sym = (numeral: string, key: string) => chordFromNumeral(numeral, parseKey(key)!)?.symbol ?? null;

  it('reads Roman numerals by case and suffix', () => {
    expect(['I', 'V', 'vi', 'IV'].map((n) => sym(n, 'G'))).toEqual(['G', 'D', 'Em', 'C']);
    expect(sym('V7', 'C')).toBe('G7');
    expect(sym('ii7', 'C')).toBe('Dm7');
    expect(sym('Imaj7', 'Eb')).toBe('Ebmaj7');
    expect(sym('vii°', 'C')).toBe('Bdim');
    expect(sym('viiø7', 'C')).toBe('Bm7b5');
    expect(sym('bVII', 'C')).toBe('Bb');
    expect(sym('III+', 'Am')).toBe('Caug');
  });

  it('reads Nashville numbers with the key deciding the quality', () => {
    expect(['1', '5', '6', '4'].map((n) => sym(n, 'G'))).toEqual(['G', 'D', 'Em', 'C']);
    expect(sym('6m', 'C')).toBe('Am');
    expect(sym('57', 'C')).toBe('G7');
    expect(sym('27', 'F')).toBe('Gm7');
    expect(sym('4maj7', 'D')).toBe('Gmaj7');
    expect(sym('7', 'A')).toBe('G#dim');
  });

  it('handles slash bass notes and gives pitch classes for grading', () => {
    const c = chordFromNumeral('5/7', parseKey('C')!)!;
    expect(c.symbol).toBe('G/B');
    expect(c.bassPc).toBe(11);
    expect(c.pitchClasses).toEqual([7, 11, 2]);
    expect(chordFromNumeral('I/3', parseKey('C')!)!.symbol).toBe('C/E');
  });

  it('works in minor keys', () => {
    expect(['i', 'iv', 'v', 'V', 'VI', 'VII'].map((n) => sym(n, 'Am'))).toEqual(['Am', 'Dm', 'Em', 'E', 'F', 'G']);
    expect(sym('5', 'Am')).toBe('Em');
  });

  it('returns null for text that is not a numeral', () => {
    expect(chordFromNumeral('X', parseKey('C')!)).toBeNull();
    expect(chordFromNumeral('Iwhat', parseKey('C')!)).toBeNull();
    expect(chordFromNumeral('I/9', parseKey('C')!)).toBeNull();
  });
});
