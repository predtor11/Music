/**
 * The app's one sync runner, wired to the real outbox storage, the real
 * network and the sign-in state. Everything else in the app reaches the
 * outbox through here.
 */

import { EndSessionResponseSchema, SessionSchema } from '@music/contracts';
import { ApiError, call } from '../api/http.js';
import { openOutboxStore, type OutboxOp, type OutboxStore } from './outbox.js';
import { SyncRunner, type Identity } from './sync.js';

/** Opens the best storage on first use, so importing this file touches nothing. */
class LazyStore implements OutboxStore {
  private opened: Promise<OutboxStore> | null = null;
  kind: OutboxStore['kind'] = 'memory';
  private store(): Promise<OutboxStore> {
    this.opened ??= openOutboxStore().then((s) => {
      this.kind = s.kind;
      return s;
    });
    return this.opened;
  }
  async load() {
    return (await this.store()).load();
  }
  async put(op: OutboxOp) {
    return (await this.store()).put(op);
  }
  async remove(id: string) {
    return (await this.store()).remove(id);
  }
}

/** Sends one operation to the practice service. Replays are harmless: it keys on the ids in the bodies. */
export async function sendOp(op: OutboxOp): Promise<unknown> {
  try {
    switch (op.kind) {
      case 'createSession':
        return SessionSchema.parse(await call('/practice/sessions', { method: 'POST', body: JSON.stringify(op.payload) }));
      case 'attempt':
        return await call('/practice/attempts', { method: 'POST', body: JSON.stringify(op.payload) });
      case 'endSession':
        return EndSessionResponseSchema.parse(await call(`/practice/sessions/${op.sessionId}/end`, { method: 'POST', body: '{}' }));
    }
  } catch (error) {
    // A reply that doesn't match the contract is the server's problem; try again later rather than guess.
    if (error instanceof Error && error.name === 'ZodError') throw new ApiError('Unexpected reply from the app server.', 502);
    throw error;
  }
}

/** Who is signed in is not known until the sign-in provider has looked. */
let identity: Identity = { userId: null, canSync: false };
let identityKnown = false;
let wakeIdentity: () => void = () => undefined;
const identityReady = new Promise<void>((resolve) => {
  wakeIdentity = resolve;
});

function createRunner(): SyncRunner {
  return new SyncRunner({ store: new LazyStore(), send: sendOp, identity: () => identity, log: console });
}

let runner = createRunner();

export function getRunner(): SyncRunner {
  return runner;
}

/** Replaces the runner (tests). */
export function setRunnerForTests(next: SyncRunner, nextIdentity: Identity = { userId: 'test-user', canSync: true }): void {
  runner = next;
  identity = nextIdentity;
  identityKnown = true;
  wakeIdentity();
}

export function getIdentity(): Identity {
  return identity;
}

/** Waits (briefly) until sign-in has been looked at, so nothing is filed under the wrong user. */
export async function whenIdentityKnown(maxMs = 3_000): Promise<void> {
  if (identityKnown) return;
  await Promise.race([identityReady, new Promise<void>((resolve) => setTimeout(resolve, maxMs))]);
}

/**
 * Called by the sign-in provider whenever who is signed in changes. Practice
 * saved while signed out goes to whoever signs in, then everything is sent.
 */
export function setIdentity(next: Identity): void {
  identity = next;
  identityKnown = true;
  wakeIdentity();
  runner.refresh();
  if (next.canSync && next.userId) {
    void runner
      .claimAnonymous(next.userId)
      .then(() => runner.retryNow())
      .catch(() => undefined);
  }
}

/** True unless the browser says it has no network. */
export function browserOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

const TICK_MS = 60_000;
let started = false;

/** Starts syncing in the background: on load, when the network returns, when the tab is shown again, and on a slow timer. */
export function startSync(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  const kick = () => {
    void runner.retryNow().catch(() => undefined);
  };
  void runner.init().then(kick, () => undefined);
  window.addEventListener('online', kick);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void runner.flush().catch(() => undefined);
  });
  window.setInterval(() => {
    if (runner.getSnapshot().pending > 0) void runner.flush().catch(() => undefined);
  }, TICK_MS);
}
