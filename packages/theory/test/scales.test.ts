import { describe, expect, it } from 'vitest';
import { COMMON_KEYS, keySignature, noteToString, parseKey, parseNote, spellInKey, spellInterval, spellScale, keyName } from '../src/index.js';

const spell = (tonic: string, type: Parameters<typeof spellScale>[1]) =>
  spellScale(parseNote(tonic)!.note, type).map(noteToString).join(' ');

describe('scales', () => {
  it('spells major scales with one of each letter', () => {
    expect(spell('C', 'major')).toBe('C D E F G A B');
    expect(spell('F', 'major')).toBe('F G A Bb C D E');
    expect(spell('E', 'major')).toBe('E F# G# A B C# D#');
    expect(spell('Eb', 'major')).toBe('Eb F G Ab Bb C D');
    expect(spell('F#', 'major')).toBe('F# G# A# B C# D# E#');
  });

  it('spells minor scales', () => {
    expect(spell('A', 'naturalMinor')).toBe('A B C D E F G');
    expect(spell('A', 'harmonicMinor')).toBe('A B C D E F G#');
    expect(spell('C', 'naturalMinor')).toBe('C D Eb F G Ab Bb');
  });

  it('spells pentatonic scales', () => {
    expect(spell('C', 'majorPentatonic')).toBe('C D E G A');
    expect(spell('A', 'minorPentatonic')).toBe('A C D E G');
  });

  it('counts key signatures', () => {
    expect(keySignature(parseKey('C')!)).toBe(0);
    expect(keySignature(parseKey('G')!)).toBe(1);
    expect(keySignature(parseKey('Bb')!)).toBe(-2);
    expect(keySignature(parseKey('Em')!)).toBe(1);
    expect(keySignature(parseKey('Cm')!)).toBe(-3);
  });

  it('parses keys', () => {
    expect(keyName(parseKey('F#m')!)).toBe('F#m');
    expect(parseKey('A minor')!.mode).toBe('minor');
    expect(parseKey('Bb')!.mode).toBe('major');
  });

  it('spells notes the way the key wants', () => {
    const name = (pc: number, key: string) => noteToString(spellInKey(pc, parseKey(key)!));
    expect(name(10, 'F')).toBe('Bb');
    expect(name(6, 'G')).toBe('F#');
    expect(name(1, 'Ab')).toBe('Db');
    expect(name(11, 'F')).toBe('B');
    expect(name(3, 'C')).toBe('Eb');
    expect(name(1, 'C')).toBe('C#');
    expect(name(8, 'D')).toBe('G#');
  });

  it('spells intervals so the letters match the interval', () => {
    const pair = (lo: number, hi: number, key: string) =>
      spellInterval(lo, hi, parseKey(key)!).map(noteToString).join(' to ');
    expect(pair(1, 3, 'C')).toBe('C# to D#');
    expect(pair(1, 3, 'Ab')).toBe('Db to Eb');
    expect(pair(1, 1, 'C')).toBe('C# to C#');
    expect(pair(0, 6, 'C')).toBe('C to F#');
    expect(pair(11, 5, 'C')).toBe('B to F');
    expect(pair(0, 4, 'C')).toBe('C to E');
    expect(pair(10, 1, 'F')).toBe('Bb to Db');
    expect(pair(6, 10, 'D')).toBe('F# to A#');
  });

  it('offers 24 keys', () => {
    expect(COMMON_KEYS).toHaveLength(24);
  });
});
