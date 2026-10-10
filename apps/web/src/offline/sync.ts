/**
 * The sync runner: sends outbox operations to the server in order.
 *
 * - Order is kept per session (create, then attempts, then end). A session that
 *   hit a retryable error waits; other sessions carry on.
 * - 2xx means done. The server treats a repeated session or attempt id as a
 *   no-op, so replaying after a lost answer is safe.
 * - Network failures and 5xx/408/425/429 are retried later with backoff.
 * - 401 pauses everything until the person signs in again.
 * - Any other 4xx means the server will never accept it: the operation (and,
 *   for a session that was refused, the rest of that session) is dropped after
 *   logging, so one bad operation can't block the queue.
 * - Nothing is sent while nobody is signed in; operations stay in the queue,
 *   owned by ANONYMOUS until someone signs in here and claims them.
 *
 * No browser APIs in here: timers, storage and the network are injected.
 */

import { ANONYMOUS, type OpKind, type OutboxOp, type OutboxStore } from './outbox.js';

export interface Identity {
  /** The signed-in user (or a fixed id when sign-in is off); null when signed out. */
  userId: string | null;
  /** False while signed out or still working out who is signed in. */
  canSync: boolean;
}

export type StopReason = 'network' | 'auth' | 'identity' | null;

export interface SyncSnapshot {
  /** Operations waiting for the current owner. */
  pending: number;
  syncing: boolean;
  /** Why the last pass stopped early, if it did. */
  stopped: StopReason;
  /** A retry is scheduled (after a failure). */
  retrying: boolean;
  /** Operations given up on since the page opened. */
  dropped: number;
}

export type OpResult = { ok: true; response: unknown } | { ok: false; error: unknown };

export interface SyncDeps {
  store: OutboxStore;
  /** Performs one operation; throws an error with a numeric `status` (0 for no network) when it fails. */
  send(op: OutboxOp): Promise<unknown>;
  identity(): Identity;
  setTimer?(fn: () => void, ms: number): unknown;
  clearTimer?(handle: unknown): void;
  now?(): number;
  uuid?(): string;
  random?(): number;
  log?: Pick<Console, 'warn'>;
  /** First retry delay and the longest wait between retries. */
  backoff?: { baseMs: number; maxMs: number };
}

const DEFAULT_BACKOFF = { baseMs: 2_000, maxMs: 60_000 };

function statusOf(error: unknown): number {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : 0;
}

type Verdict = 'network' | 'auth' | 'retry' | 'permanent';

/** What a failed send means for the queue. */
export function classify(error: unknown): Verdict {
  const status = statusOf(error);
  if (status === 0) return 'network';
  if (status === 401) return 'auth';
  if (status >= 500 || status === 408 || status === 425 || status === 429) return 'retry';
  return 'permanent';
}

export class SyncRunner {
  private ops: OutboxOp[] = [];
  private readonly results = new Map<string, OpResult>();
  private readonly listeners = new Set<() => void>();
  private snapshot: SyncSnapshot = { pending: 0, syncing: false, stopped: null, retrying: false, dropped: 0 };
  private running: Promise<void> | null = null;
  private again = false;
  private timer: unknown = null;
  private failures = 0;
  private lastSeq = 0;
  private droppedCount = 0;
  private loaded: Promise<void> | null = null;
  private lock: Promise<unknown> = Promise.resolve();

  constructor(private readonly deps: SyncDeps) {}

  /** Loads what an earlier visit left behind. Safe to call more than once. */
  init(): Promise<void> {
    this.loaded ??= this.serial(() => this.reload()).then(() => this.publish({}));
    return this.loaded;
  }

