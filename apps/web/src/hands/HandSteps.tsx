/**
 * The two kinds of hand-session step. Explain: text with the hands resting on
 * the keyboard, and a Watch button that plays the demo with the fingers
 * moving. Drill: play the beats in order on your keyboard; the hand shows the
 * finger for each key, the key glows, and the app marks it right or wrong.
 * The app hears keys, not fingers, so the finger is guided, not graded.
 */

import type { HandSide, TechniqueBeat, TechniqueStep, UserSettings } from '@music/contracts';
import { C_MAJOR } from '@music/theory';
import { Badge, Button, Swap, pop } from '@music/ui';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { playChord } from '../audio/sound.js';
import { useNoteInput, useNoteOn } from '../input/NoteInput.js';
import { LiveKeyboard } from '../keyboard/LiveKeyboard.js';
import type { KeyMark } from '../keyboard/PianoKeyboard.js';
import { noteLabeller } from '../keyboard/labels.js';
import type { KeyboardSize } from '../keyboard/layout.js';
import { Prose } from '../lesson/Prose.js';
import { HandOverlay } from './HandOverlay.js';
import { SLIPS_ALLOWED, beatFingers, handsAt, steadiness, type FingerId } from './fingering.js';
import s from './hands.module.css';
import ls from '../lesson/lesson.module.css';

const DEMO_GAP_MS = 750;
const FLASH_MS = 450;

function middle(hands: readonly { keys: number[] }[]): number {
  const keys = hands.flatMap((h) => h.keys);
  return Math.round((Math.min(...keys) + Math.max(...keys)) / 2);
}

/** Explain step: the text, the hands at rest, and the demo on Watch. */
export function HandExplain({ step, size, settings }: { step: Extract<TechniqueStep, { type: 'explain' }>; size: KeyboardSize; settings: UserSettings }) {
  const demo = step.demo ?? [];
  const [at, setAt] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const watch = useCallback(() => {
    clearTimeout(timer.current);
    const tick = (i: number) => {
      if (i >= demo.length) {
        timer.current = setTimeout(() => setAt(null), DEMO_GAP_MS);
        return;
      }
      setAt(i);
      void playChord(
        demo[i]!.notes.map((n) => n.midi),
        0.6,
      );
      timer.current = setTimeout(() => tick(i + 1), DEMO_GAP_MS);
    };
    tick(0);
  }, [demo]);

  const hands = useMemo(() => (at === null ? step.hands : handsAt(step.hands, demo, at)), [at, step.hands, demo]);
  const beat = at === null ? undefined : demo[at];
  const down = useMemo(() => beatFingers(beat), [beat]);
  const marks = useMemo(() => new Map<number, KeyMark>((beat?.notes ?? []).map((n) => [n.midi, 'target'])), [beat]);
  const labelFor = useMemo(() => noteLabeller(C_MAJOR, settings.noteNaming), [settings.noteNaming]);

  return (
    <>
      <Prose text={step.body} />
      {demo.length > 0 && (
        <div className={s.watchRow}>
          <Button variant="secondary" size="sm" onClick={watch} disabled={at !== null} data-testid="watch">
            {at === null ? '▶ Watch' : 'Watching…'}
          </Button>
          <span className={`ui-muted ${ls.small}`}>Then copy it with your own hand on your keyboard.</span>
        </div>
      )}
      <Legend hands={step.hands.map((h) => h.hand)} />
      <LiveKeyboard size={size} marks={marks} labelFor={labelFor} focusNote={middle(step.hands)} overlay={<HandOverlay size={size} hands={hands} down={down} cue={down} />} />
    </>
  );
}

function Legend({ hands }: { hands: HandSide[] }) {
  return (
    <div className={s.legend}>
      {hands.includes('left') && (
        <span>
          <span className={s.dot} style={{ background: 'var(--accent-2)' }} />
          Left hand
        </span>
      )}
      {hands.includes('right') && (
        <span>
          <span className={s.dot} style={{ background: 'var(--accent)' }} />
          Right hand
        </span>
      )}
      <span>Numbers are finger numbers: 1 is the thumb.</span>
    </div>
  );
}

interface Run {
  slips: number;
  steadiness: number | null;
  counts: boolean;
}

