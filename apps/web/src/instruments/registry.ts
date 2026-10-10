import { GuitarVisual } from './GuitarVisual.js';
import { GuitarInputPanel, PianoInputPanel } from './InputPanels.js';
import { PianoVisual } from './PianoVisual.js';
import type { InstrumentId } from './model.js';
import type { InstrumentEntry } from './types.js';

const SHARED_PAGES = ['chords', 'lessons', 'lesson', 'checkpoint', 'review', 'progress', 'songs', 'record', 'recording',
  'charts', 'chart', 'chartEdit', 'chartImport', 'settings', 'signin'] as const;
const DRILLS = ['find-note', 'play-interval', 'play-scale', 'build-chord', 'name-it', 'play-progression', 'read-staff', 'tap-rhythm'] as const;

export const INSTRUMENTS: readonly InstrumentEntry[] = [
  { id: 'piano', label: 'Piano', description: 'A MIDI keyboard, computer keys or the on-screen piano.',
    Input: PianoInputPanel, Visual: PianoVisual,
    pages: [...SHARED_PAGES, 'daily', 'hands', 'hand', 'pieces', 'piece', 'ear', 'ear-level', 'jam', 'bandtalk'], drillKinds: DRILLS },
  { id: 'guitar', label: 'Guitar', description: 'An interactive fretboard and microphone input for single notes.',
    Input: GuitarInputPanel, Visual: GuitarVisual, pages: SHARED_PAGES, drillKinds: DRILLS },
];

export function instrumentEntry(id: InstrumentId): InstrumentEntry { return INSTRUMENTS.find((entry) => entry.id === id)!; }
