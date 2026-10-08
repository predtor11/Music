/**
 * Ear-training items (`byEar`): the app plays the answer first and the
 * player finds it on the keyboard. Until they get it right or ask to see it,
 * nothing on screen names the answer or lights its keys, so a miss says only
 * which part was wrong and to listen again.
 */

import type { TestItem } from '@music/contracts';
import { pitchClass, type MidiNote } from '@music/theory';
import type { Clip } from '../audio/events.js';
import type { KeyMark } from '../keyboard/PianoKeyboard.js';
import { answerKeys, type ItemState } from './grade.js';

const MIDDLE_C = 60;

type EarItem = Extract<TestItem, { kind: 'find-note' | 'play-interval' | 'play-scale' | 'build-chord' }>;

export function isByEar(item: TestItem): item is EarItem & { byEar: true } {
  return 'byEar' in item && item.byEar === true;
}

/** What the app plays for a by-ear item: the answer itself. */
export function earClip(item: TestItem): Clip | null {
  if (!isByEar(item)) return null;
  switch (item.kind) {
    case 'find-note':
      return { kind: 'note', notes: answerKeys(item) };
    case 'play-interval': {
      // With no fixed start the player may begin anywhere; play it from middle C.
      const start = item.startMidi ?? MIDDLE_C;
      return { kind: 'sequence', notes: [start, start + item.semitones] };
    }
    case 'play-scale':
      return { kind: 'sequence', notes: answerKeys(item) };
    case 'build-chord':
      return { kind: 'chord', notes: answerKeys(item) };
  }
}

/** What to show while the answer is still hidden. */
export interface EarView {
  marks: ReadonlyMap<MidiNote, KeyMark>;
  message: string | null;
  hint: string | null;
}

/**
 * The screen for a by-ear item: the grader's marks and messages, minus
 * anything that gives the answer away. `revealed` shows everything.
 */
export function earView(item: TestItem, state: ItemState, revealed: boolean): EarView {
  const verdict = state.verdict;
  if (revealed || !isByEar(item) || verdict?.correct) {
    return { marks: state.marks, message: verdict?.message ?? null, hint: state.hint };
  }
  const marks = new Map([...state.marks].filter(([, m]) => m !== 'missed'));
  return { marks, message: verdict ? missMessage(item, state) : null, hint: earHint(item, state) };
}

function earHint(item: EarItem, state: ItemState): string | null {
  if (state.played.length === 0) return null;
  switch (item.kind) {
    case 'play-interval':
      return 'Good. Now the second note you heard.';
    case 'play-scale': {
      const total = answerKeys(item).length;
      return `${state.played.length} of ${total}. Keep going.`;
    }
    default:
      return state.hint;
  }
}

function missMessage(item: EarItem, state: ItemState): string {
  const last = state.played.at(-1);
  switch (item.kind) {
    case 'find-note': {
      if (item.midi !== undefined && last !== undefined) {
        if (pitchClass(last) === pitchClass(item.midi)) return 'Right note name, wrong octave. Listen again.';
        return `Not that one. The note you heard is ${last > item.midi ? 'lower' : 'higher'}.`;
      }
      return 'Not that one. Listen again and try another key.';
    }
    case 'play-interval':
      return state.played.length <= 1 ? 'That isn’t the first note. Listen again.' : 'The second note isn’t right. Listen again.';
    case 'play-scale':
      return `Note ${state.played.length} isn’t right. Listen again from the start.`;
    case 'build-chord': {
      if (state.verdict?.mistake === 'wrong-inversion') return 'Right notes, but a different one was at the bottom. Listen to the lowest note.';
      const right = [...state.marks.values()].filter((m) => m === 'good').length;
      return right > 0 ? `Close: ${right} of your notes ${right === 1 ? 'is' : 'are'} in it. Listen again.` : 'Not that chord. Listen again.';
    }
  }
}
