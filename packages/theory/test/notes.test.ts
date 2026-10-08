import { describe, expect, it } from 'vitest';
import { enharmonics, isBlackKey, midiName, octave, parseMidi, parseNote, pcName, pretty } from '../src/index.js';

describe('notes', () => {
  it('names middle C as C4', () => {
    expect(midiName(60)).toBe('C4');
    expect(octave(60)).toBe(4);
    expect(midiName(21)).toBe('A0');
    expect(midiName(108)).toBe('C8');
  });

  it('names black keys with sharps or flats', () => {
    expect(pcName(1, 'sharp')).toBe('C#');
    expect(pcName(1, 'flat')).toBe('Db');
    expect(enharmonics(10)).toEqual(['A#', 'Bb']);
    expect(enharmonics(4)).toEqual(['E']);
  });

  it('knows which keys are black', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].filter(isBlackKey)).toEqual([1, 3, 6, 8, 10]);
  });

  it('parses note names', () => {
    expect(parseMidi('C4')).toBe(60);
    expect(parseMidi('A0')).toBe(21);
    expect(parseMidi('Eb4')).toBe(63);
    expect(parseMidi('B#3')).toBe(60);
    expect(parseMidi('C♯4')).toBe(61);
    expect(parseNote('f#')?.note).toEqual({ letter: 'F', accidental: 1 });
    expect(parseNote('H')).toBeNull();
  });

  it('prints music symbols', () => {
    expect(pretty('F#')).toBe('F♯');
    expect(pretty('Bb')).toBe('B♭');
    expect(pretty('Bbm7b5')).toBe('B♭m7♭5');
    expect(pretty('Ab/C')).toBe('A♭/C');
  });
});
