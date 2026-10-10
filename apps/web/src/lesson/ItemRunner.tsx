import type { NoteNaming, TestItem } from '@music/contracts';
import { pretty, type Key } from '@music/theory';
import { Badge, Button, Feedback, StatusDot, Swap, fadeUp, type FeedbackSignal } from '@music/ui';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { play, playChord, playSequence } from '../audio/sound.js';
import { useNoteInput, useNoteOn } from '../input/NoteInput.js';
import { LiveKeyboard } from '../keyboard/LiveKeyboard.js';
import type { KeyboardSize } from '../keyboard/layout.js';
import { noteLabeller } from '../keyboard/labels.js';
import { earClip, earView, isByEar } from './byEar.js';
import { answerKeys, chooseAnswer, freshState, gradeChord, hintMarks, pressNote, type ItemState } from './grade.js';
import { KIND_RUNNERS } from './kinds.js';
import type { AttemptInput } from './usePractice.js';
import s from './lesson.module.css';
import { useInstrument } from '../instruments/context.js';
import { instrumentEntry } from '../instruments/registry.js';

export type RunMode = 'play-along' | 'quiz';

export interface ItemRunnerProps {
  item: TestItem;
  mode: RunMode;
  size: KeyboardSize;
  naming: NoteNaming;
  keyOf: Key;
  onAttempt: (a: AttemptInput) => void;
  /** Called when the item is finished (right, or skipped). */
  onDone: () => void;
}

/** How long a held chord must stay still before it is graded. */
const CHORD_SETTLE_MS = 350;
/** Pause on a right answer before moving on. */
const NEXT_DELAY_MS = 1100;
/** Let a by-ear question settle on screen before it plays. */
const EAR_DELAY_MS = 350;

/**
 * One question. Kinds with their own runner (progressions, staff reading,
 * rhythm) are listed in kinds.tsx; the rest use the classic runner below.
 */
export function ItemRunner(props: ItemRunnerProps) {
  const { id } = useInstrument();
  if (!instrumentEntry(id).drillKinds.includes(props.item.kind)) return <p role="status">This question is not available for {instrumentEntry(id).label} yet.</p>;
  const Runner = KIND_RUNNERS[props.item.kind];
  return Runner ? <Runner {...props} /> : <ClassicRunner {...props} />;
}

/**
 * The prompt, the virtual keyboard and the feedback. Play-along lights the
 * keys to play; a quiz doesn't. A wrong answer marks the keys and says what
 * was wrong; playing again is a retry.
 *
 * By-ear items play the answer first and keep it hidden (see byEar.ts):
 * nothing is lit or named until it's right or the player asks to see it.
 */
