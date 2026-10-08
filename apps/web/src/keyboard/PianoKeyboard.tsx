import { midiName, type MidiNote } from '@music/theory';
import { motion } from 'motion/react';
import { useEffect, useMemo, useRef } from 'react';
import { spring } from '../design/motion.js';
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
  /** Short label per note (C, Sa ...), shown on C keys and on active keys. */
  labelFor: (note: MidiNote) => string;
}

export function PianoKeyboard({ size, active, sustained, onToggle, computerBase, labelFor }: Props) {
  const keys = useMemo(() => keyboardKeys(size), [size]);
  const whiteCount = keys.filter((k) => !k.black).length;
  const scroller = useRef<HTMLDivElement>(null);

  // Keep middle C in view on big keyboards and small screens.
  useEffect(() => {
    const el = scroller.current;
    const middle = el?.querySelector<HTMLElement>('[data-note="60"]');
    if (el && middle && el.scrollWidth > el.clientWidth) {
      el.scrollLeft = middle.offsetLeft - el.clientWidth / 2 + middle.offsetWidth / 2;
    }
  }, [size]);

  return (
    <div className={s.scroller} ref={scroller}>
      <div className={s.keyboard} style={{ ['--white-count' as string]: whiteCount }} role="group" aria-label={`${size}-key keyboard`}>
        {keys.map((k) => {
          const on = active.has(k.note);
          const ringing = !on && sustained?.has(k.note);
          const ck = noteToComputerKey(k.note, computerBase);
          const label = labelFor(k.note);
          return (
            <motion.button
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
                e.preventDefault();
                onToggle(k.note);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onToggle(k.note);
                }
              }}
              animate={{ y: on ? 2 : 0 }}
              transition={spring.snappy}
            >
              {on && <motion.span className={s.glow} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={spring.snappy} />}
              <span className={s.labels}>
                {(on || k.note % 12 === 0) && <span className={s.name}>{label}</span>}
                {ck && <kbd className={s.kbd}>{ck}</kbd>}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
