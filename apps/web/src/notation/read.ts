/**
 * Grading a read-staff item: the notes played against the notes drawn. On a
 * staff the octave matters, so it is checked note for note, and a wrong
 * answer says what was played in the same letters the staff uses.
 */

import type { MistakeKind } from '@music/contracts';
import { C_MAJOR, accidentalText, pitchClass, pretty, type Key, type MidiNote } from '@music/theory';
import { writtenNote } from './spell.js';

export interface ReadVerdict {
  correct: boolean;
  message: string;
  mistake: MistakeKind | null;
}

/** "B♭3", spelled the way the key writes it. */
export function writtenName(midi: MidiNote, key: Key = C_MAJOR): string {
  const { spelled, octave } = writtenNote(midi, key);
  return pretty(spelled.letter + accidentalText(spelled.accidental)) + octave;
}

const list = (notes: readonly MidiNote[], key: Key) => {
  const names = notes.map((n) => writtenName(n, key));
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
};

export function gradeReading(target: readonly MidiNote[], played: readonly MidiNote[], key: Key = C_MAJOR): ReadVerdict {
  const want = [...new Set(target)].sort((a, b) => a - b);
  const got = [...new Set(played)].sort((a, b) => a - b);

  if (want.length === 1) {
    const w = want[0]!;
    const g = got[0]!;
    if (got.length === 1 && g === w) return { correct: true, message: `Yes, that's ${writtenName(w, key)}.`, mistake: null };
    if (got.length === 1 && pitchClass(g) === pitchClass(w)) {
      const dir = g > w ? 'lower' : 'higher';
      const octaves = Math.abs(g - w) / 12;
      return {
        correct: false,
        message: `Right note, wrong octave. The staff shows ${writtenName(w, key)}, ${octaves === 1 ? 'one octave' : `${octaves} octaves`} ${dir} than you played.`,
        mistake: 'wrong-octave',
      };
    }
    const dir = g > w ? 'lower' : 'higher';
    return { correct: false, message: `You played ${list(got, key)}. The staff shows ${writtenName(w, key)}, ${dir}.`, mistake: 'wrong-note' };
  }

  const missing = want.filter((n) => !got.includes(n));
  const extra = got.filter((n) => !want.includes(n));
  if (!missing.length && !extra.length) return { correct: true, message: `Yes, that's ${list(want, key)}.`, mistake: null };

  const samePcs = (a: readonly MidiNote[], b: readonly MidiNote[]) => {
    const pa = new Set(a.map(pitchClass));
    const pb = new Set(b.map(pitchClass));
    return pa.size === pb.size && [...pa].every((p) => pb.has(p));
  };
  if (samePcs(want, got)) {
    return { correct: false, message: `Right notes, but not where the staff puts them. It shows ${list(want, key)}.`, mistake: 'wrong-octave' };
  }
  const parts: string[] = [];
  if (missing.length) parts.push(`Missing ${list(missing, key)}.`);
  if (extra.length) parts.push(`${list(extra, key)} ${extra.length === 1 ? "isn't" : "aren't"} on the staff.`);
  return { correct: false, message: parts.join(' '), mistake: missing.length ? 'missing-notes' : 'extra-notes' };
}
