import type { MistakeKind } from '@music/contracts';
import { keyName, pretty, type MidiNote } from '@music/theory';
import { Badge, Button, Feedback, Swap, fadeUp, pop, spring, stagger, type FeedbackSignal } from '@music/ui';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { playChord } from '../../audio/synth.js';
import { useNoteInput } from '../../input/NoteInput.js';
import type { KeyMark } from '../../keyboard/PianoKeyboard.js';
import { noteLabeller } from '../../keyboard/labels.js';
import { LiveKeyboard } from '../../keyboard/LiveKeyboard.js';
import type { ItemRunnerProps } from '../ItemRunner.js';
import s from '../lesson.module.css';
import { startClick } from './click.js';
import {
  chordKeys,
  chordNotesText,
  chordText,
  gradeProgressionChord,
  progressionKey,
  progressionLabel,
  progressionSteps,
  type ChordVerdict,
  type ProgressionItem,
  type ProgressionStep,
} from './progression.js';
import p from './progression.module.css';

/** How long the held keys must stay still before they are graded. */
const CHORD_SETTLE_MS = 300;
/** Pause on the finished progression before moving on. */
const NEXT_DELAY_MS = 1800;
/** Gap between chords when the progression is played back without a tempo. */
const PLAYBACK_GAP_MS = 1100;

type ChordStatus = 'todo' | 'current' | 'good' | 'missed';

/**
 * A chord progression, one chord at a time: "Play 1-5-6-4 in G". Each chord
 * is graded on the keys held, in any voicing; the bass only counts for slash
 * numerals. The numerals sit above the keyboard and fill in with chord names
 * as he plays, and a wrong chord is explained against the one wanted.
 * With a tempo, a click keeps time (timing isn't graded). By ear, the
 * progression is played first and the numerals stay hidden until played.
 */
