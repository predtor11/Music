import { createContext, useContext, type ReactNode } from 'react';
import type { InstrumentId } from './model.js';

interface InstrumentContext { id: InstrumentId; choose: (id: InstrumentId) => void }
const Context = createContext<InstrumentContext>({ id: 'piano', choose: () => {} });

export function InstrumentProvider({ id, choose, children }: InstrumentContext & { children: ReactNode }) {
  return <Context.Provider value={{ id, choose }}>{children}</Context.Provider>;
}
export function useInstrument(): InstrumentContext { return useContext(Context); }
