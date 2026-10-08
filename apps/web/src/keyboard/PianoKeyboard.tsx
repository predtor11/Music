import { midiName, type MidiNote } from '@music/theory';
import { useEffect, useMemo, useRef } from 'react';
import { keyboardKeys, noteToComputerKey, type KeyboardSize } from './layout.js';
import s from './keyboard.module.css';

/**
 * How a key is marked on top of being held:
 * - target: a key the lesson is pointing at, or asking you to play;
 * - good: played and right;
 * - bad: played and wrong;
 * - missed: should have been played but wasn't.
 */
export type KeyMark = 'target' | 'good' | 'bad' | 'missed';

/** Which keys show a note name. */
export type KeyNames = 'none' | 'c' | 'held' | 'all';

export interface PianoKeyboardProps {
  size: KeyboardSize;
  /** Keys down right now (from MIDI, clicks or computer keys); they light up. */
  active: ReadonlySet<MidiNote>;
  /** Notes the sustain pedal keeps sounding (drawn softer). */
  sustained?: ReadonlySet<MidiNote>;
  /** Lesson and test marks per key. */
  marks?: ReadonlyMap<MidiNote, KeyMark>;
  /** Default: every C and every held or marked key. */
  names?: KeyNames;
  /** Note name for a key (C, B♭, Sa ...). Default: the MIDI name. */
  labelFor?: (note: MidiNote) => string;
  /** Extra text per key, for example a finger number; shown even when names are off. */
  captions?: ReadonlyMap<MidiNote, string>;
  /** Click handler. Leave it out for a display-only keyboard. */
  onToggle?: (note: MidiNote) => void;
  /** Computer-key octave to print on the keys, or null to hide the hints. */
  computerBase?: MidiNote | null;
  /** Scrolls this note into view on wide boards. Default middle C. */
  focusNote?: MidiNote;
}

const defaultLabel = (note: MidiNote) => midiName(note).replace(/-?\d+$/, '');

/**
 * The virtual keyboard. It mirrors whatever is held, live: highlights are
 * plain CSS transitions, so a key press shows within one frame.
 * Lessons and tests drive it with `marks`, `names` and `captions`.
 */
export function PianoKeyboard({
  size,
  active,
  sustained,
  marks,
  names = 'held',
  labelFor = defaultLabel,
  captions,
  onToggle,
  computerBase = null,
  focusNote = 60,
}: PianoKeyboardProps) {
  const keys = useMemo(() => keyboardKeys(size), [size]);
  const whiteCount = keys.filter((k) => !k.black).length;
  const scroller = useRef<HTMLDivElement>(null);

  // Keep the focus note in view when the board is wider than the screen.
  useEffect(() => {
    const el = scroller.current;
    const target = el?.querySelector<HTMLElement>(`[data-note="${focusNote}"]`);
    if (el && target && el.scrollWidth > el.clientWidth) {
      el.scrollLeft = target.offsetLeft - el.clientWidth / 2 + target.offsetWidth / 2;
    }
  }, [size, focusNote]);

  const interactive = !!onToggle;

  return (
    <div className={s.scroller} ref={scroller}>
      <div
        className={s.keyboard}
        style={{ ['--white-count' as string]: whiteCount }}
        role="group"
        aria-label={`${size}-key keyboard`}
        data-testid="piano"
        data-interactive={interactive || undefined}
      >
        {keys.map((k) => {
          const on = active.has(k.note);
          const mark = marks?.get(k.note);
          const ringing = !on && sustained?.has(k.note);
          const ck = computerBase === null ? null : noteToComputerKey(k.note, computerBase);
          const showName = names === 'all' || (names === 'c' && k.note % 12 === 0) || (names === 'held' && (k.note % 12 === 0 || on || !!mark));
          const caption = captions?.get(k.note);
          return (
            <button
              key={k.note}
              type="button"
              tabIndex={interactive ? 0 : -1}
              className={k.black ? s.black : s.white}
              style={k.black ? { ['--at' as string]: k.whiteIndex + 1 } : undefined}
              data-note={k.note}
              data-active={on || undefined}
              data-mark={mark}
              data-ringing={ringing || undefined}
              aria-pressed={on}
              aria-label={`${midiName(k.note)}${mark ? `, ${mark}` : ''}`}
              onPointerDown={
                onToggle
                  ? (e) => {
                      if (e.button !== 0) return;
                      e.preventDefault();
                      onToggle(k.note);
                    }
                  : undefined
              }
              onKeyDown={
                onToggle
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        onToggle(k.note);
                      }
                    }
                  : undefined
              }
            >
              <span className={s.labels}>
                {caption && <span className={s.caption}>{caption}</span>}
                {showName && <span className={s.name}>{labelFor(k.note)}</span>}
                {ck && <span className={s.kbd}>{ck}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
