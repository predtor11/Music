/**
 * The practice player for one piece: pick a hand and some bars, then play
 * them in a loop. "Wait for me" stops on every note until you find it; "In
 * time" keeps a beat, starting slow and speeding up a notch after each clean
 * loop. The app can play the other hand softly, and Listen plays the loop.
 */

import type { HandSide, UserSettings } from '@music/contracts';
import type { Key } from '@music/theory';
import { Badge, Button, SegmentedControl, Switch, pop } from '@music/ui';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { playEvents } from '../audio/sound.js';
import { useNoteInput, useNoteOn } from '../input/NoteInput.js';
import { LiveKeyboard } from '../keyboard/LiveKeyboard.js';
import type { KeyMark } from '../keyboard/PianoKeyboard.js';
import { noteLabeller } from '../keyboard/labels.js';
import type { KeyboardSize } from '../keyboard/layout.js';
import { startClick } from '../lesson/kinds/click.js';
import { barBeats, barOf, barStart, type Piece, type PieceNote } from './piece.js';
import {
  HIT_WINDOW_S,
  MIN_TEMPO,
  isClean,
  judgeTimed,
  judgeWait,
  loopNotes,
  loopSpan,
  nextTempo,
  plays,
  steps as buildSteps,
  type HandChoice,
  type LoopResult,
  type Selection,
} from './practice.js';
import { Roll, type RollState } from './Roll.js';
import { saveTempo, savedTempo } from './storage.js';
import s from './pieces.module.css';

type Mode = 'wait' | 'time';
type Phase = 'idle' | 'count' | 'play' | 'listen';

const HAND_OPTIONS = [
  { value: 'right' as const, label: 'Right hand' },
  { value: 'left' as const, label: 'Left hand' },
  { value: 'both' as const, label: 'Both hands' },
];

const MODE_OPTIONS = [
  { value: 'wait' as const, label: 'Wait for me' },
  { value: 'time' as const, label: 'In time' },
];

const FLASH_MS = 350;
const OTHER_HAND_SECONDS_MAX = 2.5;

export interface PracticeProps {
  piece: Piece;
  musicKey: Key;
  size: KeyboardSize;
  settings: UserSettings;
  sel: Selection;
  onHands: (hands: HandChoice) => void;
  /** Called with the bar being played, or null when stopped. */
  onBar: (bar: number | null) => void;
  /** Called after every loop with the trouble (misses and wrong keys) per bar. */
  onLoop: (result: LoopResult) => void;
}

