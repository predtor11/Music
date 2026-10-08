import type { NoteNaming } from '@music/contracts';
import { keyLabel, pretty, type Key } from '@music/theory';
import { Swap, fadeUp, stagger } from '@music/ui';
import { AnimatePresence, motion } from 'motion/react';
import type { Description, NoteLabel } from './describe.js';
import { NoteName } from './NoteName.js';
import s from './chord.module.css';

const KIND_LABEL: Record<Description['kind'], string> = {
  empty: 'Waiting for you',
  note: 'Note',
  interval: 'Interval',
  chord: 'Chord',
  unknown: 'Notes',
};

const noteKey = (n: NoteLabel) => `${n.western}${n.octave ?? ''}`;

/** The main answer: big, and swapped with an animation whenever it changes. */
function heroFor(d: Description, naming: NoteNaming): { value: string; node: React.ReactNode; idle?: boolean; small?: boolean } {
  switch (d.kind) {
    case 'empty':
      return { value: 'empty', node: 'Play a note', idle: true };
    case 'note':
      return { value: `n-${noteKey(d.note)}-${naming}`, node: <NoteName note={d.note} naming={naming} withOctave /> };
    case 'interval':
      return { value: `i-${d.name}`, node: d.name, small: true };
    case 'chord':
      return { value: `c-${d.symbol}`, node: pretty(d.symbol) };
    case 'unknown':
      return { value: 'unknown', node: 'Not a chord I know yet', idle: true };
  }
}

export function LiveDisplay({ description: d, naming, keyOf }: { description: Description; naming: NoteNaming; keyOf: Key }) {
  const hero = heroFor(d, naming);
  const detailKey =
    d.kind === 'chord'
      ? `${d.symbol}-${d.tones.map(noteKey).join('')}-${naming}`
      : d.kind === 'interval'
        ? `${noteKey(d.low)}-${noteKey(d.high)}-${naming}`
        : d.kind === 'unknown'
          ? d.notes.map(noteKey).join('-') + naming
          : d.kind;

  return (
    <div className={s.display}>
      <div className={s.kindRow}>
        <span className="ui-eyebrow" data-testid="display-kind">
          {KIND_LABEL[d.kind]}
        </span>
        <span className={s.sep} aria-hidden />
        <span className="ui-eyebrow" data-testid="display-key">
          in {pretty(keyLabel(keyOf))}
        </span>
      </div>

      <div className={`ui-display ${s.hero}`} data-idle={hero.idle || undefined} data-small={hero.small || undefined} data-testid="display-main">
        <Swap value={hero.value}>
          <span className={hero.idle ? undefined : 'ui-gradient-text'}>{hero.node}</span>
        </Swap>
      </div>

      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div key={detailKey} className={s.details} variants={stagger(0.04)} initial="hidden" animate="show" exit="exit">
          {d.kind === 'empty' && (
            <motion.p variants={fadeUp} className={`ui-muted ${s.sub}`}>
              One note shows its name, two show the interval, three or more name the chord.
            </motion.p>
          )}

          {d.kind === 'interval' && (
            <motion.p variants={fadeUp} className={`ui-muted ${s.sub}`}>
              <NoteName note={d.low} naming={naming} withOctave />
              <span className={s.to}>to</span>
              <NoteName note={d.high} naming={naming} withOctave />
              <span className={s.sep} aria-hidden />
              {d.semitones} half step{d.semitones === 1 ? '' : 's'}
            </motion.p>
          )}

          {d.kind === 'chord' && (
            <>
              <motion.p variants={fadeUp} className={s.fullName} data-testid="chord-full-name">
                {pretty(d.fullName)}
                {d.omittedFifth && <span className="ui-muted"> (no 5th)</span>}
              </motion.p>
              <motion.div variants={fadeUp} className={s.facts}>
                <Fact label="Position" value={d.inversion} testId="inversion" />
                <Fact label="Roman numeral" value={pretty(d.roman)} testId="roman" />
                <Fact label="Nashville number" value={pretty(d.nashville)} testId="nashville" />
              </motion.div>
              <motion.div variants={fadeUp} className={s.tones} data-testid="tones">
                {d.tones.map((t) => (
                  <span key={t.western} className={s.tone} data-bass={t.western === d.bass.western || undefined} title={t.western === d.bass.western ? 'Lowest note' : undefined}>
                    <NoteName note={t} naming={naming} />
                  </span>
                ))}
              </motion.div>
            </>
          )}

          {d.kind === 'unknown' && (
            <motion.div variants={fadeUp} className={s.tones}>
              {d.notes.map((n) => (
                <span key={n.midi} className={s.tone}>
                  <NoteName note={n} naming={naming} withOctave />
                </span>
              ))}
            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function Fact({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className={s.fact}>
      <span className="ui-eyebrow">{label}</span>
      <span className={s.factValue} data-testid={testId}>
        {value}
      </span>
    </div>
  );
}
