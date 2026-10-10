import { describe, expect, it } from 'vitest';
import { CHOICE_KEY, instrumentId, instrumentPath, needsInstrumentChoice, parseInstrumentSettings, rememberInstrumentChoice } from '../src/instruments/model.js';
import { instrumentEntry, INSTRUMENTS } from '../src/instruments/registry.js';
import { fretRows, positionNote } from '../src/fretboard/model.js';
import { pluckPositions, positionNotes } from '../src/guitar/input.js';
import { tuningText } from '../src/guitar/tuner.js';
import { STANDARD_TUNING } from '@music/theory';

function storage(data: Record<string, string> = {}) {
  return { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => { data[k] = v; } };
}

describe('instrument selection', () => {
  it('asks new learners, migrates old piano settings, and remembers an explicit choice', () => {
    const empty = storage();
    expect(needsInstrumentChoice(empty)).toBe(true);
    expect(needsInstrumentChoice(storage({ 'music.settings.v1': JSON.stringify({ theme: 'light' }) }))).toBe(false);
    // Saving default settings before choosing must not skip the picker on reload.
    expect(needsInstrumentChoice(storage({ 'music.settings.v1': JSON.stringify({ instrument: 'piano' }) }))).toBe(true);
    rememberInstrumentChoice(empty);
    expect(empty.getItem(CHOICE_KEY)).toBe('1');
    expect(needsInstrumentChoice(empty)).toBe(false);
  });
  it('survives invalid or blocked storage without silently making a choice', () => {
    expect(needsInstrumentChoice(storage({ 'music.settings.v1': '{bad' }))).toBe(true);
    expect(needsInstrumentChoice({ getItem: () => { throw new Error('blocked'); } })).toBe(true);
    expect(() => rememberInstrumentChoice({ setItem: () => { throw new Error('blocked'); } })).not.toThrow();
  });
  it('retains guitar with the settings seam and defaults missing instruments to piano', () => {
    expect(parseInstrumentSettings({ instrument: 'guitar', theme: 'light' })).toMatchObject({ instrument: 'guitar', theme: 'light' });
    expect(parseInstrumentSettings({}).instrument).toBe('piano');
    expect(instrumentId('unknown')).toBe('piano');
  });
  it('scopes guitar requests and preserves existing queries and piano defaults', () => {
    expect(instrumentPath('/curriculum/units', 'guitar')).toBe('/curriculum/units?instrument=guitar');
    expect(instrumentPath('/report?tzOffset=330', 'guitar')).toBe('/report?tzOffset=330&instrument=guitar');
    expect(instrumentPath('/curriculum/units', 'piano')).toBe('/curriculum/units');
  });
  it('registers adaptive visuals/input and gates piano-only practice screens', () => {
    expect(INSTRUMENTS.map((x) => x.id)).toEqual(['piano', 'guitar']);
    const piano = instrumentEntry('piano'); const guitar = instrumentEntry('guitar');
    expect(piano.Visual).not.toBe(guitar.Visual);
    expect(piano.Input).not.toBe(guitar.Input);
    expect(piano.pages).toContain('daily'); expect(guitar.pages).not.toContain('daily');
    expect(guitar.pages).toContain('lessons'); expect(guitar.drillKinds).toContain('find-note');
  });
});

describe('fretboard input', () => {
  it('puts the thin string first and maps frets with the shared theory functions', () => {
    const rows = fretRows(STANDARD_TUNING, 12);
    expect(rows).toHaveLength(6); expect(rows[0]).toHaveLength(13);
    expect(rows[0]![0]).toMatchObject({ position: { string: 1, fret: 0 }, midi: 64, label: 'String 1, open, E4' });
    expect(rows[5]![0]!.midi).toBe(40);
    expect(positionNote(STANDARD_TUNING, { string: 5, fret: 3 })).toBe(48);
    expect(() => fretRows(STANDARD_TUNING, 37)).toThrow(RangeError);
    expect(() => positionNote(STANDARD_TUNING, { string: 0, fret: 2 })).toThrow(RangeError);
  });
  it('replaces a fret on the same string and releases it on a second click', () => {
    const first = pluckPositions([], { string: 1, fret: 0 });
    const next = pluckPositions(first, { string: 1, fret: 3 });
    expect(next).toEqual([{ string: 1, fret: 3 }]);
    expect(positionNotes(next)).toEqual([67]);
    expect(pluckPositions(next, { string: 1, fret: 3 })).toEqual([]);
  });
  it('keeps a note held if another string is playing the same pitch', () => {
    const two = [{ string: 1, fret: 0 }, { string: 2, fret: 5 }];
    expect(positionNotes(two)).toEqual([64]);
    expect(positionNotes(pluckPositions(two, two[0]!))).toEqual([64]);
  });
  it('explains tuning cents on either side of a note', () => {
    expect(tuningText(3)).toBe('In tune');
    expect(tuningText(-23)).toBe('23 cents flat');
    expect(tuningText(18)).toBe('18 cents sharp');
  });
});
