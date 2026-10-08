import { describe, expect, it, vi } from 'vitest';
import { ChordCollector, HeldNotes, WebMidiSource, parseMidiMessage } from '../src/index.js';

describe('parseMidiMessage', () => {
  it('reads note-on and note-off', () => {
    expect(parseMidiMessage([0x90, 60, 100])).toEqual({ type: 'noteOn', note: 60, velocity: 100, channel: 0 });
    expect(parseMidiMessage([0x83, 60, 0])).toEqual({ type: 'noteOff', note: 60, velocity: 0, channel: 3 });
  });

  it('treats note-on with velocity 0 as note-off', () => {
    expect(parseMidiMessage([0x90, 64, 0])?.type).toBe('noteOff');
  });

  it('reads the sustain pedal', () => {
    expect(parseMidiMessage([0xb0, 64, 127])).toEqual({ type: 'sustain', down: true, channel: 0 });
    expect(parseMidiMessage([0xb0, 64, 0])).toEqual({ type: 'sustain', down: false, channel: 0 });
  });

  it('passes other messages through', () => {
    expect(parseMidiMessage([0xfe])?.type).toBe('other');
    expect(parseMidiMessage([])).toBeNull();
  });
});

describe('HeldNotes', () => {
  it('tracks held keys in order', () => {
    const h = new HeldNotes();
    h.apply({ type: 'noteOn', note: 67, velocity: 80, channel: 0 });
    h.apply({ type: 'noteOn', note: 60, velocity: 80, channel: 0 });
    h.apply({ type: 'noteOn', note: 64, velocity: 80, channel: 0 });
    expect(h.keys()).toEqual([60, 64, 67]);
    h.apply({ type: 'noteOff', note: 64, velocity: 0, channel: 0 });
    expect(h.keys()).toEqual([60, 67]);
  });

  it('keeps pedalled notes sounding but not held', () => {
    const h = new HeldNotes();
    h.apply({ type: 'sustain', down: true, channel: 0 });
    h.apply({ type: 'noteOn', note: 60, velocity: 80, channel: 0 });
    h.apply({ type: 'noteOff', note: 60, velocity: 0, channel: 0 });
    expect(h.keys()).toEqual([]);
    expect(h.sounding()).toEqual([60]);
    expect(h.apply({ type: 'sustain', down: false, channel: 0 })).toBe(true);
    expect(h.sounding()).toEqual([]);
  });

  it('ignores a note-off for a key that was never pressed', () => {
    expect(new HeldNotes().apply({ type: 'noteOff', note: 60, velocity: 0, channel: 0 })).toBe(false);
  });
});

describe('ChordCollector', () => {
  it('groups notes pressed close together', () => {
    const c = new ChordCollector(150);
    c.press(60, 0);
    c.press(64, 40);
    expect(c.press(67, 90)).toEqual([60, 64, 67]);
    expect(c.isComplete(100)).toBe(false);
    expect(c.isComplete(200)).toBe(true);
    expect(c.press(62, 400)).toEqual([62]);
  });
});

describe('WebMidiSource', () => {
  it('reports when the browser has no Web MIDI', () => {
    expect(new WebMidiSource({}).status).toBe('unsupported');
  });

  it('forwards messages from inputs and follows the selection', async () => {
    const ports = [
      { id: 'a', name: 'Piano', manufacturer: 'Yamaha', state: 'connected', onmidimessage: null as null | ((e: { data: Uint8Array }) => void) },
      { id: 'b', name: 'Pads', manufacturer: '', state: 'connected', onmidimessage: null as null | ((e: { data: Uint8Array }) => void) },
    ];
    const access = { inputs: { forEach: (cb: (p: (typeof ports)[number]) => void) => ports.forEach(cb) }, onstatechange: null };
    const src = new WebMidiSource({ requestMIDIAccess: async () => access });
    await src.start();
    expect(src.status).toBe('ready');
    expect(src.inputs().map((i) => i.name)).toEqual(['Piano', 'Pads']);

    const seen = vi.fn();
    src.onEvent(seen);
    ports[0]!.onmidimessage!({ data: new Uint8Array([0x90, 60, 90]) });
    expect(seen).toHaveBeenCalledWith({ type: 'noteOn', note: 60, velocity: 90, channel: 0 }, 'a');

    src.select('b');
    expect(ports[0]!.onmidimessage).toBeNull();
    expect(ports[1]!.onmidimessage).not.toBeNull();
  });

  it('reports a refused permission', async () => {
    const src = new WebMidiSource({ requestMIDIAccess: () => Promise.reject(new Error('no')) });
    await src.start();
    expect(src.status).toBe('denied');
  });
});
