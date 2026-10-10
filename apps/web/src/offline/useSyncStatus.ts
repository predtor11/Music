import { useSyncExternalStore } from 'react';
import { browserOnline, getRunner } from './runtime.js';
import type { SyncSnapshot } from './sync.js';

/** The outbox's state, re-rendering when it changes. */
export function useSyncSnapshot(): SyncSnapshot {
  const runner = getRunner();
  return useSyncExternalStore(runner.subscribe, runner.getSnapshot);
}

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/** Whether the browser thinks it has a network. */
export function useBrowserOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, browserOnline, () => true);
}

export type ChipState = 'online' | 'offline' | 'pending' | 'syncing';

export interface Chip {
  state: ChipState;
  label: string;
  title: string;
}

/** What the status chip says, from the network and the outbox. Pure, so it can be tested. */
export function chipFor(online: boolean, snapshot: SyncSnapshot, canSync: boolean): Chip {
  const { pending } = snapshot;
  const reachable = online && snapshot.stopped !== 'network';
  if (snapshot.syncing && pending > 0) return { state: 'syncing', label: 'Syncing…', title: `Saving ${pending} to your account.` };
  if (pending > 0) {
    const label = `${pending} to sync`;
    if (!canSync) return { state: 'pending', label, title: 'Saved on this device. Sign in to add it to your account.' };
    if (!reachable) return { state: 'pending', label, title: "You're offline. Saved on this device, it will sync when you're back online." };
    return { state: 'pending', label, title: 'Saved on this device, waiting to sync.' };
  }
  if (!reachable) return { state: 'offline', label: 'Offline', title: 'No connection. Lessons you have opened before still work, and your practice is kept on this device.' };
  return { state: 'online', label: 'Online', title: 'Connected. Everything is saved.' };
}
