import type { NoteNaming } from '@music/contracts';
import { keyLabel, pretty, type Key } from '@music/theory';
import { AnimatePresence, motion } from 'motion/react';
import { pop, rise, stagger } from '../design/motion.js';
import type { Description } from './describe.js';
import { NoteName } from './NoteName.js';
import s from './chord.module.css';

/** Stable identity for the animation: a new value animates in, the same value stays put. */
function displayKey(d: Description): string {
  switch (d.kind) {
    case 'empty':
      return 'empty';
    case 'note':
      return `n-${d.note.midi}`;
    case 'interval':
      return `i-${d.low.midi}-${d.high.midi}`;
    case 'chord':
      return `c-${d.symbol}-${d.tones.map((t) => t.western).join('')}`;
    case 'unknown':
      return `u-${d.notes.map((n) => n.midi).join('-')}`;
  }
}

const KIND_LABEL: Record<Description['kind'], string> = {
  empty: 'Waiting',
  note: 'Note',
  interval: 'Interval',
  chord: 'Chord',
  unknown: 'Notes',
};

export function LiveDisplay({ description: d, naming, keyOf }: { description: Description; naming: NoteNaming; keyOf: Key }) {
  return (
    <div className={s.display} aria-live="polite">
      <div className={s.kindRow}>
        <motion.span key={d.kind} className={s.kind} data-testid="display-kind" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          {KIND_LABEL[d.kind]}
        </motion.span>
        <span className={s.inKey}>in {pretty(keyLabel(keyOf))}</span>
      </div>

      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div key={displayKey(d)} className={s.stage} variants={stagger(0.05)} initial="hidden" animate="show" exit="exit">
          {d.kind === 'empty' && (
            <>
              <motion.div variants={pop} className={`${s.hero} ${s.heroIdle}`} data-testid="display-main">
                Play a note
              </motion.div>
              <motion.p variants={rise} className={s.sub}>
                One note shows its name, two show the interval, three or more name the chord.
              </motion.p>
            </>
          )}

          {d.kind === 'note' && (
            <motion.div variants={pop} className={`${s.hero} gradient-text`} data-testid="display-main">
              <NoteName note={d.note} naming={naming} withOctave />
            </motion.div>
          )}

          {d.kind === 'interval' && (
            <>
              <motion.div variants={pop} className={`${s.hero} ${s.heroInterval} gradient-text`} data-testid="display-main">
                {d.name}
              </motion.div>
              <motion.p variants={rise} className={s.sub}>
                <NoteName note={d.low} naming={naming} withOctave /> <span className={s.arrow}>to</span>{' '}
                <NoteName note={d.high} naming={naming} withOctave />
                <span className={s.dotSep} />
                {d.semitones} half step{d.semitones === 1 ? '' : 's'}
                <span className={s.dotSep} />
                <span className={s.mono}>{d.short}</span>
              </motion.p>
            </>
          )}

          {d.kind === 'chord' && (
            <>
              <motion.div variants={pop} className={`${s.hero} gradient-text`} data-testid="display-main">
                {pretty(d.symbol)}
              </motion.div>
              <motion.p variants={rise} className={s.fullName} data-testid="chord-full-name">
                {pretty(d.fullName)}
                {d.omittedFifth && <span className={s.note}> (no 5th)</span>}
              </motion.p>
              <motion.div variants={rise} className={s.facts}>
                <Fact label="Position" value={d.inversion} testId="inversion" />
                <Fact label="Roman numeral" value={pretty(d.roman)} testId="roman" mono />
                <Fact label="Nashville" value={pretty(d.nashville)} testId="nashville" mono />
              </motion.div>
              <motion.div variants={rise} className={s.tones} data-testid="tones">
                {d.tones.map((t, i) => (
                  <motion.span key={t.western + i} className={s.tone} data-bass={t.western === d.bass.western} variants={pop}>
                    <NoteName note={t} naming={naming} />
                  </motion.span>
                ))}
              </motion.div>
            </>
          )}

          {d.kind === 'unknown' && (
            <>
              <motion.div variants={pop} className={`${s.hero} ${s.heroIdle}`} data-testid="display-main">
                Not a chord I know yet
              </motion.div>
              <motion.div variants={rise} className={s.tones}>
                {d.notes.map((n) => (
                  <span key={n.midi} className={s.tone}>
                    <NoteName note={n} naming={naming} withOctave />
                  </span>
                ))}
              </motion.div>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function Fact({ label, value, testId, mono }: { label: string; value: string; testId: string; mono?: boolean }) {
  return (
    <div className={s.fact}>
      <span className={s.factLabel}>{label}</span>
      <span className={`${s.factValue} ${mono ? s.mono : ''}`} data-testid={testId}>
        {value}
      </span>
    </div>
  );
}