  /** Runs storage changes one at a time, so a reload can't overwrite a queue that just grew. */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.lock.then(fn, fn);
    this.lock = run.catch(() => undefined);
    return run;
  }

  private async reload(): Promise<void> {
    try {
      this.ops = (await this.deps.store.load()).sort((a, b) => a.seq - b.seq);
    } catch (error) {
      this.deps.log?.warn('outbox: could not read the saved queue', error);
    }
    for (const op of this.ops) this.lastSeq = Math.max(this.lastSeq, op.seq);
  }

  private owner(): string {
    return this.deps.identity().userId ?? ANONYMOUS;
  }

  private publish(patch: Partial<SyncSnapshot>): void {
    const owner = this.owner();
    this.snapshot = {
      ...this.snapshot,
      ...patch,
      pending: this.ops.filter((o) => o.userId === owner).length,
      retrying: this.timer !== null,
      dropped: this.droppedCount,
    };
    for (const fn of [...this.listeners]) fn();
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): SyncSnapshot => this.snapshot;

  /** Re-reads who is signed in (call after it changes). */
  refresh(): void {
    this.publish({});
  }

  /** Operations still waiting for one session. */
  pendingFor(sessionId: string): number {
    return this.ops.filter((o) => o.sessionId === sessionId).length;
  }

  private remember(opId: string, result: OpResult): void {
    this.results.set(opId, result);
    // Callers that wait for an answer collect it straight away; keep the map small for the rest.
    if (this.results.size > 100) this.results.delete(this.results.keys().next().value!);
  }

  /** The outcome of an operation that has been tried, once. */
  takeResult(opId: string): OpResult | undefined {
    const result = this.results.get(opId);
    this.results.delete(opId);
    return result;
  }

  /** Adds an operation to the end of the queue; it is on disk before this resolves. */
  async enqueue<K extends OpKind>(kind: K, sessionId: string, payload: Extract<OutboxOp, { kind: K }>['payload']): Promise<OutboxOp> {
    await this.init();
    const seq = Math.max(this.lastSeq + 1, (this.deps.now ?? Date.now)());
    this.lastSeq = seq;
    const op = {
      id: (this.deps.uuid ?? (() => crypto.randomUUID()))(),
      seq,
      userId: this.owner(),
      kind,
      sessionId,
      payload,
      createdAt: new Date(seq).toISOString(),
      tries: 0,
    } as OutboxOp;
    await this.serial(async () => {
      await this.deps.store.put(op);
      this.ops.push(op);
    });
    this.publish({});
    return op;
  }

  /** Gives operations made while signed out to the user who just signed in. */
  async claimAnonymous(userId: string): Promise<void> {
    await this.init();
    const count = await this.serial(async () => {
      const claimed = this.ops.filter((o) => o.userId === ANONYMOUS);
      for (const op of claimed) {
        op.userId = userId;
        await this.deps.store.put(op);
      }
      return claimed.length;
    });
    if (count > 0) this.publish({});
  }

  /** Sends what can be sent. Calls overlap safely: a second call waits for the running pass and then runs one more. */
  flush(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      try {
        await this.init();
        let more = true;
        while (more) {
          this.again = false;
          await this.pass();
          more = this.again && this.snapshot.stopped === null;
        }
      } finally {
        this.running = null;
        this.publish({ syncing: false });
      }
    })();
    return this.running;
  }

  /** The person (or the browser) says things may have changed: forget the backoff and try now. */
  retryNow(): Promise<void> {
    this.failures = 0;
    this.cancelTimer();
    return this.flush();
  }

  private cancelTimer(): void {
    if (this.timer !== null) (this.deps.clearTimer ?? clearTimeout)(this.timer as never);
    this.timer = null;
  }

  private scheduleRetry(): void {
    this.cancelTimer();
    const { baseMs, maxMs } = this.deps.backoff ?? DEFAULT_BACKOFF;
    this.failures += 1;
    const wait = Math.min(baseMs * 2 ** (this.failures - 1), maxMs);
    const jittered = Math.round(wait * (0.75 + 0.25 * (this.deps.random ?? Math.random)()));
    this.timer = (this.deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms)))(() => {
      this.timer = null;
      void this.flush();
    }, jittered);
  }

  private async pass(): Promise<void> {
    await this.serial(() => this.reload());
    const identity = this.deps.identity();
    const owner = identity.userId;
    if (!identity.canSync || owner === null) {
      this.publish({ syncing: false, stopped: 'identity' });
      return;
    }
    const mine = this.ops.filter((o) => o.userId === owner);
    if (mine.length === 0) {
      this.failures = 0;
      this.cancelTimer();
      this.publish({ syncing: false, stopped: null });
      return;
    }

    this.publish({ syncing: true, stopped: null });
    const waiting = new Set<string>(); // sessions with a retryable failure this pass
    const refused = new Set<string>(); // sessions whose creation the server refused for good
    let stopped: StopReason = null;
    let retry = false;

    for (const op of mine) {
      if (waiting.has(op.sessionId)) continue;
      if (refused.has(op.sessionId)) {
        await this.drop(op, new Error('its session was refused'));
        continue;
      }
      try {
        const response = await this.deps.send(op);
        await this.finish(op);
        this.remember(op.id, { ok: true, response });
      } catch (error) {
        const verdict = classify(error);
        if (verdict === 'permanent') {
          this.deps.log?.warn(`outbox: dropping ${op.kind} for session ${op.sessionId}, the server said ${statusOf(error)}`, error);
          if (op.kind === 'createSession') refused.add(op.sessionId);
          await this.drop(op, error);
          continue;
        }
        op.tries += 1;
        await this.deps.store.put(op).catch(() => undefined);
        this.remember(op.id, { ok: false, error });
        if (verdict === 'network') {
          stopped = 'network';
          retry = true;
          break;
        }
        if (verdict === 'auth') {
          stopped = 'auth';
          break;
        }
        waiting.add(op.sessionId);
        retry = true;
      }
    }

    if (retry) this.scheduleRetry();
    else {
      this.failures = 0;
      this.cancelTimer();
    }
    this.publish({ syncing: false, stopped });
  }

  private async finish(op: OutboxOp): Promise<void> {
    await this.deps.store.remove(op.id);
    this.ops = this.ops.filter((o) => o.id !== op.id);
    this.publish({});
  }

  private async drop(op: OutboxOp, error: unknown): Promise<void> {
    this.droppedCount += 1;
    this.remember(op.id, { ok: false, error });
    await this.finish(op);
  }
}
