/**
 * One play-by-ear question: it plays, you find it on your keyboard, and then
 * the answer is named and lit on the keyboard. Until you get it right or ask
 * to see it, nothing on screen gives the answer away.
 */

import type { NoteNaming } from '@music/contracts';
import { chordPitchClasses, pretty } from '@music/theory';
import { Badge, Button, Card, Feedback, StatusDot, Swap, fadeUp, type FeedbackSignal } from '@music/ui';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { play } from '../audio/sound.js';
import { useNoteInput, useNoteOn } from '../input/NoteInput.js';
import type { KeyMark } from '../keyboard/PianoKeyboard.js';
import { LiveKeyboard } from '../keyboard/LiveKeyboard.js';
import type { KeyboardSize } from '../keyboard/layout.js';
import { noteLabeller } from '../keyboard/labels.js';
import type { AttemptInput } from '../lesson/usePractice.js';
import { freshTune, gradeEarChord, pressKey, pressTune, type EarVerdict, type TuneState } from './grade.js';
import { stack, type ChordQuestion, type KeyQuestion, type MelodyQuestion, type Sound } from './questions.js';
import s from '../lesson/lesson.module.css';
import e from './ear.module.css';

export type PlainQuestion = ChordQuestion | MelodyQuestion | KeyQuestion;

export interface EarRunnerProps {
  question: PlainQuestion;
  size: KeyboardSize;
  naming: NoteNaming;
  /** Attempts on chord questions, for the practice service. */
  onAttempt: (a: AttemptInput) => void;
  /** First try right or not, once the question is settled. */
  onSettled: (firstTry: boolean) => void;
  onNext: () => void;
}

/** Let the question settle on screen before it plays. */
const START_DELAY_MS = 350;
/** Pause between the sounds of one question (home chord, then the mystery chord). */
const BETWEEN_MS = 250;
/** How long held keys must stay still before a chord is graded. */
const CHORD_SETTLE_MS = 350;
/** After this many misses the answer shows by itself. */
const AUTO_REVEAL_AFTER = 3;

/** Play sounds one after another. A newer call (or unmount) stops the rest via `alive`. */
async function playAll(sounds: readonly Sound[], alive: () => boolean): Promise<void> {
  for (const [i, sound] of sounds.entries()) {
    if (!alive()) return;
    if (i > 0) await new Promise((r) => setTimeout(r, BETWEEN_MS));
    await play(sound);
  }
}

const TYPE_BADGE = { chord: 'Chord', melody: 'Tune', key: 'Key' } as const;