/** Drill step. Calls `onDone` once enough runs have counted. */
export function HandDrill({
  step,
  size,
  settings,
  onDone,
}: {
  step: Extract<TechniqueStep, { type: 'drill' }>;
  size: KeyboardSize;
  settings: UserSettings;
  onDone: () => void;
}) {
  const input = useNoteInput();
  const [beat, setBeat] = useState(0);
  const [slips, setSlips] = useState(0);
  const [runs, setRuns] = useState<Run[]>([]);
  const [flash, setFlash] = useState<Map<number, KeyMark>>(new Map());
  const [justPlayed, setJustPlayed] = useState<Set<FingerId>>(new Set());
  const hit = useRef(new Set<number>());
  const times = useRef<number[]>([]);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(flashTimer.current), []);

  const beats = step.beats;
  const current: TechniqueBeat | undefined = beats[beat];
  const hands = useMemo(() => handsAt(step.hands, beats, beat), [step.hands, beats, beat]);
  const cue = useMemo(() => beatFingers(current), [current]);
  const counted = runs.filter((r) => r.counts).length;
  const finished = counted >= step.rounds;

  const doneRef = useRef(false);
  useEffect(() => {
    if (finished && !doneRef.current) {
      doneRef.current = true;
      onDone();
    }
  }, [finished, onDone]);

  const showFlash = (marks: Map<number, KeyMark>, fingers: Set<FingerId>) => {
    clearTimeout(flashTimer.current);
    setFlash(marks);
    setJustPlayed(fingers);
    flashTimer.current = setTimeout(() => {
      setFlash(new Map());
      setJustPlayed(new Set());
    }, FLASH_MS);
  };

  useNoteOn((note) => {
    if (!current) return;
    const expected = current.notes.map((n) => n.midi);
    if (!expected.includes(note)) {
      setSlips((n) => n + 1);
      showFlash(new Map([[note, 'bad']]), new Set());
      return;
    }
    hit.current.add(note);
    if (!expected.every((m) => hit.current.has(m))) return;
    // Every key of the beat is down: on to the next.
    hit.current = new Set();
    times.current.push(performance.now());
    showFlash(new Map(expected.map((m) => [m, 'good'])), beatFingers(current));
    input.clear();
    if (beat + 1 < beats.length) {
      setBeat(beat + 1);
      return;
    }
    const run: Run = { slips, steadiness: steadiness(times.current), counts: slips <= SLIPS_ALLOWED };
    setRuns((r) => [...r, run]);
    setSlips(0);
    times.current = [];
    setBeat(0);
  });

  const marks = useMemo(() => {
    const m = new Map<number, KeyMark>((current?.notes ?? []).map((n) => [n.midi, 'target']));
    for (const [k, v] of flash) m.set(k, v);
    return m;
  }, [current, flash]);
  const labelFor = useMemo(() => noteLabeller(C_MAJOR, settings.noteNaming), [settings.noteNaming]);
  const last = runs[runs.length - 1];

  return (
    <>
      <Prose text={step.body} />
      <div className={s.drillHead}>
        <span className={`ui-muted ${ls.small}`} data-testid="run-count">
          {finished ? `Done: ${counted} good run${counted === 1 ? '' : 's'}. Keep going for practice, or press Next.` : `Run ${counted + 1} of ${step.rounds}`}
          {slips > 0 && ` · ${slips} wrong key${slips === 1 ? '' : 's'} this run`}
        </span>
        <div className={s.runs}>
          <AnimatePresence>
            {runs.map((r, i) => (
              <motion.span key={i} variants={pop} initial="hidden" animate="show">
                <Badge tone={r.counts ? 'good' : 'warn'} data-testid="run-badge">
                  {r.slips === 0 ? 'Clean' : `${r.slips} slip${r.slips === 1 ? '' : 's'}`}
                  {r.steadiness !== null && ` · steady ${r.steadiness}%`}
                </Badge>
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
      </div>
      {last && !last.counts && <span className={`ui-muted ${ls.small}`}>That run had a few wrong keys. Slow down and try it once more; slow and right beats fast.</span>}

      <ol className={s.strip} aria-label="Keys to play" data-testid="strip">
        {beats.map((b, i) => (
          <li key={i} className={s.chip} data-state={i < beat ? 'done' : i === beat ? 'now' : 'todo'}>
            <span className={s.chipFingers}>
              {b.notes.map((n, j) => (
                <span key={j} className={n.hand === 'left' ? s.hl : s.hr}>
                  {n.finger}
                </span>
              ))}
            </span>
            <span>{b.notes.map((n) => labelFor(n.midi)).join(' ')}</span>
          </li>
        ))}
      </ol>

      <Legend hands={step.hands.map((h) => h.hand)} />
      <LiveKeyboard size={size} marks={marks} labelFor={labelFor} focusNote={middle(hands)} overlay={<HandOverlay size={size} hands={hands} cue={cue} down={justPlayed} />} />
      {finished && (
        <Swap value="done">
          <span className="ui-gradient-text" data-testid="drill-done">
            Nice and steady.
          </span>
        </Swap>
      )}
    </>
  );
}
