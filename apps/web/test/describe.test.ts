import { C_MAJOR, parseKey, parseMidi } from '@music/theory';
import { describe as group, expect, it } from 'vitest';
import { describe } from '../src/chord/describe.js';
import { computerKeyToNote, keyboardKeys, KEYBOARD_RANGES, noteToComputerKey } from '../src/keyboard/layout.js';
import { detectBrowser } from '../src/midi/useMidi.js';

const m = (...names: string[]) => names.map((n) => parseMidi(n)!);

group('describe', () => {
  it('is empty with nothing held', () => {
    expect(describe([], C_MAJOR)).toEqual({ kind: 'empty' });
  });

  it('names a single note with its octave and sargam', () => {
    const d = describe(m('G4'), C_MAJOR);
    expect(d.kind).toBe('note');
    if (d.kind !== 'note') return;
    expect(d.note.western).toBe('G');
    expect(d.note.octave).toBe(4);
    expect(d.note.sargam.label).toBe('Pa');
  });

  it('spells notes in the key', () => {
    const d = describe([70], parseKey('F')!);
    expect(d.kind === 'note' && d.note.western).toBe('Bb');
  });

  it('moves Sa with the key and marks komal and tivra', () => {
    const d = describe(m('D4'), parseKey('D')!);
    expect(d.kind === 'note' && d.note.sargam.label).toBe('Sa');
    const komal = describe(m('Eb4'), C_MAJOR);
    expect(komal.kind === 'note' && komal.note.sargam.label).toBe('komal Ga');
    const tivra = describe(m('F#4'), C_MAJOR);
    expect(tivra.kind === 'note' && tivra.note.sargam.label).toBe('tivra Ma');
  });

  it('names an interval for two notes', () => {
    const d = describe(m('C4', 'E4'), C_MAJOR);
    expect(d.kind === 'interval' && d.name).toBe('major 3rd');
  });

  it('names chords with inversion, Roman numeral and Nashville number', () => {
    const c = describe(m('C4', 'E4', 'G4'), C_MAJOR);
    expect(c.kind === 'chord' && [c.symbol, c.fullName, c.inversion, c.roman, c.nashville]).toEqual(['C', 'C major', 'root position', 'I', '1']);

    const ce = describe(m('E3', 'G3', 'C4'), C_MAJOR);
    expect(ce.kind === 'chord' && [ce.symbol, ce.inversion]).toEqual(['C/E', '1st inversion']);

    const am7 = describe(m('A3', 'C4', 'E4', 'G4'), C_MAJOR);
    expect(am7.kind === 'chord' && [am7.symbol, am7.fullName, am7.roman, am7.nashville]).toEqual(['Am7', 'A minor 7th', 'vi7', '6m7']);

    const am = describe(m('A3', 'C4', 'E4'), C_MAJOR);
    expect(am.kind === 'chord' && am.roman).toBe('vi');
  });

  it('treats octave doublings of two notes as an interval', () => {
    const d = describe(m('C3', 'C4', 'G4'), C_MAJOR);
    expect(d.kind === 'interval' && d.name).toBe('perfect 12th');
  });

  it('says when notes are not a known chord', () => {
    expect(describe(m('C4', 'C#4', 'D4'), C_MAJOR).kind).toBe('unknown');
  });
});

group('keyboard layout', () => {
  it('has the right number of keys for each size', () => {
    for (const size of [25, 37, 49, 61, 76, 88] as const) expect(keyboardKeys(size)).toHaveLength(size);
  });

  it('starts an 88-key board on A0 and ends on C8', () => {
    expect(KEYBOARD_RANGES[88]).toEqual({ low: 21, high: 108 });
    expect(keyboardKeys(88).filter((k) => !k.black)).toHaveLength(52);
  });

  it('maps computer keys from middle C', () => {
    expect(['a', 'w', 's', 'e', 'd', 'f', 't', 'g', 'y', 'h', 'u', 'j', 'k'].map((k) => computerKeyToNote(k))).toEqual([
      60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72,
    ]);
    expect(computerKeyToNote('q')).toBeNull();
    expect(noteToComputerKey(55, 48)).toBe('G');
  });
});

group('browser detection', () => {
  it('spots Firefox and Safari', () => {
    expect(detectBrowser('Mozilla/5.0 (Macintosh) Gecko/20100101 Firefox/131.0')).toBe('firefox');
    expect(detectBrowser('Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15')).toBe('safari');
    expect(detectBrowser('Mozilla/5.0 (Windows) AppleWebKit/537.36 Chrome/130.0 Safari/537.36')).toBe('other');
  });
});
