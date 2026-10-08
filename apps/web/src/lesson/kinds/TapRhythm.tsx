/**
 * Tap-rhythm: the rhythm is written out and drawn on a timeline. "Listen"
 * plays it after a bar of clicks; "Start" counts you in and you tap it on any
 * key. Taps are graded with gradeRhythm and drawn early or late on the line.
 */

import type { TestItem } from '@music/contracts';
import { gradeRhythm, pretty, type RhythmGrade } from '@music/theory';
import { Badge, Button, Feedback, Swap, fadeUp, type FeedbackSignal } from '@music/ui';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNoteOn } from '../../input/NoteInput.js';
import { LiveKeyboard } from '../../keyboard/LiveKeyboard.js';
import { noteLabeller } from '../../keyboard/labels.js';
import { RhythmStaff } from '../../notation/RhythmStaff.js';
import { barsFor, beatsPerBar, type RhythmPattern } from '../../notation/rhythm.js';
import type { StaffTone } from '../../notation/Staff.js';
import { BeatCounter } from '../../rhythm/BeatCounter.js';
import { rhythmMarks } from '../../rhythm/marks.js';
import { startMetronome, type MetronomeRun } from '../../rhythm/metronome.js';
import { Timeline } from '../../rhythm/Timeline.js';
import { useBeat } from '../../rhythm/useBeat.js';
import type { ItemRunnerProps } from '../ItemRunner.js';
import s from '../lesson.module.css';

type TapItem = Extract<TestItem, { kind: 'tap-rhythm' }>;
type Phase = 'ready' | 'listen' | 'tap' | 'graded';

const NEXT_DELAY_MS = 1600;

export function TapRhythm(props: ItemRunnerProps) {
  return <TapRhythmRunner {...props} item={props.item as TapItem} />;
}

