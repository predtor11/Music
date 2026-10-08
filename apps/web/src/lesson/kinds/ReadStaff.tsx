/**
 * Read-staff: a note or chord is drawn on the staff and you play it. One note
 * is graded on the key press; a chord once the held keys settle. A wrong
 * answer is drawn in red beside the asked notes, and marked on the keyboard.
 */

import type { TestItem } from '@music/contracts';
import { C_MAJOR, parseKey, pretty, type MidiNote } from '@music/theory';
import { Badge, Button, Feedback, Swap, fadeUp, type FeedbackSignal } from '@music/ui';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { playChord } from '../../audio/synth.js';
import { useNoteInput, useNoteOn } from '../../input/NoteInput.js';
import { LiveKeyboard } from '../../keyboard/LiveKeyboard.js';
import type { KeyMark } from '../../keyboard/PianoKeyboard.js';
import { noteLabeller } from '../../keyboard/labels.js';
import { gradeReading, type ReadVerdict } from '../../notation/read.js';
import { Staff, type StaffChord } from '../../notation/Staff.js';
import type { ItemRunnerProps } from '../ItemRunner.js';
import s from '../lesson.module.css';

type ReadItem = Extract<TestItem, { kind: 'read-staff' }>;

const CHORD_SETTLE_MS = 350;
const NEXT_DELAY_MS = 1100;

export function ReadStaff(props: ItemRunnerProps) {
  return <ReadStaffRunner {...props} item={props.item as ReadItem} />;
}

function ReadStaffRunner({ item, mode, size, naming, keyOf, onAttempt, onDone }: ItemRunnerProps & { item: ReadItem }) {
  const input = useNoteInput();
  const staffKey = useMemo(() => (item.key ? (parseKey(item.key) ?? C_MAJOR) : C_MAJOR), [item.key]);
  const target = useMemo(() => [...new Set(item.midi)].sort((a, b) => a - b), [item.midi]);
  const isChord = target.length > 1;

  const [verdict, setVerdict] = useState<ReadVerdict | null>(null);
  const [played, setPlayed] = useState<MidiNote[]>([]);
  const [tries, setTries] = useState(0);
  const [hint, setHint] = useState(false);
  const [signal, setSignal] = useState<FeedbackSignal | null>(null);
  const started = useRef(performance.now());
  const verdictRef = useRef(verdict);
  verdictRef.current = verdict;

  useEffect(() => {
    setVerdict(null);
    setPlayed([]);
    setTries(0);
    setHint(false);
    setSignal(null);
    started.current = performance.now();
    input.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  const settle = useCallback(
    (notes: MidiNote[]) => {
      const v = gradeReading(target, notes, staffKey);
      setPlayed(notes);
      setVerdict(v);
      onAttempt({ item, played: notes, correct: v.correct, retried: tries > 0, mistake: v.mistake, timeMs: performance.now() - started.current });
      setSignal({ kind: v.correct ? 'good' : 'bad', id: Date.now() });
      setTries((t) => t + 1);
    },
    [item, onAttempt, target, staffKey, tries],
  );

  useEffect(() => {
    if (!verdict?.correct) return;
    const t = setTimeout(onDone, NEXT_DELAY_MS);
    return () => clearTimeout(t);
  }, [verdict, onDone]);

  // One note: graded on the press. After a miss, the next press is a new try.
  useNoteOn((note) => {
    if (isChord || verdictRef.current?.correct) return;
    if (verdictRef.current) started.current = performance.now();
    settle([note]);
  });

  // A chord: graded on the keys held once they stop changing.
  const heldKey = input.held.join(',');
  useEffect(() => {
    if (!isChord || verdictRef.current?.correct) return;
    if (input.held.length === 0) return;
    if (verdictRef.current) {
      setVerdict(null);
      setPlayed([]);
      started.current = performance.now();
    }
    if (input.held.length < target.length) return;
    const held = input.held;
    const t = setTimeout(() => settle([...held]), CHORD_SETTLE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heldKey, isChord]);

  const chords: StaffChord[] = useMemo(() => {
    if (!verdict) return [{ midi: target }];
    if (verdict.correct) return [{ midi: target, tone: 'good' }];
    return [
      { midi: target, caption: 'On the staff' },
      { midi: played, tone: 'bad', caption: 'You played' },
    ];
  }, [verdict, target, played]);

  const marks = useMemo(() => {
    const m = new Map<MidiNote, KeyMark>();
    if (verdict) {
      for (const n of played) m.set(n, target.includes(n) ? 'good' : 'bad');
      if (!verdict.correct) for (const n of target) if (!m.has(n)) m.set(n, 'missed');
    } else if (hint) {
      for (const n of target) m.set(n, 'target');
    }
    return m;
  }, [verdict, played, target, hint]);
  const labelFor = useMemo(() => noteLabeller(keyOf, naming), [keyOf, naming]);

  const status = verdict ? (verdict.correct ? 'good' : 'bad') : 'listening';
  const waiting = isChord ? 'Play the chord and hold it.' : 'Play the note you see.';

  return (
    <div className={s.item} data-testid="read-staff">
      <div className={s.promptRow}>
        <Badge tone={mode === 'quiz' ? 'warn' : 'accent'}>{mode === 'quiz' ? 'Quiz' : 'Play along'}</Badge>
        <Badge tone="neutral">{item.clef === 'treble' ? 'Treble clef' : 'Bass clef'}</Badge>
        {tries > 0 && !verdict?.correct && <Badge tone="neutral">Try {tries + 1}</Badge>}
      </div>
      <h2 className={`ui-title ${s.prompt}`} data-testid="prompt">
        {pretty(item.prompt)}
      </h2>

      <Feedback signal={signal}>
        <Staff clef={item.clef} keyOf={staffKey} chords={chords} />
      </Feedback>

      <div className={s.messageRow} data-testid="item-message">
        <Swap value={`${status}-${verdict?.message ?? ''}-${tries}`}>
          <span className={s.message} data-status={status}>
            {verdict ? verdict.message : waiting}
          </span>
        </Swap>
      </div>

      <LiveKeyboard size={size} marks={marks} labelFor={labelFor} names={verdict || hint ? 'held' : 'c'} />

      <AnimatePresence>
        {!verdict && mode === 'play-along' && !hint && (
          <motion.div className={s.retryRow} variants={fadeUp} initial="hidden" animate="show" exit="exit">
            <Button variant="ghost" size="sm" onClick={() => setHint(true)} data-testid="show-keys">
              Show me the keys
            </Button>
          </motion.div>
        )}
        {verdict && !verdict.correct && (
          <motion.div className={s.retryRow} variants={fadeUp} initial="hidden" animate="show" exit="exit">
            <span className="ui-muted">Play again to retry.</span>
            <Button variant="ghost" size="sm" onClick={() => playChord(target)}>
              Hear it
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
