import { midiName, type MidiNote } from '@music/theory';
import { useEffect, useMemo, useRef } from 'react';
import { keyboardKeys, noteToComputerKey, type KeyboardSize } from './layout.js';
import s from './keyboard.module.css';

interface Props {
  size: KeyboardSize;
  /** Notes to light up. */
  active: ReadonlySet<MidiNote>;
  /** Notes the sustain pedal keeps sounding (drawn softer). */
  sustained?: ReadonlySet<MidiNote>;
  onToggle: (note: MidiNote) => void;
  computerBase: MidiNote;
  /** Short label per note (C, Sa ...), shown on every C and on held keys. */
  labelFor: (note: MidiNote) => string;
}

/**
 * On-screen piano. Highlights are plain CSS transitions so a key press shows
 * within one frame; nothing here waits on a spring.
 */
export function PianoKeyboard({ size, active, sustained, onToggle, computerBase, labelFor }: Props) {
  const keys = useMemo(() => keyboardKeys(size), [size]);
  const whiteCount = keys.filter((k) => !k.black).length;
  const scroller = useRef<HTMLDivElement>(null);

  // Keep middle C in view when the board is wider than the screen.
  useEffect(() => {
    const el = scroller.current;
    const middle = el?.querySelector<HTMLElement>('[data-note="60"]');
    if (el && middle && el.scrollWidth > el.clientWidth) {
      el.scrollLeft = middle.offsetLeft - el.clientWidth / 2 + middle.offsetWidth / 2;
    }
  }, [size]);

  return (
    <div className={s.scroller} ref={scroller}>
      <div className={s.keyboard} style={{ ['--white-count' as string]: whiteCount }} role="group" aria-label={`${size}-key keyboard`} data-testid="piano">
        {keys.map((k) => {
          const on = active.has(k.note);
          const ringing = !on && sustained?.has(k.note);
          const ck = noteToComputerKey(k.note, computerBase);
          return (
            <button
              key={k.note}
              type="button"
              className={k.black ? s.black : s.white}
              style={k.black ? { ['--at' as string]: k.whiteIndex + 1 } : undefined}
              data-note={k.note}
              data-active={on || undefined}
              data-ringing={ringing || undefined}
              aria-pressed={on}
              aria-label={midiName(k.note)}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                onToggle(k.note);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggle(k.note);
                }
              }}
            >
              <span className={s.labels}>
                {(on || k.note % 12 === 0) && <span className={s.name}>{labelFor(k.note)}</span>}
                {ck && <span className={s.kbd}>{ck}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