export function EarRunner({ question: q, size, naming, onAttempt, onSettled, onNext }: EarRunnerProps) {
  const input = useNoteInput();
  const [verdict, setVerdict] = useState<EarVerdict | null>(null);
  const [tune, setTune] = useState<TuneState>(freshTune);
  const [misses, setMisses] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [right, setRight] = useState(false);
  const [listening, setListening] = useState(false);
  const [signal, setSignal] = useState<FeedbackSignal | null>(null);
  const playing = useRef(0);
  const started = useRef(performance.now());
  const settled = useRef(false);
  const done = right || revealed;

  const playSounds = useCallback((sounds: readonly Sound[]) => {
    const id = ++playing.current;
    setListening(true);
    void playAll(sounds, () => playing.current === id).finally(() => {
      if (playing.current === id) setListening(false);
    });
  }, []);
  const listen = useCallback(() => playSounds(q.listen), [playSounds, q.listen]);

  useEffect(() => {
    input.clear();
    const t = setTimeout(listen, START_DELAY_MS);
    return () => {
      clearTimeout(t);
      playing.current++;
    };
    // A new question gets a new runner (keyed by id); this runs once per question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const settle = (firstTry: boolean) => {
    if (settled.current) return;
    settled.current = true;
    onSettled(firstTry);
  };

  const judge = (v: EarVerdict) => {
    setVerdict(v);
    setSignal({ kind: v.correct ? 'good' : 'bad', id: Date.now() });
    if (q.type === 'chord') {
      onAttempt({ item: q.item, played: v.played, correct: v.correct, retried: misses > 0, mistake: v.mistake, timeMs: performance.now() - started.current });
    }
    if (v.correct) {
      setRight(true);
      settle(misses === 0);
      return;
    }
    const n = misses + 1;
    setMisses(n);
    if (n >= AUTO_REVEAL_AFTER) reveal();
  };

  const reveal = () => {
    setRevealed(true);
    settle(false);
  };

  // Chords are graded on the keys held, once they stop changing.
  const heldKey = input.held.join(',');
  useEffect(() => {
    if (q.type !== 'chord' || done) return;
    if (input.held.length === 0) {
      // Letting go starts the next try.
      if (verdict) {
        setVerdict(null);
        started.current = performance.now();
      }
      return;
    }
    const held = input.held;
    const t = setTimeout(() => {
      const v = gradeEarChord(q, held);
      if (v) judge(v);
    }, CHORD_SETTLE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heldKey, done]);

  useNoteOn((note) => {
    if (done || q.type === 'chord') return;
    if (q.type === 'key') {
      judge(pressKey(q, note));
      return;
    }
    // After a miss, the next key starts the tune again.
    const base = tune.verdict ? freshTune() : tune;
    if (tune.verdict) started.current = performance.now();
    const next = pressTune(q, base, note);
    setTune(next);
    if (next.verdict) judge(next.verdict);
    else setVerdict(null);
  });

  const labelFor = useMemo(() => noteLabeller(q.key, naming), [q.key, naming]);
  const marks = useMemo(() => {
    if (done) {
      const m = new Map<number, KeyMark>(q.answerKeys.map((k) => [k, right ? 'good' : 'target']));
      if (q.type === 'key') m.set(q.answerKeys[0]!, 'good');
      return m;
    }
    if (q.type === 'melody') return tune.marks;
    return verdict?.marks ?? new Map<number, KeyMark>();
  }, [done, right, q, tune.marks, verdict]);

  const status = right ? 'good' : verdict && !verdict.correct ? 'bad' : 'listening';
  const progressText = q.type === 'melody' && !tune.verdict && tune.played.length > 0 ? `${tune.played.length} of ${q.order.length}. Keep going.` : null;
  const message = right
    ? verdict?.message
    : revealed
      ? 'Here it is. Play it to feel it under your fingers, then move on.'
      : (verdict?.message ?? progressText ?? (q.type === 'key' ? 'Play the home note, in any octave.' : 'Play back what you heard, in any octave.'));

  return (
    <div className={s.item}>
      <div className={s.promptRow}>
        <Badge tone="accent" data-testid="by-ear">
          By ear
        </Badge>
        <Badge tone="neutral">{TYPE_BADGE[q.type]}</Badge>
        {misses > 0 && !done && <Badge tone="neutral">Try {misses + 1}</Badge>}
      </div>
      <h2 className={`ui-title ${s.prompt} ${e.prompt}`} data-testid="prompt">
        {pretty(q.prompt)}
      </h2>

      <div className={s.listenRow}>
        <Button variant="secondary" size="sm" onClick={listen} data-testid="play-again">
          {listening ? <StatusDot tone="accent" pulse /> : '▶'} {listening ? 'Listening' : 'Play it again'}
        </Button>
        {!done && misses > 0 && (
          <Button variant="ghost" size="sm" onClick={reveal} data-testid="show-answer">
            Show me the answer
          </Button>
        )}
      </div>

      <div className={s.messageRow} data-testid="item-message">
        <Swap value={`${status}-${message}-${misses}`}>
          <span className={s.message} data-status={status}>
            {message}
          </span>
        </Swap>
      </div>

      <Feedback signal={signal}>
        <LiveKeyboard size={size} marks={marks} labelFor={labelFor} names={done ? 'held' : 'c'} />
      </Feedback>

      <AnimatePresence>
        {done && (
          <motion.div variants={fadeUp} initial="hidden" animate="show" exit="exit">
            <Card padding="md" className={e.answer} data-testid="ear-answer" data-right={right}>
              <div className={e.answerText}>
                <span className="ui-eyebrow">{right ? 'You found it' : 'The answer'}</span>
                <span className={`ui-heading ${e.answerName}`} data-testid="answer-name">
                  {q.answer}
                </span>
                <span className="ui-muted" data-testid="answer-detail">
                  {q.detail}
                </span>
              </div>
              <div className={e.answerActions}>
                <Button variant="secondary" size="sm" onClick={() => playSounds(answerSounds(q))} data-testid="hear-answer">
                  Hear it again
                </Button>
                {q.type === 'chord' && (q.quality === 'major' || q.quality === 'minor') && (
                  <Button variant="ghost" size="sm" onClick={() => playSounds(compareSounds(q))} data-testid="compare">
                    Hear major, then minor
                  </Button>
                )}
                {q.type === 'key' && (
                  <Button variant="ghost" size="sm" onClick={() => playSounds([{ kind: 'sequence', notes: q.answerKeys }])} data-testid="hear-scale">
                    Hear the scale
                  </Button>
                )}
                <Button variant="primary" size="sm" onClick={onNext} data-testid="ear-next">
                  Next
                </Button>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** The answer on its own: the chord, the tune, or the home note after its key. */
function answerSounds(q: PlainQuestion): Sound[] {
  if (q.type === 'key') return [...q.listen, { kind: 'chord', notes: [q.answerKeys[0]!] }];
  if (q.type === 'chord') return [{ kind: 'chord', notes: q.answerKeys }];
  return q.listen;
}

/** The same root as major and as minor, so the difference is easy to hear. */
function compareSounds(q: ChordQuestion): Sound[] {
  return (['major', 'minor'] as const).map((quality) => ({ kind: 'chord', notes: stack(chordPitchClasses(q.rootPc, quality)) }));
}
