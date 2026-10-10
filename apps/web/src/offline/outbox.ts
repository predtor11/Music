/**
 * The outbox: practice operations waiting to reach the server, kept on this
 * device so they survive a closed tab. IndexedDB is the home; if it isn't
 * there (private windows, blocked storage) the same operations go to
 * localStorage, and as a last resort to memory for this page's lifetime.
 */

import type { Attempt, CreateSession } from '@music/contracts';

/** Owner of operations made while nobody was signed in. They move to the next account that signs in here. */
export const ANONYMOUS = 'anonymous';

interface OpBase {
  /** Unique id of this operation (the storage key). */
  id: string;
  /** Orders operations: creation time in ms, bumped so two never share one. */
  seq: number;
  /** Who made it: a user id, or ANONYMOUS. */
  userId: string;
  sessionId: string;
  createdAt: string;
  /** How many sends failed with a retryable error. */
  tries: number;
}

export type OutboxOp =
  | (OpBase & { kind: 'createSession'; payload: CreateSession & { id: string } })
  | (OpBase & { kind: 'attempt'; payload: Attempt & { id: string } })
  | (OpBase & { kind: 'endSession'; payload: Record<string, never> });

export type OpKind = OutboxOp['kind'];

/** Where operations are kept. Small on purpose: the runner holds the logic. */
export interface OutboxStore {
  readonly kind: 'indexeddb' | 'localstorage' | 'memory';
  load(): Promise<OutboxOp[]>;
  put(op: OutboxOp): Promise<void>;
  remove(id: string): Promise<void>;
}

export class MemoryStore implements OutboxStore {
  readonly kind = 'memory' as const;
  private ops = new Map<string, OutboxOp>();
  async load(): Promise<OutboxOp[]> {
    return [...this.ops.values()].map((o) => structuredClone(o));
  }
  async put(op: OutboxOp): Promise<void> {
    this.ops.set(op.id, structuredClone(op));
  }
  async remove(id: string): Promise<void> {
    this.ops.delete(id);
  }
}

const LS_KEY = 'music.outbox.v1';

/** The same operations as one JSON list in localStorage. */
export class LocalStorageStore implements OutboxStore {
  readonly kind = 'localstorage' as const;
  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'>) {}

  private read(): OutboxOp[] {
    try {
      const parsed: unknown = JSON.parse(this.storage.getItem(LS_KEY) ?? '[]');
      return Array.isArray(parsed) ? (parsed as OutboxOp[]) : [];
    } catch {
      return [];
    }
  }
  private write(ops: OutboxOp[]): void {
    this.storage.setItem(LS_KEY, JSON.stringify(ops));
  }
  async load(): Promise<OutboxOp[]> {
    return this.read();
  }
  async put(op: OutboxOp): Promise<void> {
    const ops = this.read().filter((o) => o.id !== op.id);
    ops.push(op);
    this.write(ops);
  }
  async remove(id: string): Promise<void> {
    this.write(this.read().filter((o) => o.id !== id));
  }
}

const DB_NAME = 'music-outbox';
const STORE = 'ops';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

export class IndexedDbStore implements OutboxStore {
  readonly kind = 'indexeddb' as const;
  private constructor(private readonly db: IDBDatabase) {}

  static open(factory: IDBFactory = indexedDB): Promise<IndexedDbStore> {
    return new Promise((resolve, reject) => {
      const req = factory.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(new IndexedDbStore(req.result));
      req.onerror = () => reject(req.error ?? new Error('IndexedDB could not be opened'));
      req.onblocked = () => reject(new Error('IndexedDB is blocked'));
    });
  }

  async load(): Promise<OutboxOp[]> {
    return request<OutboxOp[]>(this.db.transaction(STORE, 'readonly').objectStore(STORE).getAll());
  }
  async put(op: OutboxOp): Promise<void> {
    await request(this.db.transaction(STORE, 'readwrite').objectStore(STORE).put(op));
  }
  async remove(id: string): Promise<void> {
    await request(this.db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id));
  }
}

/** Opens the best store this browser allows. Never throws. */
export async function openOutboxStore(): Promise<OutboxStore> {
  try {
    if (typeof indexedDB !== 'undefined') {
      const store = await IndexedDbStore.open();
      await store.load(); // some browsers only fail on first use
      return store;
    }
  } catch {
    // fall through to localStorage
  }
  try {
    if (typeof localStorage !== 'undefined') {
      const probe = `${LS_KEY}.probe`;
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return new LocalStorageStore(localStorage);
    }
  } catch {
    // fall through to memory
  }
  return new MemoryStore();
}
