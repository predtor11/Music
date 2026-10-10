import { useEffect, useRef, useState } from 'react';
// Relative import until Claude, the dependency/lockfile owner, registers @music/pitch for web.
import { MicrophonePitchInput, type MicrophoneState, type PitchReading } from '../../../../packages/pitch/src/index.js';

export function useMicrophone() {
  const [state, setState] = useState<MicrophoneState>('idle');
  const [reading, setReading] = useState<PitchReading | null>(null);
  const input = useRef<MicrophonePitchInput | null>(null);
  useEffect(() => {
    let live = true;
    const microphone = new MicrophonePitchInput({
      onState: (value) => { if (live) setState(value); },
      onPitch: (value) => { if (live) setReading(value); },
    });
    input.current = microphone;
    return () => {
      live = false;
      microphone.stop();
      input.current = null;
    };
  }, []);
  return { state, reading, start: () => input.current?.start(), stop: () => input.current?.stop() };
}
