/**
 * Chord Namer: play anything and see what it is called, live.
 */

import type { NoteNaming, UserSettings } from '@music/contracts';
import { COMMON_KEYS, C_MAJOR, keyLabel, keyName, parseKey, pretty } from '@music/theory';
import { Button, Card, Kbd, SegmentedControl, Select, fadeUp, stagger } from '@music/ui';
import { motion } from 'motion/react';
import { useMemo } from 'react';
import { playChord } from '../audio/sound.js';
import { describe } from '../chord/describe.js';
import { LiveDisplay } from '../chord/LiveDisplay.js';
import { useNoteInput } from '../input/NoteInput.js';
import { KEYBOARD_RANGES, KEYBOARD_SIZES, type KeyboardSize } from '../keyboard/layout.js';
import { LiveKeyboard } from '../keyboard/LiveKeyboard.js';
import { useInstrument } from '../instruments/context.js';
import { instrumentEntry } from '../instruments/registry.js';
import { noteLabeller } from '../keyboard/labels.js';
import s from './ChordNamerPage.module.css';

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

export function ChordNamerPage({ settings, update }: { settings: UserSettings; update: (patch: Partial<UserSettings>) => void }) {
  const { id: instrument } = useInstrument();
  const Input = instrumentEntry(instrument).Input;
  const input = useNoteInput();
  const key = useMemo(() => parseKey(settings.currentKey) ?? C_MAJOR, [settings.currentKey]);
  const description = useMemo(() => describe(input.held, key), [input.held, key]);
  const labelFor = useMemo(() => noteLabeller(key, settings.noteNaming), [key, settings.noteNaming]);
  const size = settings.keyboardSize as KeyboardSize;

  return (
    <motion.div className={s.page} variants={stagger(0.06)} initial="hidden" animate="show">
      <motion.div className={s.top} variants={fadeUp}>
        <Card className={s.connect}>
          <Input />
        </Card>
        <Card className={s.controls}>
          <Select label="Key" data-testid="key-select" value={keyName(key)} groups={KEY_GROUPS} onChange={(e) => update({ currentKey: e.target.value })} />
          <div className="ui-field">
            <span className="ui-field-label">Note names</span>
            <div data-testid="naming">
              <SegmentedControl label="Note names" value={settings.noteNaming} options={NAMING_OPTIONS} onChange={(v) => update({ noteNaming: v })} />
            </div>
          </div>
          {instrument === 'piano' && <Select
            label="Keyboard"
            data-testid="size-select"
            value={String(size)}
            options={SIZE_OPTIONS}
            onChange={(e) => {
              const n = Number(e.target.value) as KeyboardSize;
              update({ keyboardSize: n, lowestNote: KEYBOARD_RANGES[n].low });
            }}
          />}
        </Card>
      </motion.div>

      <motion.div variants={fadeUp}>
        <Card highlight padding="lg" className={s.stage}>
          <LiveDisplay description={description} naming={settings.noteNaming} keyOf={key} />
        </Card>
      </motion.div>

      <motion.div variants={fadeUp}>
        <Card padding="sm">
          <div className={s.boardHead}>
            <p className={`ui-muted ${s.hint}`}>
              {instrument === 'guitar' ? 'Tap a fret to play it. Tap it again to release that string. Choose another fret on the same string to move the note.' : <>
                Click keys to add or remove them. Computer keys <Kbd>A</Kbd> to <Kbd>K</Kbd> play from <strong>C{Math.floor(input.computerBase / 12) - 1}</strong>;{' '}
                <Kbd>Z</Kbd> <Kbd>X</Kbd> change octave.
              </>}
            </p>
            <div className={s.boardActions}>
              <Button variant="secondary" size="sm" onClick={() => void playChord(input.held)} disabled={input.held.length === 0} data-testid="hear">
                ▶ Hear it
              </Button>
              <Button variant="ghost" size="sm" onClick={input.clear} disabled={input.clicked.size === 0} data-testid="clear">
                Clear
              </Button>
            </div>
          </div>
          <LiveKeyboard size={size} labelFor={labelFor} />
        </Card>
      </motion.div>
    </motion.div>
  );
}