function TapRhythmRunner({ item, mode, size, naming, keyOf, onAttempt, onDone }: ItemRunnerProps & { item: TapItem }) {
  const pattern: RhythmPattern = useMemo(
    () => ({ timeSignature: item.timeSignature, onsets: item.onsets, durations: item.durations }),
    [item.timeSignature, item.onsets, item.durations],
  );
  const perBar = beatsPerBar(item.timeSignature);
  const totalBeats = barsFor(pattern) * perBar;
  const beatLen = 60_000 / item.bpm;
  const toleranceMs = item.toleranceMs;

  const [phase, setPhase] = useState<Phase>('ready');
  const [run, setRun] = useState<MetronomeRun | null>(null);
  const [taps, setTaps] = useState<number[]>([]);
  const [grade, setGrade] = useState<RhythmGrade | null>(null);
  const [tries, setTries] = useState(0);
  const [signal, setSignal] = useState<FeedbackSignal | null>(null);
  const tapsRef = useRef<number[]>([]);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const runRef = useRef(run);
  runRef.current = run;
  const started = useRef(performance.now());
  const beat = useBeat(run, perBar);

  const stop = useCallback(() => {
    runRef.current?.stop();
    setRun(null);
  }, []);

  useEffect(() => {
    stop();
    setPhase('ready');
    setTaps([]);
    tapsRef.current = [];
    setGrade(null);
    setTries(0);
    setSignal(null);
    started.current = performance.now();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);
  useEffect(() => stop, [stop]);

  const begin = useCallback(
    async (next: 'listen' | 'tap') => {
      stop();
      setGrade(null);
      setTaps([]);
      tapsRef.current = [];
      setPhase(next);
      const r = await startMetronome({
        bpm: item.bpm,
        beatsPerBar: perBar,
        countInBeats: perBar,
        beats: totalBeats,
        clickThrough: true,
        pattern: next === 'listen' ? item.onsets : undefined,
      });
      setRun(r);
    },
    [item.bpm, item.onsets, perBar, totalBeats, stop],
  );

  // Any key is a tap. Taps in the count-in are ignored; the count-in is for listening.
  useNoteOn(() => {
    const r = runRef.current;
    if (phaseRef.current !== 'tap' || !r) return;
    const now = performance.now();
    if (now < r.startMs - toleranceMs) return;
    tapsRef.current = [...tapsRef.current, now];
    setTaps(tapsRef.current);
  });

  // When the pattern is over (plus a moment for a late last tap), grade it.
  useEffect(() => {
    if (!run) return;
    const t = setTimeout(
      () => {
        setRun(null);
        if (phaseRef.current === 'listen') {
          setPhase('ready');
          return;
        }
        const tapped = tapsRef.current;
        const g = gradeRhythm(item.onsets, tapped, item.bpm, run.startMs, toleranceMs);
        setGrade(g);
        setPhase('graded');
        onAttempt({
          item,
          played: tapped.map((t) => Math.round(t - run.startMs)),
          correct: g.correct,
          retried: tries > 0,
          mistake: g.correct ? null : g.missing > 0 ? 'missing-notes' : 'extra-notes',
          timeMs: performance.now() - started.current,
        });
        setSignal({ kind: g.correct ? 'good' : 'bad', id: Date.now() });
        setTries((n) => n + 1);
      },
      Math.max(0, run.endMs + toleranceMs - performance.now()),
    );
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run]);

  useEffect(() => {
    if (!grade?.correct) return;
    const t = setTimeout(onDone, NEXT_DELAY_MS);
    return () => clearTimeout(t);
  }, [grade, onDone]);

  // Beat 0 of the last run, kept after it ends so graded taps stay in place.
  const lastStart = useRef(0);
  if (run) lastStart.current = run.startMs;
  const marks = useMemo(() => (grade && !run ? rhythmMarks(grade, taps, lastStart.current, beatLen) : null), [grade, taps, run, beatLen]);

  // Live taps sit where they landed; graded ones carry their timing.
  const timelineTaps = marks ? marks.taps : taps.map((t) => ({ beat: (t - (run?.startMs ?? lastStart.current)) / beatLen }));
  const tones = useMemo(() => {
    if (!grade) return undefined;
    const m = new Map<number, StaffTone>();
    grade.hits.forEach((h, i) => m.set(i, h.offsetMs === null ? 'bad' : 'good'));
    return m;
  }, [grade]);
  // Light the note that starts in the current beat.
  let activeOnset = -1;
  if (beat !== null && beat >= 0) item.onsets.forEach((o, i) => o >= beat && o < beat + 1 && activeOnset < 0 && (activeOnset = i));

  const labelFor = useMemo(() => noteLabeller(keyOf, naming), [keyOf, naming]);
  const playing = phase === 'listen' || phase === 'tap';
  const phaseText =
    phase === 'listen' ? (beat !== null && beat < 0 ? 'Count-in…' : 'Listen') : phase === 'tap' ? (beat !== null && beat < 0 ? 'Get ready…' : 'Tap now') : `${item.bpm} beats per minute`;
  const status = grade ? (grade.correct ? 'good' : 'bad') : 'listening';
  const idleText = phase === 'tap' ? 'Tap any key in time with the notes.' : 'Press Listen to hear it, then Start and tap it on any key.';

  return (
    <div className={s.item} data-testid="tap-rhythm" data-phase={phase} data-start-ms={run?.startMs ?? ''} data-beat-ms={beatLen}>
      <div className={s.promptRow}>
        <Badge tone={mode === 'quiz' ? 'warn' : 'accent'}>{mode === 'quiz' ? 'Quiz' : 'Play along'}</Badge>
        <Badge tone="neutral">
          {item.timeSignature[0]}/{item.timeSignature[1]} · {item.bpm} bpm
        </Badge>
        {tries > 0 && !grade?.correct && <Badge tone="neutral">Try {tries + 1}</Badge>}
      </div>
      <h2 className={`ui-title ${s.prompt}`} data-testid="prompt">
        {pretty(item.prompt)}
      </h2>

      <Feedback signal={signal}>
        <div className="ui-stack" style={{ gap: 'var(--space-3)' }}>
          <RhythmStaff pattern={pattern} tones={tones} active={activeOnset >= 0 ? activeOnset : null} />
          <Timeline
            totalBeats={totalBeats}
            beatsPerBar={perBar}
            onsets={item.onsets}
            toleranceBeats={toleranceMs / beatLen}
            targets={marks?.targets ?? null}
            taps={timelineTaps}
            run={run}
          />
        </div>
      </Feedback>

      <BeatCounter beatsPerBar={perBar} beat={beat} phase={phaseText} />

      <div className={s.messageRow} data-testid="item-message">
        <Swap value={`${status}-${grade?.message ?? phase}-${tries}`}>
          <span className={s.message} data-status={status}>
            {grade ? grade.message : idleText}
          </span>
        </Swap>
      </div>

      <div className={s.retryRow}>
        {!grade?.correct && (
          <>
            <Button variant="secondary" size="sm" disabled={playing} onClick={() => void begin('listen')} data-testid="listen">
              Listen
            </Button>
            <Button variant="primary" size="sm" disabled={playing} onClick={() => void begin('tap')} data-testid="start">
              {grade ? 'Try again' : 'Start'}
            </Button>
          </>
        )}
        <AnimatePresence>
          {grade && !grade.correct && (
            <motion.span variants={fadeUp} initial="hidden" animate="show" exit="exit">
              <Button variant="ghost" size="sm" onClick={onDone} data-testid="skip">
                Skip
              </Button>
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <LiveKeyboard size={size} labelFor={labelFor} names="c" />
    </div>
  );
}
