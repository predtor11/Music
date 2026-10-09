/**
 * Grading for the play-by-ear trainer. Like the by-ear lesson items, a miss
 * says what was off without giving the answer away: no "missed" keys, and no
 * names of the notes you didn't play. Pure, so it is unit tested.
 */

import type { MistakeKind } from '@music/contracts';
import { identifyChord, keyScale, mod12, pitchClass, pretty, spelledPc, type MidiNote } from '@music/theory';
import type { KeyMark } from '../keyboard/PianoKeyboard.js';
import { gradeChord } from '../lesson/grade.js';
import { diatonicNumber } from '../lesson/kinds/progression-logic.js';
import type { ChordQuestion, KeyQuestion, MelodyQuestion } from './questions.js';

export interface EarVerdict {
  correct: boolean;
  message: string;
  mistake: MistakeKind | null;
  marks: Map<MidiNote, KeyMark>;
  /** Notes the verdict was made on, in the order played. */
  played: MidiNote[];
}

const withoutMissed = (marks: ReadonlyMap<MidiNote, KeyMark>) => new Map([...marks].filter(([, m]) => m !== 'missed'));

/** Grade the held keys against a chord question. Null while too few different notes are down to judge. */
export function gradeEarChord(q: ChordQuestion, held: readonly MidiNote[]): EarVerdict | null {
  const graded = gradeChord(q.item, held);
  if (!graded?.verdict) return null;
  const { correct, mistake } = graded.verdict;
  const base = { correct, mistake, marks: withoutMissed(graded.marks), played: graded.played };
  if (correct) return { ...base, message: 'Yes, that’s the chord.' };

  const playedChord = identifyChord(held, q.key);
  if (playedChord && playedChord.rootPc === q.rootPc && ['major', 'minor'].includes(playedChord.type.quality)) {
    return { ...base, message: 'Right root, wrong colour. Listen again: is it brighter or darker than what you played?' };
  }
  if (playedChord && q.numbered) {
    const number = diatonicNumber(playedChord.baseSymbol, q.key);
    if (number) return { ...base, message: `You played ${pretty(playedChord.baseSymbol)}, the ${number} chord. Not that one; listen again.` };
  }
  const right = [...graded.marks.values()].filter((m) => m === 'good').length;
  return { ...base, message: right > 0 ? `Close: ${right} of your notes ${right === 1 ? 'is' : 'are'} in it. Listen again.` : 'Not that chord. Listen again.' };
}

/** Where a tune stands: the notes played so far in this try. */
export interface TuneState {
  played: MidiNote[];
  marks: Map<MidiNote, KeyMark>;
  verdict: EarVerdict | null;
}

export const freshTune = (): TuneState => ({ played: [], marks: new Map(), verdict: null });

/** Feed one note-on to a tune question. Any octave counts. */
export function pressTune(q: MelodyQuestion, state: TuneState, n: MidiNote): TuneState {
  const played = [...state.played, n];
  const marks = new Map(state.marks);
  const i = played.length - 1;
  if (pitchClass(n) !== q.order[i]) {
    marks.set(n, 'bad');
    const verdict: EarVerdict = {
      correct: false,
      message: i === 0 ? 'The tune starts on the home note. Listen again.' : `Note ${i + 1} isn’t right. Listen again and start from the first note.`,
      mistake: 'wrong-note',
      marks,
      played,
    };
    return { played, marks, verdict };
  }
  marks.set(n, 'good');
  if (played.length === q.order.length) {
    return { played, marks, verdict: { correct: true, message: 'Yes, every note.', mistake: null, marks, played } };
  }
  return { played, marks, verdict: null };
}

/** Grade a home-note guess for a key question. */
export function pressKey(q: KeyQuestion, n: MidiNote): EarVerdict {
  const marks = new Map<MidiNote, KeyMark>();
  if (pitchClass(n) === q.tonicPc) {
    marks.set(n, 'good');
    return { correct: true, message: 'Yes, that’s home.', mistake: null, marks, played: [n] };
  }
  marks.set(n, 'bad');
  const inKey = keyScale(q.key).some((s) => spelledPc(s) === mod12(n));
  return {
    correct: false,
    message: inKey
      ? 'That note belongs to the key, but it isn’t home. Hum the last note you’d sing to finish, and find that.'
      : 'That note isn’t in this key at all. Listen again.',
    mistake: 'wrong-note',
    marks,
    played: [n],
  };
}
