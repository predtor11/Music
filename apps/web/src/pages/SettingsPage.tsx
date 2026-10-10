/**
 * Settings: note names (Western, sargam or both), keyboard size and theme.
 * Saved in this browser, and on your account when you're signed in.
 */

import type { NoteNaming, UserSettings } from '@music/contracts';
import { C_MAJOR } from '@music/theory';
import { Button, Card, SegmentedControl, Select, fadeUp, stagger } from '@music/ui';
import { motion } from 'motion/react';
import { useMemo } from 'react';
import { useAuth } from '../auth/AuthProvider.js';
import { KEYBOARD_RANGES, KEYBOARD_SIZES, type KeyboardSize } from '../keyboard/layout.js';
import { LiveKeyboard } from '../keyboard/LiveKeyboard.js';
import type { KeyMark } from '../keyboard/PianoKeyboard.js';
import { noteLabeller } from '../keyboard/labels.js';
import { href } from '../router.js';
import { SyncBadge } from '../settings/SyncBadge.js';
import s from '../settings/settings.module.css';
import type { SyncState } from '../settings/useSettings.js';
import { useInstrument } from '../instruments/context.js';
import { InstrumentSwitcher } from '../instruments/Picker.js';

const NAMING_OPTIONS: Array<{ value: NoteNaming; label: string }> = [
  { value: 'western', label: 'C D E' },
  { value: 'sargam', label: 'Sa Re Ga' },
  { value: 'both', label: 'Both' },
];
const THEME_OPTIONS: Array<{ value: UserSettings['theme']; label: string }> = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'Auto' },
];
const SIZE_OPTIONS = KEYBOARD_SIZES.map((n) => ({ value: String(n), label: `${n} keys` }));
/** The C major scale from middle C, marked so the preview shows the note names. */
const PREVIEW_MARKS: ReadonlyMap<number, KeyMark> = new Map([60, 62, 64, 65, 67, 69, 71, 72].map((n) => [n, 'target' as const]));

export function SettingsPage({ settings, update, sync }: { settings: UserSettings; update: (patch: Partial<UserSettings>) => void; sync: SyncState }) {
  const auth = useAuth();
  const instrument = useInstrument();
  const labelFor = useMemo(() => noteLabeller(C_MAJOR, settings.noteNaming), [settings.noteNaming]);
  const size = settings.keyboardSize as KeyboardSize;

  return (
    <motion.div className={s.page} variants={stagger(0.06)} initial="hidden" animate="show" data-testid="page-settings">
      <motion.div variants={fadeUp}>
        <p className="ui-eyebrow">Settings</p>
        <h1 className="ui-title">Make it yours</h1>
      </motion.div>

      <motion.div variants={fadeUp}>
        <Card padding="lg" className={s.account} data-testid="account-card">
          {auth.status === 'signed-in' && auth.user ? (
            <>
              <span className={s.bigAvatar} aria-hidden>
                {(auth.user.email ?? '?').charAt(0)}
              </span>
              <div className={s.who}>
                <span className="ui-muted">Signed in as</span>
                <span className={s.email} data-testid="account-email">
                  {auth.user.email}
                </span>
              </div>
              <SyncBadge state={sync} />
              <Button variant="secondary" onClick={() => void auth.signOut()} data-testid="sign-out">
                Sign out
              </Button>
            </>
          ) : (
            <>
              <div className={s.who}>
                <span className={s.email}>Not signed in</span>
                <span className="ui-muted">
                  {auth.status === 'off' ? 'Settings are saved in this browser.' : 'Settings are saved in this browser only. Sign in to keep them everywhere.'}
                </span>
              </div>
              <SyncBadge state="local" />
              {auth.status !== 'off' && (
                <Button variant="primary" onClick={() => (location.hash = href.signin)} data-testid="settings-signin">
                  Sign in
                </Button>
              )}
            </>
          )}
        </Card>
      </motion.div>

      <motion.div className={s.grid} variants={fadeUp}>
        <Card className={s.section}>
          <h2 className="ui-heading">Instrument</h2>
          <p className="ui-muted">Lessons, input and progress follow your instrument. Switching keeps your work for the other instrument.</p>
          <InstrumentSwitcher location="settings" />
        </Card>
        <Card className={s.section}>
          <h2 className="ui-heading">Note names</h2>
          <p className="ui-muted">How keys and chords are labelled. Sargam moves Sa with the key.</p>
          <div data-testid="settings-naming">
            <SegmentedControl label="Note names" value={settings.noteNaming} options={NAMING_OPTIONS} onChange={(v) => update({ noteNaming: v })} />
          </div>
        </Card>
        {instrument.id === 'piano' && <Card className={s.section}>
          <h2 className="ui-heading">Keyboard</h2>
          <p className="ui-muted">Match the number of keys on your MIDI keyboard.</p>
          <Select
            label="Keyboard size"
            data-testid="settings-size"
            value={String(size)}
            options={SIZE_OPTIONS}
            onChange={(e) => {
              const n = Number(e.target.value) as KeyboardSize;
              update({ keyboardSize: n, lowestNote: KEYBOARD_RANGES[n].low });
            }}
          />
        </Card>}
        <Card className={s.section}>
          <h2 className="ui-heading">Theme</h2>
          <p className="ui-muted">Auto follows your computer's light or dark mode.</p>
          <div data-testid="settings-theme">
            <SegmentedControl label="Theme" value={settings.theme} options={THEME_OPTIONS} onChange={(v) => update({ theme: v })} />
          </div>
        </Card>
      </motion.div>

      <motion.div variants={fadeUp}>
        <Card padding="sm" className={s.preview}>
          <LiveKeyboard size={size} marks={PREVIEW_MARKS} labelFor={labelFor} />
        </Card>
      </motion.div>
    </motion.div>
  );
}
