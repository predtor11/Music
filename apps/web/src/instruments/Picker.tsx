import { Button, Card, Select } from '@music/ui';
import { useInstrument } from './context.js';
import { INSTRUMENTS } from './registry.js';
import { instrumentId, type InstrumentId } from './model.js';
import s from './Picker.module.css';
import pianoArt from '../assets/instruments/piano.webp';
import guitarArt from '../assets/instruments/guitar.webp';

const ART: Record<InstrumentId, string> = {
  piano: pianoArt,
  guitar: guitarArt,
};

export function InstrumentSwitcher({ location }: { location: 'header' | 'settings' }) {
  const instrument = useInstrument();
  return <div className="ui-stack">
    {location === 'settings' && <img className={s.settingsArt} src={ART[instrument.id]} alt={instrument.id === 'piano' ? 'A grand piano' : 'An acoustic guitar'} />}
    <Select label="Instrument" value={instrument.id} data-testid={`instrument-${location}`}
    options={INSTRUMENTS.map(({ id, label }) => ({ value: id, label }))}
    onChange={(event) => instrument.choose(instrumentId(event.target.value))} />
  </div>;
}

export function InstrumentPicker({ onChoose }: { onChoose: (id: InstrumentId) => void }) {
  return <div className="ui-stack" data-testid="instrument-picker">
    <div><p className="ui-eyebrow">Welcome</p><h1 className="ui-title">What would you like to play?</h1>
      <p className="ui-muted">Choose an instrument. Your lessons, input and progress follow that choice. You can switch any time.</p></div>
    <div className={s.choices}>
      {INSTRUMENTS.map(({ id, label, description }) => <Card key={id} className="ui-stack">
        <img className={s.art} src={ART[id]} alt={id === 'piano' ? 'A grand piano' : 'An acoustic guitar'} />
        <h2 className="ui-heading">{label}</h2><p className="ui-muted">{description}</p>
        <Button variant="primary" onClick={() => onChoose(id)} data-testid={`choose-${id}`}>Choose {label}</Button>
      </Card>)}
    </div>
  </div>;
}
