import { describe, expect, it } from 'vitest';
import { identifyChord, nashvilleNumber, parseKey, parseMidi, romanNumeral } from '../src/index.js';

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
