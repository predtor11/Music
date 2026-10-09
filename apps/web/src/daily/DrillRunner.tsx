/**
 * One block of the daily session. Speed, control and stability each judge the
 * playing differently, from what the keyboard reports (when, how hard, which
 * keys); the finger numbers on screen are a guide, never graded.
 */

import type { UserSettings } from '@music/contracts';
import { C_MAJOR } from '@music/theory';
import { Badge, Button, Feedback, Swap, pop } from '@music/ui';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { HandOverlay } from '../hands/HandOverlay.js';
import { beatFingers, handsAt, type FingerId } from '../hands/fingering.js';
import hs from '../hands/hands.module.css';
import { useNoteInput } from '../input/NoteInput.js';
import { LiveKeyboard } from '../keyboard/LiveKeyboard.js';
import type { KeyMark } from '../keyboard/PianoKeyboard.js';
import { noteLabeller } from '../keyboard/labels.js';
import type { KeyboardSize } from '../keyboard/layout.js';
import ls from '../lesson/lesson.module.css';
import { startClick, type Click } from './click.js';
import s from './daily.module.css';
import { noteName } from './exercises.js';
import { holdProgress, newHold, nextHold, stepHold, type HoldState } from './hold.js';
import { stabilityBeats, type WorkItem } from './plan.js';
import { judgeRun, nextTempo, softestFinger, type RunData, type Verdict } from './score.js';

const FLASH_MS = 350;
const BETWEEN_MS = 1500;
const MODE_NAME = { speed: 'Speed', control: 'Control', stability: 'Stability' } as const;

export interface BlockResult {
  passes: { clean: boolean; score: number }[];
  /** Final tempo (speed, control) or hold seconds (stability), to remember for next time. */
  next: number;
  seconds: number;
  soft: ReturnType<typeof softestFinger>;
}

function middle(hands: readonly { keys: number[] }[]): number {
  const keys = hands.flatMap((h) => h.keys);
  return Math.round((Math.min(...keys) + Math.max(...keys)) / 2);
}

