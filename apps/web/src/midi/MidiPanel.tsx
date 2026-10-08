import { AnimatePresence, motion } from 'motion/react';
import { Button, Pill, Select, type Tone } from '../design/components/index.js';
import { rise } from '../design/motion.js';
import type { MidiState } from './useMidi.js';
import s from './midi.module.css';

const ALL = '__all__';

function statusView(m: MidiState): { tone: Tone; text: string; pulse?: boolean } {
  switch (m.status) {
    case 'unsupported':
      return { tone: 'danger', text: 'MIDI not available' };
    case 'idle':
      return { tone: 'neutral', text: 'Not connected' };
    case 'requesting':
      return { tone: 'warning', text: 'Waiting for permission', pulse: true };
    case 'denied':
      return { tone: 'danger', text: 'Permission blocked' };
    case 'ready': {
      const live = m.inputs.filter((i) => i.connected);
      if (live.length === 0) return { tone: 'warning', text: 'No keyboard found', pulse: true };
      const picked = live.find((i) => i.id === m.selected);
      return { tone: 'success', text: picked ? picked.name : live.length === 1 ? live[0]!.name : `${live.length} keyboards` };
    }
  }
}

function helpText(m: MidiState): string | null {
  if (m.status === 'unsupported') {
    if (m.browser === 'safari') return "Safari can't read MIDI keyboards. Open this page in Chrome or Edge to use yours. Until then, click the keys below or use your computer keys.";
    if (m.browser === 'firefox') return "This Firefox can't read MIDI keyboards here. Chrome or Edge work best. Until then, click the keys below or use your computer keys.";
    return "This browser can't read MIDI keyboards. Open this page in Chrome or Edge. Until then, click the keys below or use your computer keys.";
  }
  if (m.status === 'denied') {
    if (m.browser === 'firefox') return 'Firefox blocked MIDI. Allow MIDI access for this site when Firefox asks (it installs a small site permission), or use Chrome or Edge.';
    return 'MIDI access was blocked. Click the icon at the left of the address bar, allow MIDI devices, then press Try again.';
  }
  if (m.status === 'ready' && !m.inputs.some((i) => i.connected)) {
    return 'Plug in your keyboard with USB. It shows up here on its own, no reload needed.';
  }
  if (m.status === 'idle') return 'Connect your MIDI keyboard to see chord names as you play.';
  return null;
}

export function MidiPanel({ midi }: { midi: MidiState }) {
  const view = statusView(midi);
  const help = helpText(midi);
  const live = midi.inputs.filter((i) => i.connected);
  const canConnect = midi.status === 'idle' || midi.status === 'denied';

  return (
    <div className={s.panel}>
      <div className={s.row}>
        <Pill tone={view.tone} pulse={view.pulse} testId="midi-status">
          {view.text}
        </Pill>
        {midi.pedal && (
          <Pill tone="success" testId="pedal">
            Pedal
          </Pill>
        )}
        <div className={s.spacer} />
        {canConnect && (
          <Button variant="primary" onClick={midi.connect} data-testid="midi-connect">
            {midi.status === 'denied' ? 'Try again' : 'Connect keyboard'}
          </Button>
        )}
        {midi.status === 'ready' && (
          <Button size="sm" onClick={() => midi.select(midi.selected)} data-testid="midi-reconnect" title="Re-listen to the keyboard and clear stuck notes">
            Reconnect
          </Button>
        )}
      </div>

      {midi.status === 'ready' && live.length > 1 && (
        <motion.div variants={rise} initial="hidden" animate="show" className={s.picker}>
          <Select
            label="Keyboard"
            testId="midi-device"
            value={midi.selected ?? ALL}
            options={[{ value: ALL, label: 'All keyboards' }, ...live.map((i) => ({ value: i.id, label: i.name }))]}
            onChange={(v) => midi.select(v === ALL ? null : v)}
          />
        </motion.div>
      )}

      <AnimatePresence initial={false}>
        {help && (
          <motion.p key={help} className={s.help} data-testid="midi-help" variants={rise} initial="hidden" animate="show" exit="exit">
            {help}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
