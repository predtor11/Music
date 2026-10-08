/**
 * Raw MIDI bytes to note events.
 *
 * Same idea as Midi-Editor's MIDIInput::parseMessage: the status byte's high
 * nibble is the message type and its low nibble the channel, followed by two
 * data bytes. Added here: a note-on with velocity 0 is a note-off, which many
 * keyboards send instead of a real note-off.
 */

export type MidiEvent =
  | { type: 'noteOn'; note: number; velocity: number; channel: number }
  | { type: 'noteOff'; note: number; velocity: number; channel: number }
  | { type: 'sustain'; down: boolean; channel: number }
  | { type: 'other'; status: number; channel: number };

const NOTE_OFF = 0x80;
const NOTE_ON = 0x90;
const CONTROL_CHANGE = 0xb0;
const SUSTAIN_PEDAL = 64;

export function parseMidiMessage(data: ArrayLike<number>): MidiEvent | null {
  if (data.length === 0) return null;
  const status = data[0]!;
  const kind = status & 0xf0;
  const channel = status & 0x0f;
  const d1 = data[1] ?? 0;
  const d2 = data[2] ?? 0;
  if (kind === NOTE_ON && d2 > 0) return { type: 'noteOn', note: d1, velocity: d2, channel };
  if (kind === NOTE_OFF || (kind === NOTE_ON && d2 === 0)) return { type: 'noteOff', note: d1, velocity: d2, channel };
  if (kind === CONTROL_CHANGE && d1 === SUSTAIN_PEDAL) return { type: 'sustain', down: d2 >= 64, channel };
  return { type: 'other', status, channel };
}