export function Practice({ piece, musicKey, size, settings, sel, onHands, onBar, onLoop }: PracticeProps) {
  const input = useNoteInput();
  const [mode, setMode] = useState<Mode>('wait');
  const [phase, setPhase] = useState<Phase>('idle');
  const [tempo, setTempoState] = useState(() => savedTempo(piece.id) ?? 50);
  const [accompany, setAccompany] = useState(true);
  const [metronome, setMetronome] = useState(false);
  const [results, setResults] = useState<{ result: LoopResult; tempo: number | null; clean: boolean }[]>([]);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [flash, setFlash] = useState<Map<number, KeyMark>>(new Map());
  const [, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const setTempo = useCallback(
    (t: number) => {
      setTempoState(t);
      saveTempo(piece.id, t);
    },
    [piece.id],
  );

  // What the loop holds: your notes first (their index is their id), then the other hand's.
  const span = useMemo(() => loopSpan(piece, sel), [piece, sel]);
  const { yours, others } = useMemo(() => loopNotes(piece, sel), [piece, sel]);
  const stepList = useMemo(() => buildSteps(piece, sel), [piece, sel]);
  const shift = (n: PieceNote): PieceNote => ({ ...n, start: n.start - span.from });
  const rollNotes = useMemo(() => [...yours, ...others].map(shift), [yours, others, span.from]); // eslint-disable-line react-hooks/exhaustive-deps
  const loopLen = span.to - span.from;
  const barLines = useMemo(() => {
    const lines: number[] = [];
    for (let b = barOf(piece, span.from); barStart(piece, b) <= span.to + 1e-6; b++) lines.push(barStart(piece, b) - span.from);
    return lines;
  }, [piece, span]);

  // Live state of the current loop, in refs so the frame loop and key presses see it at once.
  const hits = useRef(new Map<number, RollState>());
  const pressed = useRef(new Set<number>());
  const slips = useRef(0);
  const trouble = useRef(new Map<number, number>());
  const stepIndex = useRef(0);
  const otherPlayed = useRef(new Set<number>());
  const t0 = useRef(0);
  const frame = useRef(0);
  const stopClick = useRef<() => void>(() => {});
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const phaseRef = useRef<Phase>('idle');
  phaseRef.current = phase;

  const bpm = (piece.bpm * tempo) / 100;
  const spb = 60 / bpm;
  /** Beat inside the loop (0 = loop start) on the clock; negative during the count-in. */
  const clockBeat = useCallback(() => (performance.now() - t0.current) / 1000 / spb, [spb]);

  const resetLoop = useCallback(() => {
    hits.current = new Map();
    pressed.current = new Set();
    slips.current = 0;
    trouble.current = new Map();
    stepIndex.current = 0;
    otherPlayed.current = new Set();
    bump();
  }, [bump]);

  const stop = useCallback(() => {
    cancelAnimationFrame(frame.current);
    stopClick.current();
    stopClick.current = () => {};
    setPhase('idle');
    setCountdown(null);
    onBar(null);
    resetLoop();
    input.clear();
  }, [onBar, resetLoop, input]);

  // Stop when the selection or mode changes, and on leaving the page.
  useEffect(() => stop, [sel, mode]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => clearTimeout(flashTimer.current), []);

  const showFlash = (marks: Map<number, KeyMark>) => {
    clearTimeout(flashTimer.current);
    setFlash(marks);
    flashTimer.current = setTimeout(() => setFlash(new Map()), FLASH_MS);
  };

  const addTrouble = (bar: number) => trouble.current.set(bar, (trouble.current.get(bar) ?? 0) + 1);

  const finishLoop = useCallback(
    (timed: boolean) => {
      const hit = [...hits.current.values()].filter((v) => v === 'hit').length;
      const result: LoopResult = { notes: yours.length, hit, slips: slips.current, troubleByBar: new Map(trouble.current) };
      const clean = isClean(result);
      setResults((r) => [...r.slice(-7), { result, tempo: timed ? tempo : null, clean }]);
      onLoop(result);
      if (timed) setTempo(nextTempo(tempo, clean));
      return clean;
    },
    [yours.length, tempo, setTempo, onLoop],
  );

  // --- Wait for me -------------------------------------------------------

  /** The other hand's notes from this step up to the next, played softly at the practice tempo. */
  const accompanyStep = (i: number) => {
    if (!accompany || others.length === 0) return;
    const from = i === 0 ? span.from : stepList[i]!.at;
    const to = stepList[i + 1]?.at ?? span.to;
    const events = others
      .filter((n) => n.start >= from - 1e-6 && n.start < to - 1e-6)
      .map((n) => ({ midi: n.midi, at: Math.min((n.start - from) * spb, OTHER_HAND_SECONDS_MAX), dur: Math.min(n.dur * spb, OTHER_HAND_SECONDS_MAX) }));
    playEvents(events);
  };

  const startWait = () => {
    stop();
    resetLoop();
    setPhase('play');
    onBar(stepList[0]?.bar ?? null);
  };

  // --- In time and Listen ------------------------------------------------

  const runClock = useCallback(
    (listen: boolean) => {
      const countBeats = listen ? 0 : Math.max(2, Math.round(barBeats(piece)));
      resetLoop();
      t0.current = performance.now() + 80 + countBeats * spb * 1000;
      setPhase(listen ? 'listen' : 'count');
      if (!listen) {
        let heard = 0;
        stopClick.current();
        const stopper = startClick(bpm, () => {
          heard++;
          setCountdown(countBeats - heard + 1);
          if (heard >= countBeats && !metronome) stopper();
        }, Math.max(2, Math.round(barBeats(piece))));
        stopClick.current = stopper;
      }
      let lastBar = -1;
      const tick = () => {
        const beat = clockBeat();
        if (beat >= 0 && phaseRef.current === 'count') {
          setPhase('play');
          setCountdown(null);
        }
        // Play what the app plays: everything on Listen, the other hand (if on) while you practise.
        const auto = listen ? rollNotes : accompany ? rollNotes.slice(yours.length) : [];
        const base = listen ? 0 : yours.length;
        const due: { midi: number; at: number; dur: number }[] = [];
        auto.forEach((n, j) => {
          const id = listen ? j : base + j;
          if (otherPlayed.current.has(id) || n.start > beat + 0.15) return;
          otherPlayed.current.add(id);
          if (n.start >= beat - 0.05) due.push({ midi: n.midi, at: Math.max(0, (n.start - beat) * spb), dur: Math.min(n.dur * spb, OTHER_HAND_SECONDS_MAX) });
        });
        playEvents(due);
        // Your notes that went past without being played.
        if (!listen) {
          const late = (HIT_WINDOW_S * bpm) / 60;
          let changed = false;
          yours.forEach((n, i) => {
            if (!hits.current.has(i) && n.start - span.from < beat - late) {
              hits.current.set(i, 'miss');
              addTrouble(barOf(piece, n.start));
              changed = true;
            }
          });
          if (changed) bump();
        }
        const bar = beat >= 0 ? barOf(piece, span.from + Math.min(beat, loopLen - 1e-3)) : null;
        if (bar !== lastBar && bar !== null) {
          lastBar = bar;
          onBar(bar);
        }
        if (beat > loopLen + 0.5) {
          if (listen) {
            stop();
            return;
          }
          finishLoop(true);
          stopClick.current();
          stopClick.current = () => {};
          // The next loop starts on its own, at the new speed (read on the next render).
          setPhase('count');
          setTimeout(() => {
            if (phaseRef.current === 'count') runClockRef.current(false);
          }, 400);
          return;
        }
        frame.current = requestAnimationFrame(tick);
      };
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(tick);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [piece, spb, bpm, metronome, accompany, rollNotes, yours, span, loopLen, clockBeat, resetLoop, finishLoop, onBar, stop, bump],
  );

  const runClockRef = useRef(runClock);
  runClockRef.current = runClock;

  const startTime = () => {
    stop();
    runClock(false);
  };
  const listen = () => {
    stop();
    runClock(true);
  };

  // --- Key presses --------------------------------------------------------

  useNoteOn((note) => {
    if (phase !== 'play' && phase !== 'count') return;
    if (mode === 'wait') {
      const step = stepList[stepIndex.current];
      if (!step) return;
      const verdict = judgeWait(step, new Set([...pressed.current, ...input.heldSet]), note);
      if (verdict === 'slip') {
        slips.current++;
        addTrouble(step.bar);
        showFlash(new Map([[note, 'bad']]));
        bump();
        return;
      }
      pressed.current.add(note);
      if (verdict === 'partial') return;
      // Every key of the step is down: mark it and move on.
      for (const n of step.notes) hits.current.set(yours.indexOf(n), 'hit');
      showFlash(new Map(step.notes.map((n) => [n.midi, 'good'])));
      accompanyStep(stepIndex.current);
      pressed.current = new Set();
      input.clear();
      if (stepIndex.current + 1 < stepList.length) {
        stepIndex.current++;
        onBar(stepList[stepIndex.current]!.bar);
      } else {
        finishLoop(false);
        hits.current = new Map();
        slips.current = 0;
        trouble.current = new Map();
        stepIndex.current = 0;
        onBar(stepList[0]?.bar ?? null);
      }
      bump();
      return;
    }
    // In time.
    if (phase !== 'play') return;
    const beat = clockBeat();
    const shifted = yours.map(shift);
    const i = judgeTimed(shifted, new Set([...hits.current.keys()]), note, beat, bpm);
    if (i < 0) {
      slips.current++;
      addTrouble(barOf(piece, span.from + Math.max(0, beat)));
      showFlash(new Map([[note, 'bad']]));
    } else {
      hits.current.set(i, 'hit');
      showFlash(new Map([[note, 'good']]));
    }
    bump();
  });

  // --- What the keyboard shows -------------------------------------------

  // Built every render: it reads refs that change between renders.
  const marks = (() => {
    const m = new Map<number, KeyMark>();
    if (phase === 'play' || phase === 'count') {
      if (mode === 'wait') {
        for (const n of stepList[stepIndex.current]?.notes ?? []) if (!pressed.current.has(n.midi)) m.set(n.midi, 'target');
      } else {
        // The next notes you haven't played yet.
        const next = yours.findIndex((_, i) => !hits.current.has(i));
        if (next >= 0) for (const n of yours.filter((x) => Math.abs(x.start - yours[next]!.start) < 1e-6)) m.set(n.midi, 'target');
      }
    }
    for (const [k, v] of flash) m.set(k, v);
    return m;
  })();

  const labelFor = useMemo(() => noteLabeller(musicKey, settings.noteNaming), [musicKey, settings.noteNaming]);
  const waitNow = mode === 'wait' && phase === 'play' ? (stepList[stepIndex.current]?.at ?? span.from) - span.from : 0;
  const clock = phase === 'count' || phase === 'play' || phase === 'listen' ? (mode === 'time' || phase === 'listen' ? clockBeat : undefined) : undefined;
  const mine = useCallback((n: PieceNote) => phase !== 'listen' && plays(sel.hands, n.hand as HandSide), [phase, sel.hands]);
  const focus = yours.length ? Math.round(yours.reduce((a, n) => a + n.midi, 0) / yours.length) : 60;

  const lastResult = results[results.length - 1];
  const done = [...hits.current.values()].filter((v) => v === 'hit').length;
  const running = phase !== 'idle';

  return (
    <div className={s.page} data-testid="practice">
      <div className={s.controls}>
        <SegmentedControl label="Which hand" options={HAND_OPTIONS} value={sel.hands} onChange={onHands} />
        <SegmentedControl label="Practice mode" options={MODE_OPTIONS} value={mode} onChange={setMode} />
        {mode === 'time' && (
          <label className={s.tempo}>
            <span className="ui-field-label">
              Speed: <strong data-testid="tempo">{tempo}%</strong> ({Math.round(bpm)} beats a minute)
            </span>
            <input type="range" min={MIN_TEMPO} max={100} step={5} value={tempo} onChange={(e) => setTempo(Number(e.target.value))} disabled={running} aria-label="Speed" />
          </label>
        )}
      </div>
      <div className={s.row}>
        {sel.hands !== 'both' && <Switch checked={accompany} onChange={setAccompany} label="Play the other hand for me" />}
        {mode === 'time' && <Switch checked={metronome} onChange={setMetronome} label="Metronome" />}
      </div>

      <div className={s.between}>
        <div className={s.row}>
          {!running ? (
            <Button variant="primary" onClick={mode === 'wait' ? startWait : startTime} disabled={yours.length === 0} data-testid="start">
              {mode === 'wait' ? 'Start' : 'Start with count-in'}
            </Button>
          ) : (
            <Button variant="secondary" onClick={stop} data-testid="stop">
              Stop
            </Button>
          )}
          <Button variant="ghost" onClick={listen} disabled={running} data-testid="listen">
            ▶ Listen
          </Button>
        </div>
        <div className={s.stats} data-testid="loop-stats">
          {phase === 'count' && countdown !== null && (
            <motion.span key={countdown} className={`ui-gradient-text ${s.countIn}`} variants={pop} initial="hidden" animate="show">
              {countdown}
            </motion.span>
          )}
          {phase === 'play' && (
            <span className="ui-muted">
              {done} of {yours.length} notes{slips.current > 0 && ` · ${slips.current} wrong key${slips.current === 1 ? '' : 's'}`}
            </span>
          )}
          <AnimatePresence>
            {results.slice(-5).map((r, i) => (
              <motion.span key={results.length - 5 + i} variants={pop} initial="hidden" animate="show">
                <Badge tone={r.clean ? 'good' : 'warn'} data-testid="loop-badge">
                  {r.clean ? 'Clean' : `${r.result.notes - r.result.hit + r.result.slips} slips`}
                  {r.tempo !== null && ` · ${r.tempo}%`}
                </Badge>
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
      </div>

      <p className="ui-muted" data-testid="practice-hint">
        {yours.length === 0
          ? 'These bars have no notes for that hand. Pick the other hand or more bars.'
          : !running && !lastResult
            ? mode === 'wait'
              ? 'The app waits on every note until you play it, so you can find each key without hurry. Lit keys are the ones to play next.'
              : 'Start slow. After every clean loop the speed goes up 5%, until you reach full speed.'
            : lastResult && !running
              ? lastResult.clean
                ? 'That loop was clean. Go again, or pick the next bars.'
                : 'A few slips. The red numbers on the bars show where; loop just those bars.'
              : mode === 'time' && lastResult
                ? lastResult.clean
                  ? 'Clean loop, so it is a little faster now.'
                  : 'Same speed again until it is clean.'
                : ' '}
      </p>

      <LiveKeyboard
        size={size}
        marks={marks}
        labelFor={labelFor}
        focusNote={focus}
        above={<Roll size={size} notes={rollNotes} mine={mine} state={hits.current} now={waitNow} clock={clock} barLines={barLines} />}
      />
    </div>
  );
}