export function Progression({ item: raw, mode, size, naming, onAttempt, onDone }: ItemRunnerProps) {
  const item = raw as ProgressionItem;
  const input = useNoteInput();
  const key = useMemo(() => progressionKey(item), [item]);
  const steps = useMemo(() => progressionSteps(item), [item]);
  const byEar = !!item.byEar;
  const showAnswer = mode === 'play-along' && !byEar;

  const [index, setIndex] = useState(0);
  const [statuses, setStatuses] = useState<ChordStatus[]>([]);
  const [verdict, setVerdict] = useState<ChordVerdict | null>(null);
  const [marks, setMarks] = useState<ReadonlyMap<MidiNote, KeyMark>>(new Map());
  const [finished, setFinished] = useState(false);
  const [signal, setSignal] = useState<FeedbackSignal | null>(null);
  const [clickOn, setClickOn] = useState(true);
  const [beat, setBeat] = useState<number | null>(null);

  const misses = useRef(0);
  const played = useRef<MidiNote[]>([]);
  const graded = useRef('');
  const started = useRef(performance.now());
  const playback = useRef<ReturnType<typeof setTimeout>[]>([]);

  const stopPlayback = () => {
    playback.current.forEach(clearTimeout);
    playback.current = [];
  };
  const playProgression = () => {
    stopPlayback();
    const gap = item.bpm ? (60_000 / item.bpm) * 2 : PLAYBACK_GAP_MS;
    steps.forEach((st, i) => playback.current.push(setTimeout(() => playChord(chordKeys(st), gap / 1000 + 0.2), i * gap)));
  };

  // A new question starts clean; by ear, it starts by playing the progression.
  useEffect(() => {
    setIndex(0);
    setStatuses(steps.map((_, i) => (i === 0 ? 'current' : 'todo')));
    setVerdict(null);
    setMarks(new Map());
    setFinished(false);
    setSignal(null);
    misses.current = 0;
    played.current = [];
    graded.current = '';
    started.current = performance.now();
    input.clear();
    if (byEar) playProgression();
    return stopPlayback;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  // The click, while a tempo is set and the progression isn't finished.
  useEffect(() => {
    if (!item.bpm || !clickOn || finished) {
      setBeat(null);
      return;
    }
    return startClick(item.bpm, setBeat);
  }, [item.bpm, clickOn, finished]);

  // Right answer: move on by itself.
  useEffect(() => {
    if (!finished) return;
    const t = setTimeout(onDone, NEXT_DELAY_MS);
    return () => clearTimeout(t);
  }, [finished, onDone]);

  const attempt = (correct: boolean, mistake: MistakeKind | null) =>
    onAttempt({ item, played: [...played.current], correct, retried: misses.current > 0, mistake, timeMs: performance.now() - started.current });

  // Each chord is graded on the keys held once they stop changing. Holding a
  // chord that was already graded doesn't grade it again for the next one.
  const heldKey = input.held.join(',');
  useEffect(() => {
    if (finished) return;
    const step = steps[index];
    if (!step) return;
    if (input.held.length === 0) {
      graded.current = '';
      if (verdict && !verdict.correct) setMarks(new Map());
      return;
    }
    if (heldKey === graded.current) return;
    const held = input.held;
    const t = setTimeout(() => {
      const v = gradeProgressionChord(step, held, key);
      if (!v) return;
      graded.current = heldKey;
      played.current.push(...held);
      setVerdict(v);
      setMarks(v.marks);
      setSignal({ kind: v.correct ? 'good' : 'bad', id: Date.now() });
      if (!v.correct) {
        attempt(false, v.mistake);
        misses.current++;
        setStatuses((all) => all.map((st, i) => (i === index ? 'missed' : st)));
        return;
      }
      const last = index + 1 >= steps.length;
      setStatuses((all) => all.map((st, i) => (i === index ? 'good' : i === index + 1 ? 'current' : st)));
      if (last) {
        attempt(true, null);
        setFinished(true);
      } else {
        setIndex(index + 1);
        // Keys clicked on screen stay down; lift them for the next chord.
        input.clear();
      }
    }, CHORD_SETTLE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heldKey, index, finished, steps, key]);

  const step = steps[index];
  const labelFor = useMemo(() => noteLabeller(key, naming), [key, naming]);
  const keyMarks = useMemo(() => {
    const out = new Map(marks);
    if (showAnswer && step && !finished && out.size === 0) for (const k of chordKeys(step)) out.set(k, 'target');
    return out;
  }, [marks, showAnswer, step, finished]);

  const label = progressionLabel(item);
  const status = finished ? 'good' : verdict && !verdict.correct ? 'bad' : 'listening';
  const message = finished
    ? `Yes! ${label} in ${pretty(keyName(key))}: ${steps.map(chordText).join(', ')}.`
    : verdict && !verdict.correct
      ? verdict.message
      : [verdict?.correct ? verdict.message : null, step ? nextHint(step, index, steps.length, key, showAnswer, byEar) : null].filter(Boolean).join(' ');

  if (steps.length === 0) {
    return (
      <div className={s.item}>
        <h2 className={`ui-title ${s.prompt}`} data-testid="prompt">
          {pretty(item.prompt)}
        </h2>
        <p className="ui-muted">This progression couldn't be read.</p>
        <div>
          <Button variant="secondary" onClick={onDone} data-testid="skip">
            Skip
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={s.item} data-testid="progression">
      <div className={s.promptRow}>
        <Badge tone={mode === 'quiz' ? 'warn' : 'accent'}>{mode === 'quiz' ? 'Quiz' : 'Play along'}</Badge>
        <Badge tone="neutral">Key of {pretty(keyName(key))}</Badge>
        {byEar && <Badge tone="neutral">By ear</Badge>}
        {misses.current > 0 && !finished && <Badge tone="neutral">Try {misses.current + 1}</Badge>}
      </div>
      <h2 className={`ui-title ${s.prompt}`} data-testid="prompt">
        {pretty(item.prompt)}
      </h2>

      <motion.ol className={p.chords} variants={stagger(0.06)} initial="hidden" animate="show">
        {steps.map((st, i) => {
          const state = statuses[i] ?? 'todo';
          const reveal = state === 'good' || showAnswer;
          return (
            <motion.li
              key={`${item.id}-${i}`}
              className={p.chord}
              data-state={state}
              data-testid={`chord-${i}`}
              variants={pop}
              layout
              transition={spring.gentle}
            >
              <span className={p.numeral}>{byEar && state !== 'good' ? '?' : pretty(st.numeral)}</span>
              <span className={p.symbol} data-testid={`chord-name-${i}`}>
                <Swap value={reveal ? chordText(st) : '?'}>{reveal ? chordText(st) : '?'}</Swap>
              </span>
              {state === 'current' && <motion.span className={p.now} layoutId={`now-${item.id}`} transition={spring.snappy} />}
            </motion.li>
          );
        })}
      </motion.ol>

      <div className={p.tools}>
        <Button variant="ghost" size="sm" onClick={playProgression} data-testid="hear-progression">
          {byEar ? 'Play it again' : 'Hear it'}
        </Button>
        {item.bpm && (
          <>
            <Button variant="ghost" size="sm" onClick={() => setClickOn((on) => !on)} data-testid="click-toggle" aria-pressed={clickOn}>
              {clickOn ? 'Click on' : 'Click off'} · {item.bpm} bpm
            </Button>
            <span className={p.beats} aria-hidden>
              {[0, 1, 2, 3].map((b) => (
                <span key={b} className={p.beat} data-on={beat === b} data-accent={b === 0} />
              ))}
            </span>
          </>
        )}
      </div>

      <div className={s.messageRow} data-testid="item-message">
        <Swap value={`${status}-${message}`}>
          <span className={s.message} data-status={status}>
            {message}
          </span>
        </Swap>
      </div>

      <Feedback signal={signal}>
        <LiveKeyboard size={size} marks={keyMarks} labelFor={labelFor} names={mode === 'quiz' && !verdict ? 'c' : 'held'} focusNote={step ? chordKeys(step)[0] : 60} />
      </Feedback>

      <AnimatePresence>
        {verdict && !verdict.correct && !finished && step && (
          <motion.div className={s.retryRow} variants={fadeUp} initial="hidden" animate="show" exit="exit">
            <span className="ui-muted">Play chord {index + 1} again to retry.</span>
            <Button variant="ghost" size="sm" onClick={() => playChord(chordKeys(step))} data-testid="hear-answer">
              Hear {byEar ? 'the chord' : chordText(step)}
            </Button>
            <Button variant="ghost" size="sm" onClick={onDone} data-testid="skip">
              Skip
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** What to play next, as much as the mode gives away. */
function nextHint(step: ProgressionStep, index: number, total: number, key: ReturnType<typeof progressionKey>, showAnswer: boolean, byEar: boolean): string {
  const which = index === 0 ? 'First' : index + 1 === total ? 'Last' : `Chord ${index + 1}`;
  if (byEar) return `${which}: play chord ${index + 1} of ${total}.`;
  if (showAnswer) return `${which}: the ${pretty(step.numeral)} chord, ${chordText(step)} (${chordNotesText(step, key)}).`;
  return `${which}: the ${pretty(step.numeral)} chord.`;
}
