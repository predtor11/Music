/**
 * Builds today's practice: about 12 minutes, five blocks with two short rests
 * between them, leaning on the left hand (about 60/40) because it is the one
 * that needs more. What comes up rotates by day, and blocks you have not got
 * clean yet come back sooner.
 */

import {
  FINGER_PATTERNS,
  PROGRESSIONS,
  PROGRESSION_KEYS,
  boomChickExercise,
  fingerExercise,
  jumpExercise,
  mirrorExercise,
  notesExercise,
  progressionExercise,
  shapeExercise,
  type Exercise,
  type Focus,
  type HandChoice,
  type Mode,
} from './exercises.js';
import { runSeconds as secondsAt, startTempo } from './score.js';
import { dayNumber, easeFactor, type DailyData } from './storage.js';


export interface WorkItem {
  type: 'work';
  /** What the block is for, shown as its heading. */
  role: string;
  exercise: Exercise;
  mode: Mode;
  /** Passes through the drill (holds for stability). */
  reps: number;
  /** Where the tempo starts, beats per minute (speed and control). */
  tempo: number;
  /** Seconds to hold each beat (stability). */
  hold: number;
}

export interface RestItem {
  type: 'rest';
  seconds: number;
  /** Ask "does it feel stiff?" first. */
  check: boolean;
}

export type PlanItem = WorkItem | RestItem;

export interface Plan {
  day: string;
  minutes: number;
  items: PlanItem[];
  /** Share of playing time on the left hand, 0 to 1. */
  leftShare: number;
}

const REST_SECONDS = 25;

const FINGER_ORDER = FINGER_PATTERNS.map((p) => p.id);
const WEAK_PATTERNS = FINGER_PATTERNS.filter((p) => p.pattern.filter((f) => f === 3 || f === 4).length >= 3).map((p) => p.id);

const TOPICS: Focus[] = ['move', 'progression', 'shape', 'notes', 'mirror'];

const DEFAULT_SPEED: Record<Focus, number> = { finger: 80, move: 44, shape: 50, progression: 44, notes: 40, mirror: 60 };
const DEFAULT_CONTROL: Record<Focus, number> = { finger: 56, move: 36, shape: 40, progression: 36, notes: 36, mirror: 48 };

const weights = (hand: HandChoice) => ({ left: hand === 'left' ? 1 : hand === 'both' ? 0.5 : 0, right: hand === 'right' ? 1 : hand === 'both' ? 0.5 : 0 });

export function leftShare(items: readonly PlanItem[]): number {
  let l = 0;
  let r = 0;
  for (const it of items) {
    if (it.type !== 'work') continue;
    const w = weights(it.exercise.hand);
    l += w.left;
    r += w.right;
  }
  return l + r === 0 ? 0.5 : l / (l + r);
}

/** The beats a stability block holds: a short run, since each beat is held for seconds. */
export function stabilityBeats(ex: Exercise) {
  return ex.focus === 'finger' ? ex.beats.slice(0, 5) : ex.beats.slice(0, 4);
}

function topic(focus: Focus, hand: 'left' | 'right', n: number): Exercise {
  switch (focus) {
    case 'move':
      return n % 3 === 2 && hand === 'left' ? boomChickExercise() : jumpExercise(hand, n % 2 === 0 ? 'near' : 'far');
    case 'progression': {
      const prog = PROGRESSIONS[n % PROGRESSIONS.length]!;
      const key = PROGRESSION_KEYS[Math.floor(n / PROGRESSIONS.length) % PROGRESSION_KEYS.length]!;
      return progressionExercise(hand, prog.id, key.id);
    }
    case 'shape':
      return shapeExercise(hand, n % 2 === 0 ? 'root' : 'inversions');
    case 'notes':
      return notesExercise(hand, n);
    case 'mirror':
      return mirrorExercise();
    default:
      return fingerExercise(hand, FINGER_ORDER[n % FINGER_ORDER.length]!);
  }
}

const MODES: Mode[] = ['speed', 'control', 'stability'];

export function buildPlan(day: string, data: DailyData, minutes = 12): Plan {
  const n = dayNumber(day);
  const ease = easeFactor(data.stiff, day);
  const slotSeconds = (minutes * 60 - REST_SECONDS * 2) / 5;

  const item = (role: string, exercise: Exercise, mode: Mode): WorkItem => {
    const st = data.ex[exercise.id];
    const tempo = mode === 'speed' ? startTempo(st?.speed, DEFAULT_SPEED[exercise.focus], ease) : startTempo(st?.control, DEFAULT_CONTROL[exercise.focus], ease);
    const hold = Math.max(2, st?.hold ?? 3);
    const beats = mode === 'stability' ? stabilityBeats(exercise).length : exercise.beats.length;
    const perRep = mode === 'stability' ? beats * (hold + 1.5) : secondsAt(exercise.beats, tempo) + 3;
    const reps = Math.max(2, Math.min(6, Math.round(slotSeconds / perRep)));
    return { type: 'work', role, exercise, mode, reps, tempo, hold };
  };

  // Today's topic block; a topic you have not got clean comes up in preference.
  const topicFocus = TOPICS[n % TOPICS.length]!;
  const mirrorDay = topicFocus === 'mirror';
  const topicHand: 'left' | 'right' = n % 2 === 0 ? 'left' : 'right';
  const topicEx = topic(topicFocus, topicHand, Math.floor(n / TOPICS.length));
  const topicMode: Mode = topicFocus === 'shape' ? 'stability' : topicFocus === 'notes' ? 'speed' : topicFocus === 'mirror' ? 'control' : MODES[(n + 1) % 2]!;

  const weakId = WEAK_PATTERNS[n % WEAK_PATTERNS.length]!;
  const fingerLeftMode: Mode = (['control', 'stability', 'speed'] as const)[n % 3]!;

  // Slow holds to finish: chord shapes, or a finger run when the topic block already was shapes.
  const coolHand: 'left' | 'right' = mirrorDay || topicHand === 'right' ? 'left' : 'right';
  const coolDown = topicFocus === 'shape' ? fingerExercise(coolHand, 'run') : shapeExercise(coolHand, 'root');

  const items: PlanItem[] = [
    item('Warm-up', fingerExercise('left', 'run'), 'control'),
    item('Fingers', fingerExercise('right', FINGER_ORDER[(n + 1) % FINGER_ORDER.length]!), n % 2 === 0 ? 'speed' : 'control'),
    { type: 'rest', seconds: REST_SECONDS, check: true },
    item('Left-hand fingers 3 and 4', fingerExercise('left', weakId), fingerLeftMode),
    item(roleFor(topicFocus), topicEx, topicMode),
    { type: 'rest', seconds: REST_SECONDS, check: true },
    // Cool-down: slow holds, the left hand unless the topic block already gave it a lot.
    item('Steady holds', coolDown, 'stability'),
  ];
  return { day, minutes, items, leftShare: leftShare(items) };
}

function roleFor(f: Focus): string {
  return { finger: 'Fingers', move: 'Hand movement', shape: 'Chord shapes', progression: 'Progressions', notes: 'Note finding', mirror: 'Both hands, mirrored' }[f];
}

/** Play time in seconds each hand had, from the blocks played. Used for the day's log. */
export function handSeconds(item: WorkItem, seconds: number): { leftSec: number; rightSec: number } {
  const w = weights(item.exercise.hand);
  return { leftSec: seconds * w.left, rightSec: seconds * w.right };
}
