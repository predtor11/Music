/**
 * Chord Namer: play anything and see what it is called, live.
 */

import type { NoteNaming } from '@music/contracts';
import { COMMON_KEYS, C_MAJOR, keyLabel, keyName, keyTonicPc, noteToString, parseKey, pitchClass, pretty, sargam, spellInKey, type MidiNote } from '@music/theory';
import { MotionConfig, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { describe } from './chord/describe.js';
import { LiveDisplay } from './chord/LiveDisplay.js';
import { Button, Card, Segmented, Select } from './design/components/index.js';
import { rise, stagger } from './design/motion.js';
import { useComputerKeys } from './keyboard/useComputerKeys.js';
import { KEYBOARD_RANGES, KEYBOARD_SIZES, type KeyboardSize } from './keyboard/layout.js';
import { PianoKeyboard } from './keyboard/PianoKeyboard.js';
import { MidiPanel } from './midi/MidiPanel.js';
import { useMidi } from './midi/useMidi.js';
import { useSettings, useTheme, type ThemeChoice } from './settings/useSettings.js';
import s from './App.module.css';

const KEY_OPTIONS = COMMON_KEYS.map((k) => ({ value: keyName(k), label: pretty(keyLabel(k)) }));
const NAMING_OPTIONS: Array<{ value: NoteNaming; label: string }> = [
  { value: 'western', label: 'C D E' },
  { value: 'sargam', label: 'Sa Re Ga' },
  { value: 'both', label: 'Both' },
];
const SIZE_OPTIONS = KEYBOARD_SIZES.map((n) => ({ value: String(n), label: `${n} keys` }));
const THEME_NEXT: Record<ThemeChoice, ThemeChoice> = { system: 'dark', dark: 'light', light: 'system' };
const THEME_LABEL: Record<ThemeChoice, string> = { system: 'Auto', dark: 'Dark', light: 'Light' };

export function App() {
  const [settings, update] = useSettings();
  const [theme, setTheme] = useTheme();
  const key = useMemo(() => parseKey(settings.currentKey) ?? C_MAJOR, [settings.currentKey]);
  const onSelectInput = useCallback((id: string | null) => update({ midiInputId: id }), [update]);
  const midi = useMidi(settings.midiInputId, onSelectInput);
  const computer = useComputerKeys();
  const [clicked, setClicked] = useState<ReadonlySet<MidiNote>>(new Set());

  const held = useMemo(() => [...new Set([...midi.held, ...computer.held, ...clicked])].sort((a, b) => a - b), [midi.held, computer.held, clicked]);
  const heldSet = useMemo(() => new Set(held), [held]);
  const sustained = useMemo(() => new Set(midi.sounding), [midi.sounding]);
  const description = useMemo(() => describe(held, key), [held, key]);

  const toggle = useCallback((note: MidiNote) => {
    setClicked((prev) => {
      const next = new Set(prev);
      if (next.has(note)) next.delete(note);
      else next.add(note);
      return next;
    });
  }, []);

  // Clicked keys stay down until clicked again or cleared, so you can build a chord with the mouse.
  const clear = useCallback(() => setClicked(new Set()), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clear();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clear]);

  const labelFor = useCallback(
    (note: MidiNote) => {
      const pc = pitchClass(note);
      if (settings.noteNaming === 'sargam') return sargam(pc, keyTonicPc(key)).syllable;
      return pretty(noteToString(spellInKey(pc, key)));
    },
    [key, settings.noteNaming],
  );

  const size = settings.keyboardSize as KeyboardSize;

  return (
    <MotionConfig reducedMotion="user">
      <div className="aurora" aria-hidden />
      <motion.main className={s.shell} variants={stagger(0.08)} initial="hidden" animate="show">
        <motion.header className={s.header} variants={rise}>
          <div className={s.brand}>
            <span className={s.logo} aria-hidden>
              <span />
              <span />
              <span />
            </span>
            <div>
              <h1 className={s.title}>
                <span className="gradient-text">Chord Namer</span>
              </h1>
              <p className={s.tagline}>Play anything. See what it's called.</p>
            </div>
          </div>
          <Button size="sm" onClick={() => setTheme(THEME_NEXT[theme])} aria-label="Change theme" data-testid="theme">
            Theme: {THEME_LABEL[theme]}
          </Button>
        </motion.header>

        <Card className={s.connect}>
          <MidiPanel midi={midi} />
        </Card>

        <Card className={s.controls}>
          <Select label="Key" testId="key-select" value={keyName(key)} options={KEY_OPTIONS} onChange={(v) => update({ currentKey: v })} />
          <Segmented label="Note names" testId="naming" value={settings.noteNaming} options={NAMING_OPTIONS} onChange={(v) => update({ noteNaming: v })} />
          <Select
            label="Keyboard"
            testId="size-select"
            value={String(size)}
            options={SIZE_OPTIONS}
            onChange={(v) => {
              const n = Number(v) as KeyboardSize;
              update({ keyboardSize: n, lowestNote: KEYBOARD_RANGES[n].low });
            }}
          />
        </Card>

        <Card glow className={s.stage}>
          <LiveDisplay description={description} naming={settings.noteNaming} keyOf={key} />
        </Card>

        <Card className={s.board}>
          <div className={s.boardHead}>
            <p className={s.hint}>
              Click keys to add or remove them. Computer keys <kbd>A</kbd> to <kbd>K</kbd> play from{' '}
              <strong>C{Math.floor(computer.base / 12) - 1}</strong>, <kbd>Z</kbd> <kbd>X</kbd> change octave.
            </p>
            <Button size="sm" onClick={clear} disabled={clicked.size === 0} data-testid="clear">
              Clear
            </Button>
          </div>
          <PianoKeyboard size={size} active={heldSet} sustained={sustained} onToggle={toggle} computerBase={computer.base} labelFor={labelFor} />
        </Card>
      </motion.main>
    </MotionConfig>
  );
}
