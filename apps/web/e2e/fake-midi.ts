import { test as base, type Page } from '@playwright/test';

/**
 * Replaces navigator.requestMIDIAccess with a fake keyboard before the app
 * loads, so tests can press keys as if a real MIDI keyboard were plugged in.
 * window.__midi controls it from the test.
 */
function installFakeMidi(inputs: Array<{ id: string; name: string }>) {
  type Port = { id: string; name: string; manufacturer: string; state: string; onmidimessage: ((e: { data: Uint8Array }) => void) | null };
  const ports = new Map<string, Port>();
  const access = {
    inputs: { forEach: (cb: (p: Port) => void) => ports.forEach((p) => cb(p)) },
    outputs: new Map(),
    onstatechange: null as null | (() => void),
  };
  for (const i of inputs) ports.set(i.id, { ...i, manufacturer: 'Test', state: 'connected', onmidimessage: null });

  (window as unknown as { __midi: unknown }).__midi = {
    send(data: number[], id?: string) {
      const list = id ? [ports.get(id)!] : [...ports.values()];
      for (const p of list) p.onmidimessage?.({ data: new Uint8Array(data) });
    },
    plug(id: string, name: string) {
      ports.set(id, { id, name, manufacturer: 'Test', state: 'connected', onmidimessage: null });
      access.onstatechange?.();
    },
    unplug(id: string) {
      const p = ports.get(id);
      if (p) p.state = 'disconnected';
      access.onstatechange?.();
    },
  };
  Object.defineProperty(navigator, 'requestMIDIAccess', { value: () => Promise.resolve(access), configurable: true });
}

export class Midi {
  constructor(private readonly page: Page) {}
  send(data: number[], id?: string) {
    return this.page.evaluate(([d, i]) => (window as never as { __midi: { send(d: number[], i?: string): void } }).__midi.send(d, i), [data, id] as const);
  }
  on(...notes: number[]) {
    return Promise.all(notes.map((n) => this.send([0x90, n, 100]))).then(() => undefined);
  }
  off(...notes: number[]) {
    return Promise.all(notes.map((n) => this.send([0x80, n, 0]))).then(() => undefined);
  }
  pedal(down: boolean) {
    return this.send([0xb0, 64, down ? 127 : 0]);
  }
  plug(id: string, name: string) {
    return this.page.evaluate(([i, n]) => (window as never as { __midi: { plug(i: string, n: string): void } }).__midi.plug(i, n), [id, name] as const);
  }
}

export const test = base.extend<{ midi: Midi; midiInputs: Array<{ id: string; name: string }> }>({
  midiInputs: [[{ id: 'kbd-1', name: 'Test Keyboard' }], { option: true }],
  midi: async ({ page, midiInputs }, use) => {
    await page.addInitScript(installFakeMidi, midiInputs);
    await use(new Midi(page));
  },
});

export { expect } from '@playwright/test';

/** MIDI note numbers by name, middle C = C4 = 60. */
export const N = { E3: 52, G3: 55, A3: 57, C4: 60, D4: 62, E4: 64, G4: 67 } as const;
