/**
 * Chord Namer: play anything and see what it is called, live.
 */

import type { NoteNaming } from '@music/contracts';
import { COMMON_KEYS, C_MAJOR, keyLabel, keyName, keyTonicPc, noteToString, parseKey, pitchClass, pretty, sargam, spellInKey, type MidiNote } from '@music/theory';
import { Button, Card, Kbd, SegmentedControl, Select, fadeUp, stagger, useTheme, type ThemeSetting } from '@music/ui';
import { motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { describe } from './chord/describe.js';
import { LiveDisplay } from './chord/LiveDisplay.js';
import { useComputerKeys } from './keyboard/useComputerKeys.js';
import { KEYBOARD_RANGES, KEYBOARD_SIZES, type KeyboardSize } from './keyboard/layout.js';
import { PianoKeyboard } from './keyboard/PianoKeyboard.js';
import { MidiPanel } from './midi/MidiPanel.js';
import { useMidi } from './midi/useMidi.js';
import { useSettings } from './settings/useSettings.js';
import s from './App.module.css';

const KEY_GROUPS = (['major', 'minor'] as const).map((mode) => ({
  label: mode === 'major' ? 'Major keys' : 'Minor keys',
  options: COMMON_KEYS.filter((k) => k.mode === mode).map((k) => ({ value: keyName(k), label: pretty(keyLabel(k)) })),
}));
const NAMING_OPTIONS: Array<{ value: NoteNaming; label: string }> = [
  { value: 'western', label: 'C D E' },
  { value: 'sargam', label: 'Sa Re Ga' },
  { value: 'both', label: 'Both' },
];
const SIZE_OPTIONS = KEYBOARD_SIZES.map((n) => ({ value: String(n), label: `${n} keys` }));
const THEME_NEXT: Record<ThemeSetting, ThemeSetting> = { dark: 'light', light: 'system', system: 'dark' };
const THEME_LABEL: Record<ThemeSetting, string> = { dark: 'Dark', light: 'Light', system: 'Auto' };

export function App() {
  const [settings, update] = useSettings();
  const theme = useTheme();
  const key = useMemo(() => parseKey(settings.currentKey) ?? C_MAJOR, [settings.currentKey]);
  const onSelectInput = useCallback((id: string | null) => update({ midiInputId: id }), [update]);
  const midi = useMidi(settings.midiInputId, onSelectInput);
  const computer = useComputerKeys();
  const [clicked, setClicked] = useState<ReadonlySet<MidiNote>>(new Set());

  const held = useMemo(() => [...new Set([...midi.held, ...computer.held, ...clicked])].sort((a, b) => a - b), [midi.held, computer.held, clicked]);
  const heldSet = useMemo(() => new Set(held), [held]);
  const sustained = useMemo(() => new Set(midi.sounding), [midi.sounding]);
  const description = useMemo(() => describe(held, key), [held, key]);

  // Clicked keys stay down until clicked again or cleared, so a chord can be built with the mouse.
  const toggle = useCallback((note: MidiNote) => {
    setClicked((prev) => {
      const next = new Set(prev);
      if (next.has(note)) next.delete(note);
      else next.add(note);
      return next;
    });
  }, []);
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
    <motion.main className={`ui-container ${s.shell}`} variants={stagger(0.06)} initial="hidden" animate="show">
      <motion.header className={s.header} variants={fadeUp}>
        <div className={s.brand}>
          <span className={s.logo} aria-hidden>
            <span />
            <span />
            <span />
          </span>
          <div>
            <h1 className="ui-title">Chord Namer</h1>
            <p className={`ui-muted ${s.tagline}`}>Play anything. See what it's called.</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => theme.setSetting(THEME_NEXT[theme.setting])} data-testid="theme">
          Theme: {THEME_LABEL[theme.setting]}
        </Button>
      </motion.header>

      <motion.div className={s.top} variants={fadeUp}>
        <Card className={s.connect}>
          <MidiPanel midi={midi} />
        </Card>
        <Card className={s.controls}>
          <Select label="Key" data-testid="key-select" value={keyName(key)} groups={KEY_GROUPS} onChange={(e) => update({ currentKey: e.target.value })} />
          <div className="ui-field">
            <span className="ui-field-label">Note names</span>
            <div data-testid="naming">
              <SegmentedControl label="Note names" value={settings.noteNaming} options={NAMING_OPTIONS} onChange={(v) => update({ noteNaming: v })} />
            </div>
          </div>
          <Select
            label="Keyboard"
            data-testid="size-select"
            value={String(size)}
            options={SIZE_OPTIONS}
            onChange={(e) => {
              const n = Number(e.target.value) as KeyboardSize;
              update({ keyboardSize: n, lowestNote: KEYBOARD_RANGES[n].low });
            }}
          />
        </Card>
      </motion.div>

      <motion.div variants={fadeUp}>
        <Card highlight padding="lg" className={s.stage}>
          <LiveDisplay description={description} naming={settings.noteNaming} keyOf={key} />
        </Card>
      </motion.div>

      <motion.div variants={fadeUp}>
        <Card padding="sm" className={s.board}>
          <div className={s.boardHead}>
            <p className={`ui-muted ${s.hint}`}>
              Click keys to add or remove them. Computer keys <Kbd>A</Kbd> to <Kbd>K</Kbd> play from <strong>C{Math.floor(computer.base / 12) - 1}</strong>;{' '}
              <Kbd>Z</Kbd> <Kbd>X</Kbd> change octave.
            </p>
            <Button variant="ghost" size="sm" onClick={clear} disabled={clicked.size === 0} data-testid="clear">
              Clear
            </Button>
          </div>
          <PianoKeyboard size={size} active={heldSet} sustained={sustained} onToggle={toggle} computerBase={computer.base} labelFor={labelFor} />
        </Card>
      </motion.div>
    </motion.main>
  );
}
