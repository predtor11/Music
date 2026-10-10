import { midiName, pretty } from '@music/theory';
import { useEffect, type CSSProperties } from 'react';
import type { FretPosition, GuitarTuning } from '../guitar/types.js';
import type { KeyMark, KeyNames } from '../keyboard/PianoKeyboard.js';
import { fretRows, samePosition } from './model.js';
import s from './fretboard.module.css';

export interface FretboardProps {
  positions: readonly FretPosition[];
  tuning: GuitarTuning;
  onPluck?: (position: FretPosition) => void;
  targets?: readonly FretPosition[];
  marks?: ReadonlyMap<number, KeyMark>;
  captions?: ReadonlyMap<number, string>;
  labelFor?: (midi: number) => string;
  names?: KeyNames;
  maxFret?: number;
  /** The latest local mic note; all matching positions light because pitch cannot identify a string. */
  mic?: { midi: number | null; onNote?: (midi: number) => void };
}

/** Thin string at the top; each native button supports pointer, touch, Enter and Space. */
export function Fretboard({ positions, tuning, onPluck, targets = [], marks, captions, labelFor, names = 'all', maxFret = 12, mic }: FretboardProps) {
  const midi = mic?.midi;
  const onNote = mic?.onNote;
  useEffect(() => {
    if (midi !== undefined && midi !== null) onNote?.(midi);
  }, [midi, onNote]);
  const rows = fretRows(tuning, maxFret);
  return (
    <div className={s.scroll} role="region" aria-label={`${tuning.name} guitar fretboard`} tabIndex={0} data-testid="fretboard">
      <div className={s.board} style={{ '--fret-columns': maxFret + 1 } as CSSProperties}>
        <div className={s.numbers} aria-hidden="true">
          {rows[0]!.map(({ position }) => <span key={position.fret}>{position.fret === 0 ? 'Open' : position.fret}</span>)}
        </div>
        {rows.map((row, i) => (
          <div key={i} className={s.string} data-string={i + 1}>
            {row.map(({ position, midi: note, label }) => {
              const lit = positions.some((p) => samePosition(p, position));
              const heard = mic?.midi === note;
              const target = targets.some((p) => samePosition(p, position));
              const mark = marks?.get(note);
              const showName = names !== 'none' && (names === 'all' || lit || heard || target || !!mark || (names === 'c' && note % 12 === 0));
              const marker = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24].includes(position.fret);
              return (
                <button key={position.fret} type="button" className={s.fret} aria-label={label} aria-pressed={lit || heard}
                  data-testid={`fret-${position.string}-${position.fret}`} data-lit={lit} data-heard={heard} data-target={target} data-mark={mark} data-open={position.fret === 0}
                  disabled={!onPluck} onClick={() => onPluck?.({ ...position })}>
                  <span className={s.note}>{showName ? labelFor?.(note) ?? pretty(midiName(note)) : '·'}</span>
                  {captions?.has(note) && <span>{captions.get(note)}</span>}
                  <span className={s.marker} aria-hidden="true">{marker ? (position.fret % 12 === 0 ? '••' : '•') : ''}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