export function DrillRunner({ item, ease, size, settings, onDone }: { item: WorkItem; ease: number; size: KeyboardSize; settings: UserSettings; onDone: (r: BlockResult) => void }) {
  const input = useNoteInput();
  const { exercise, mode, reps } = item;
  const beats = useMemo(() => (mode === 'stability' ? stabilityBeats(exercise) : exercise.beats), [exercise, mode]);

  const [phase, setPhase] = useState<'intro' | 'play' | 'between' | 'done'>('intro');
  const [beat, setBeat] = useState(0);
  const [slips, setSlips] = useState(0);
  const [passes, setPasses] = useState<BlockResult['passes']>([]);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [flash, setFlash] = useState<Map<number, KeyMark>>(new Map());
  const [played, setPlayed] = useState<Set<FingerId>>(new Set());
  const [tempo, setTempo] = useState(() => Math.max(40, Math.round(item.tempo * ease)));
  const [hold, setHold] = useState(item.hold);
  const [holdView, setHoldView] = useState<HoldState>(newHold());
  const [progress, setProgress] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [clickOn, setClickOn] = useState(true);
  const [fb, setFb] = useState<{ kind: 'good' | 'bad'; id: number } | null>(null);
  const fbId = useRef(0);
  const signal = (kind: 'good' | 'bad') => setFb({ kind, id: (fbId.current += 1) });

  // Everything the key handler needs lives in a ref so a fast player never sees a stale value.
  const E = useRef({
    phase: 'intro' as 'intro' | 'play' | 'between' | 'done',
    beat: 0,
    slips: 0,
    hit: new Set<number>(),
    times: [] as number[],
    touches: [] as RunData['touches'],
    recent: [] as boolean[],
    passes: [] as BlockResult['passes'],
    allTouches: [] as RunData['touches'],
    tempo,
    hold,
    down: new Set<number>(),
    holdState: newHold(),
    beatFirstTry: true,
    cleanBeats: 0,
    startedAt: 0,
  });
  const click = useRef<Click | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      click.current?.stop();
    },
    [],
  );

  const showFlash = (marks: Map<number, KeyMark>, fingers: Set<FingerId>) => {
    setFlash(marks);
    setPlayed(fingers);
    later(() => {
      setFlash(new Map());
      setPlayed(new Set());
    }, FLASH_MS);
  };

  const setPhaseBoth = (p: typeof phase) => {
    E.current.phase = p;
    setPhase(p);
  };

  const resetPass = () => {
    const e = E.current;
    e.beat = 0;
    e.slips = 0;
    e.hit = new Set();
    e.times = [];
    e.touches = [];
    e.holdState = { ...newHold(), down: new Set(e.down) };
    e.beatFirstTry = true;
    e.cleanBeats = 0;
    setBeat(0);
    setSlips(0);
    setHoldView(e.holdState);
    setProgress(0);
  };

  const finishBlock = () => {
    const e = E.current;
    click.current?.stop();
    click.current = null;
    setPhaseBoth('done');
    const seconds = Math.round((performance.now() - e.startedAt) / 1000);
    onDone({ passes: e.passes, next: mode === 'stability' ? e.hold : e.tempo, seconds, soft: softestFinger(e.allTouches) });
  };

  const afterPass = (clean: boolean, score: number) => {
    const e = E.current;
    e.passes = [...e.passes, { clean, score }];
    setPasses(e.passes);
    if (e.passes.length >= reps) {
      finishBlock();
      return;
    }
    setPhaseBoth('between');
    later(() => {
      resetPass();
      setPhaseBoth('play');
    }, BETWEEN_MS);
  };

  const finishRun = () => {
    const e = E.current;
    if (mode === 'stability') return;
    const run: RunData = { slips: e.slips, times: e.times, touches: e.touches };
    const v = judgeRun(mode, run, e.tempo);
    e.allTouches = [...e.allTouches, ...e.touches];
    setVerdict(v);
    e.recent = [...e.recent, v.clean].slice(-4);
    if (mode === 'speed') {
      // Speed only goes up after a clean pass on pace.
      e.tempo = nextTempo(e.tempo, e.recent);
    } else {
      // Control: a slower click after two rough passes, a faster one only when it is even.
      e.tempo = nextTempo(e.tempo, e.recent, { min: 30, max: 120 });
    }
    setTempo(e.tempo);
    click.current?.setBpm(e.tempo);
    afterPass(v.clean, v.score);
  };

  const finishHoldPass = () => {
    const e = E.current;
    const total = beats.length;
    const clean = e.cleanBeats === total;
    const score = Math.round((e.cleanBeats / total) * 100);
    e.hold = nextHold(e.hold, clean);
    setHold(e.hold);
    setVerdict({ mode, score, clean, advice: clean ? 'Every shape held, nothing else sounded. The hold gets a second longer.' : 'Some shapes slipped. The hold stays short until they are all steady.', timing: null, touch: null, bpm: null });
    afterPass(clean, score);
  };

  const onKey = (ev: { type: 'on'; note: number; velocity: number } | { type: 'off'; note: number }, at: number) => {
    const e = E.current;
    if (ev.type === 'on') e.down.add(ev.note);
    else e.down.delete(ev.note);
    if (e.phase !== 'play') return;
    const current = beats[e.beat];
    if (!current) return;

    if (mode === 'stability') {
      const target = current.notes.map((n) => n.midi);
      const before = e.holdState;
      e.holdState = stepHold(e.holdState, target, { type: ev.type, note: ev.note, at });
      setHoldView(e.holdState);
      if (e.holdState.slips > before.slips) {
        showFlash(new Map([[ev.note, 'bad']]), new Set());
        e.beatFirstTry = false;
      }
      if (e.holdState.phase === 'waiting') {
        const extra = [...e.holdState.down].some((k) => !target.includes(k));
        setNote(extra ? 'Lift the other keys first, then press the shape.' : null);
      } else if (e.holdState.phase === 'holding') setNote(null);
      if (e.holdState.phase === 'failed') {
        e.beatFirstTry = false;
        signal('bad');
        setNote(e.holdState.reason === 'stray' ? 'Another key sounded. Keep the other fingers still.' : 'You let go early. Hold it down until the bar fills.');
        showFlash(new Map(target.map((m) => [m, 'bad'] as const)), new Set());
        later(() => {
          e.holdState = { ...newHold(), down: new Set(e.down) };
          setHoldView(e.holdState);
          setProgress(0);
          setNote(null);
        }, 1100);
      }
      return;
    }

    if (ev.type !== 'on') return;
    const n = current.notes.find((x) => x.midi === ev.note);
    if (!n) {
      e.slips += 1;
      setSlips(e.slips);
      showFlash(new Map([[ev.note, 'bad']]), new Set());
      return;
    }
    if (e.hit.has(ev.note)) return;
    e.hit.add(ev.note);
    e.touches.push({ finger: n.finger, hand: n.hand, velocity: ev.velocity });
    if (!current.notes.every((x) => e.hit.has(x.midi))) return;
    e.hit = new Set();
    e.times.push(at);
    showFlash(new Map(current.notes.map((x) => [x.midi, 'good'] as const)), beatFingers(current));
    if (e.beat + 1 < beats.length) {
      e.beat += 1;
      setBeat(e.beat);
      return;
    }
    finishRun();
  };

  const handler = useRef(onKey);
  handler.current = onKey;
  useEffect(
    () =>
      input.onPlayEvent((ev, at) => {
        if (ev.type === 'on') handler.current({ type: 'on', note: ev.note, velocity: ev.velocity }, at);
        else if (ev.type === 'off') handler.current({ type: 'off', note: ev.note }, at);
      }),
    [input],
  );

  // Stability: watch the hold bar fill.
  useEffect(() => {
    if (mode !== 'stability' || phase !== 'play') return;
    const id = setInterval(() => {
      const e = E.current;
      if (e.phase !== 'play') return;
      const p = holdProgress(e.holdState, performance.now(), e.hold * 1000);
      setProgress(p);
      if (p >= 1) {
        const cur = beats[e.beat];
        showFlash(new Map((cur?.notes ?? []).map((x) => [x.midi, 'good'] as const)), beatFingers(cur));
        signal('good');
        if (e.beatFirstTry) e.cleanBeats += 1;
        e.beatFirstTry = true;
        if (e.beat + 1 < beats.length) {
          e.beat += 1;
          setBeat(e.beat);
          e.holdState = { ...newHold(), down: new Set(e.down) };
          setHoldView(e.holdState);
          setProgress(0);
        } else {
          finishHoldPass();
        }
      }
    }, 50);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, phase, beats]);

  const start = () => {
    E.current.startedAt = performance.now();
    E.current.tempo = tempo;
    E.current.hold = hold;
    input.clear();
    resetPass();
    setPhaseBoth('play');
    if (mode !== 'stability' && clickOn) click.current = startClick(tempo);
  };

  useEffect(() => {
    if (!clickOn) {
      click.current?.stop();
      click.current = null;
    } else if (phase === 'play' && mode !== 'stability' && !click.current) {
      click.current = startClick(E.current.tempo);
    }
  }, [clickOn, phase, mode]);

  const current = beats[beat];
  const hands = useMemo(() => handsAt(exercise.hands, beats, beat), [exercise.hands, beats, beat]);
  const cue = useMemo(() => (exercise.blind ? new Set<FingerId>() : beatFingers(current)), [current, exercise.blind]);
  const marks = useMemo(() => {
    const m = new Map<number, KeyMark>(exercise.blind ? [] : (current?.notes ?? []).map((n) => [n.midi, 'target'] as const));
    for (const [k, v] of flash) m.set(k, v);
    return m;
  }, [current, flash, exercise.blind]);
  const labelFor = useMemo(() => noteLabeller(C_MAJOR, settings.noteNaming), [settings.noteNaming]);
  const playing = phase === 'play' || phase === 'between';

  const lede =
    mode === 'speed'
      ? `Play at ${tempo} beats a minute or faster. A clean pass at pace raises the target about 5%; wrong keys keep it where it is.`
      : mode === 'control'
        ? `Play on the click at ${tempo}. Aim for equal gaps and equal weight on every finger. The score comes from how even your timing and touch were.`
        : `Press each shape and hold it for ${hold} seconds without any other key sounding. A bar fills as you hold. The hold grows a second after each perfect pass.`;

  return (
    <div className={s.block} data-testid="drill-runner" data-mode={mode}>
      <div className={s.blockHead}>
        <div>
          <span className="ui-eyebrow">
            {item.role} · {MODE_NAME[mode]}
          </span>
          <h2 className="ui-heading" data-testid="drill-title">
            {exercise.title}
          </h2>
        </div>
        <Badge tone="neutral" data-testid="pass-count">
          Pass {Math.min(passes.length + (phase === 'done' ? 0 : 1), reps)} of {reps}
        </Badge>
      </div>
      <p className="ui-muted">{exercise.blurb}</p>

      {phase === 'intro' && (
        <div className={s.intro}>
          <p>{lede}</p>
          {item.exercise.weak >= 3 && <p className="ui-muted">Fingers 3 and 4 get most of the work here. Keep the hand relaxed; if it tightens, stop and shake it out.</p>}
          <div className={s.introActions}>
            <Button variant="primary" onClick={start} data-testid="start-block">
              Start
            </Button>
            {mode !== 'stability' && (
              <label className={s.toggle}>
                <input type="checkbox" checked={clickOn} onChange={(e) => setClickOn(e.target.checked)} /> Click
              </label>
            )}
          </div>
        </div>
      )}

      {playing && (
        <>
          <div className={s.stats}>
            {mode !== 'stability' && <Badge tone="accent">{tempo} bpm</Badge>}
            {mode === 'stability' && <Badge tone="accent">Hold {hold}s</Badge>}
            {slips > 0 && <Badge tone="warn">{slips} wrong key{slips === 1 ? '' : 's'}</Badge>}
            <AnimatePresence>
              {passes.map((p, i) => (
                <motion.span key={i} variants={pop} initial="hidden" animate="show">
                  <Badge tone={p.clean ? 'good' : 'warn'} data-testid="pass-badge">
                    {p.score}%
                  </Badge>
                </motion.span>
              ))}
            </AnimatePresence>
          </div>

          {exercise.blind && current && (
            <div className={s.prompt} data-testid="note-prompt">
              <Swap value={noteName(current.notes[0]!.midi) + beat}>
                <span className="ui-display ui-gradient-text">{noteName(current.notes[0]!.midi)}</span>
              </Swap>
            </div>
          )}

          {mode === 'stability' && (
            <Feedback signal={fb}>
              <div className={s.holdBar} role="progressbar" aria-label="Hold" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} data-testid="hold-bar">
                <motion.span className={s.holdFill} animate={{ scaleX: progress }} transition={{ duration: 0.05 }} />
              </div>
            </Feedback>
          )}
          <span className={`ui-muted ${s.note}`} aria-live="polite">
            {note}
          </span>

          {!exercise.blind && (
            <ol className={hs.strip} aria-label="Keys to play" data-testid="strip">
              {beats.map((b, i) => (
                <li key={i} className={hs.chip} data-state={i < beat ? 'done' : i === beat ? 'now' : 'todo'}>
                  <span className={hs.chipFingers}>
                    {b.notes.map((n, j) => (
                      <span key={j} className={n.hand === 'left' ? hs.hl : hs.hr}>
                        {n.finger}
                      </span>
                    ))}
                  </span>
                  <span>{b.notes.map((n) => labelFor(n.midi)).join(' ')}</span>
                </li>
              ))}
            </ol>
          )}

          {phase === 'between' && verdict && <VerdictCard verdict={verdict} />}

          <LiveKeyboard size={size} marks={marks} labelFor={labelFor} focusNote={middle(hands)} overlay={<HandOverlay size={size} hands={hands} cue={cue} down={played} />} />
        </>
      )}

      {phase === 'done' && (
        <p className="ui-muted" data-testid="block-done">
          Block finished.
        </p>
      )}
    </div>
  );
}

export function VerdictCard({ verdict }: { verdict: Verdict }) {
  return (
    <div className={`${s.verdict} ${ls.small}`} data-testid="verdict" data-clean={verdict.clean}>
      <div className={s.stats}>
        <Badge tone={verdict.clean ? 'good' : 'warn'}>{verdict.score}%</Badge>
        {verdict.timing !== null && <Badge>Timing {verdict.timing}%</Badge>}
        {verdict.touch !== null && <Badge>Touch {verdict.touch}%</Badge>}
        {verdict.bpm !== null && <Badge>{verdict.bpm} bpm played</Badge>}
      </div>
      <span>{verdict.advice}</span>
    </div>
  );
}

