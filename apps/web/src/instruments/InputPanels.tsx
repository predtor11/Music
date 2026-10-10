import { Badge, Button } from '@music/ui';
import { midiName, pretty } from '@music/theory';
import { MidiPanel } from '../midi/MidiPanel.js';
import { useNoteInput } from '../input/NoteInput.js';
import { MICROPHONE_HELP, tuningText } from '../guitar/tuner.js';

export function PianoInputPanel() { return <MidiPanel midi={useNoteInput().midi} />; }

export function GuitarInputPanel() {
  const { microphone } = useNoteInput();
  const active = microphone.state === 'listening' || microphone.state === 'requesting';
  return <div className="ui-stack" data-testid="guitar-input">
    <div className="ui-row" style={{ flexWrap: 'wrap' }}>
      <Button variant="primary" onClick={() => active ? microphone.stop() : void microphone.start()} data-testid="guitar-microphone">
        {microphone.state === 'requesting' ? 'Cancel microphone' : active ? 'Stop microphone' : 'Start microphone'}
      </Button>
      <Badge>{microphone.state === 'listening' ? 'Listening' : 'Tap or microphone'}</Badge>
    </div>
    <p className="ui-muted" role="status" data-testid="guitar-mic-status">{MICROPHONE_HELP[microphone.state]}</p>
    <p role="status" aria-live="polite" data-testid="guitar-pitch">{microphone.reading
      ? `${pretty(midiName(microphone.reading.midi))} · ${tuningText(microphone.reading.cents)}`
      : 'No microphone note'}</p>
    <p className="ui-muted">Play one note at a time with the microphone. Tap frets to build chords. Audio stays on your device and is not recorded or uploaded.</p>
  </div>;
}
