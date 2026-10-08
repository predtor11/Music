/**
 * Graders: compare what was played with what was asked, and explain a miss in
 * plain words ("You played F. F♯ is one half step higher.").
 */

import { intervalInfo, stepName } from './intervals.js';
import { midiName, mod12, pcName, pitchClass, pretty, type MidiNote, type PitchClass, type Spelling } from './notes.js';

export interface NoteTarget {
  /** Any octave is accepted when only a pitch class is given. */
  pc?: PitchClass;
  /** An exact key when the octave matters. */
  midi?: MidiNote;
}

export interface NoteGrade {
  correct: boolean;
  /** Signed half steps from what was played to the target (positive = target is higher). */
  offset: number;
  message: string;
}

export function gradeNote(target: NoteTarget, played: MidiNote, spelling: Spelling = 'sharp'): NoteGrade {
  if (target.midi !== undefined) {
    const offset = target.midi - played;
    if (offset === 0) return { correct: true, offset, message: `Yes, that's ${pretty(midiName(played, spelling))}.` };
    if (mod12(offset) === 0) {
      const dir = offset > 0 ? 'higher' : 'lower';
      const octaves = Math.abs(offset) / 12;
      return {
        correct: false,
        offset,
        message: `Right note, wrong octave. ${pretty(midiName(target.midi, spelling))} is ${octaves === 1 ? 'one octave' : `${octaves} octaves`} ${dir}.`,
      };
    }
    return { correct: false, offset, message: missMessage(pitchClass(played), offset, midiName(target.midi, spelling), spelling) };
  }
  if (target.pc === undefined) throw new Error('gradeNote needs pc or midi');
  let offset = mod12(target.pc - pitchClass(played));
  if (offset > 6) offset -= 12;
  if (offset === 0) return { correct: true, offset, message: `Yes, that's ${pretty(pcName(target.pc, spelling))}.` };
  return { correct: false, offset, message: missMessage(pitchClass(played), offset, pcName(target.pc, spelling), spelling) };
}

function missMessage(playedPc: PitchClass, offset: number, targetName: string, spelling: Spelling): string {
  const dir = offset > 0 ? 'higher' : 'lower';
  return `You played ${pretty(pcName(playedPc, spelling))}. ${pretty(targetName)} is ${stepName(offset)} ${dir}.`;
}

export interface SetGrade {
  correct: boolean;
  missing: PitchClass[];
  extra: PitchClass[];
}

/** Grade a chord by pitch classes: any voicing or inversion counts. */
export function gradePitchClassSet(expected: readonly PitchClass[], played: readonly MidiNote[]): SetGrade {
  const want = new Set(expected.map(mod12));
  const got = new Set(played.map(pitchClass));
  const missing = [...want].filter((pc) => !got.has(pc));
  const extra = [...got].filter((pc) => !want.has(pc));
  return { correct: missing.length === 0 && extra.length === 0, missing, extra };
}

/** Grade an interval played as two notes, the first being the starting note. */
export function gradeInterval(start: MidiNote, semitonesUp: number, played: MidiNote): NoteGrade {
  const grade = gradeNote({ midi: start + semitonesUp }, played);
  if (grade.correct) return { ...grade, message: `Yes, that's a ${intervalInfo(semitonesUp).name}.` };
  return grade;
}
