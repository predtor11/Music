import type { ComponentType } from 'react';
import type { TestItem } from '@music/contracts';
import type { PianoKeyboardProps } from '../keyboard/PianoKeyboard.js';
import type { KeyboardSize } from '../keyboard/layout.js';
import type { Route } from '../router.js';
import type { InstrumentId } from './model.js';

/** Shared MIDI marks/captions; the registry chooses their instrument-specific geometry. */
export type InstrumentVisualProps = Omit<PianoKeyboardProps, 'active' | 'sustained' | 'onToggle' | 'computerBase' | 'size'> & { size: KeyboardSize; clickable?: boolean };
export interface InstrumentEntry {
  id: InstrumentId;
  label: string;
  description: string;
  Input: ComponentType;
  Visual: ComponentType<InstrumentVisualProps>;
  pages: readonly Route['page'][];
  drillKinds: readonly TestItem['kind'][];
}