function ClassicRunner({ item, mode, size, naming, keyOf, onAttempt, onDone }: ItemRunnerProps) {
  const input = useNoteInput();
  const [state, setState] = useState<ItemState>(freshState);
  const [tries, setTries] = useState(0);
  const [signal, setSignal] = useState<FeedbackSignal | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [listening, setListening] = useState(false);
  const started = useRef(performance.now());
  const byEar = isByEar(item);
  const clip = useMemo(() => earClip(item), [item]);
  const playing = useRef(0);

  const playClip = useCallback(() => {
    if (!clip) return;
    const id = ++playing.current;
    setListening(true);
    void play(clip).finally(() => {
      if (playing.current === id) setListening(false);
    });
  }, [clip]);
  const stateRef = useRef(state);
  stateRef.current = state;

  // A new question starts clean.
  useEffect(() => {
    setState(freshState());
    setTries(0);
    setSignal(null);
    setRevealed(false);
    setListening(false);
    started.current = performance.now();
    input.clear();
    if (item.kind === 'name-it' && item.audioOnly) void playChord(item.shownMidi);
    if (!clip) return;
    const t = setTimeout(playClip, EAR_DELAY_MS);
    return () => {
      clearTimeout(t);
      playing.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  const settle = useCallback(
    (next: ItemState) => {
      setState(next);
      if (!next.verdict) return;
      const { correct, mistake } = next.verdict;
      onAttempt({ item, played: next.played, correct, retried: tries > 0, mistake, timeMs: performance.now() - started.current });
      setSignal({ kind: correct ? 'good' : 'bad', id: Date.now() });
      setTries((t) => t + 1);
    },
    [item, onAttempt, tries],
  );

  // Right answers move on by themselves.
  useEffect(() => {
    if (!state.verdict?.correct) return;
    const t = setTimeout(onDone, NEXT_DELAY_MS);
    return () => clearTimeout(t);
  }, [state.verdict, onDone]);

  useNoteOn((note) => {
    if (item.kind === 'build-chord' || item.kind === 'name-it') return;
    const current = stateRef.current;
    if (current.verdict?.correct) return;
    // After a miss, the next key press starts a new try.
    const base = current.verdict ? freshState() : current;
    if (current.verdict) started.current = performance.now();
    settle(pressNote(item, base, note));
  });

  // Chords are graded on the keys held, once they stop changing.
  const heldKey = input.held.join(',');
  useEffect(() => {
    if (item.kind !== 'build-chord' || stateRef.current.verdict?.correct) return;
    if (input.held.length === 0) {
      if (stateRef.current.verdict) setState(freshState());
      return;
    }
    const held = input.held;
    const t = setTimeout(() => {
      const graded = gradeChord(item, held);
      if (graded) settle(graded);
    }, CHORD_SETTLE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heldKey, item]);

  const view = useMemo(() => earView(item, state, revealed), [item, state, revealed]);
  // Items whose prompt points at lit keys light them in a quiz or review too.
  const showKeys = 'showKeys' in item && item.showKeys === true;
  const marks = useMemo(() => hintMarks(item, { ...state, marks: view.marks }, (mode === 'play-along' || showKeys) && !byEar), [item, state, view.marks, mode, showKeys, byEar]);
  const labelFor = useMemo(() => noteLabeller(keyOf, naming), [keyOf, naming]);

  const verdict = state.verdict;
  const status = verdict ? (verdict.correct ? 'good' : 'bad') : 'listening';

  return (
    <div className={s.item}>
      <div className={s.promptRow}>
        <Badge tone={mode === 'quiz' ? 'warn' : 'accent'}>{mode === 'quiz' ? 'Quiz' : 'Play along'}</Badge>
        {byEar && (
          <Badge tone="accent" data-testid="by-ear">
            By ear
          </Badge>
        )}
        {tries > 0 && !verdict?.correct && <Badge tone="neutral">Try {tries + 1}</Badge>}
      </div>
      <h2 className={`ui-title ${s.prompt}`} data-testid="prompt">
        {pretty(item.prompt)}
      </h2>

      {byEar && (
        <div className={s.listenRow}>
          <Button variant="secondary" size="sm" onClick={playClip} data-testid="play-again">
            {listening ? <StatusDot tone="accent" pulse /> : '▶'} {listening ? 'Listening' : 'Play it again'}
          </Button>
          <span className="ui-muted">Listen, then play the notes.</span>
        </div>
      )}

      {item.kind === 'name-it' && (
        <div className={s.choices}>
          {item.audioOnly && (
            <Button variant="ghost" size="sm" onClick={() => void playChord(item.shownMidi)}>
              Play it again
            </Button>
          )}
          {item.choices.map((c) => {
            const picked = verdict && c === item.answer;
            return (
              <Button
                key={c}
                variant={picked ? 'primary' : 'secondary'}
                disabled={!!verdict?.correct}
                onClick={() => settle(chooseAnswer(item, c))}
                data-testid={`choice-${c}`}
              >
                {pretty(c)}
              </Button>
            );
          })}
        </div>
      )}

      <div className={s.messageRow} data-testid="item-message">
        <Swap value={`${status}-${view.message ?? view.hint ?? ''}-${tries}`}>
          <span className={s.message} data-status={status}>
            {view.message ?? view.hint ?? (item.kind === 'name-it' ? 'Pick an answer.' : byEar ? 'Play back what you heard.' : 'Play the notes.')}
          </span>
        </Swap>
      </div>

      <Feedback signal={signal}>
        <LiveKeyboard size={size} marks={marks} labelFor={labelFor} names={mode === 'quiz' && !verdict ? 'c' : 'held'} />
      </Feedback>

      <AnimatePresence>
        {verdict && !verdict.correct && (
          <motion.div className={s.retryRow} variants={fadeUp} initial="hidden" animate="show" exit="exit">
            <span className="ui-muted">Play again to retry.</span>
            {byEar && !revealed && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setRevealed(true);
                  playClip();
                }}
                data-testid="show-answer"
              >
                Show me the answer
              </Button>
            )}
            {item.kind !== 'name-it' && !byEar && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const keys = answerKeys(item, state.played);
                  void (item.kind === 'build-chord' ? playChord(keys) : playSequence(keys));
                }}
              >
                Hear the answer
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={onDone} data-testid="skip">
              Skip
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
