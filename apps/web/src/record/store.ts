/**
 * Where recordings are kept: your account (the recordings service) when you
 * are signed in, or when sign-in isn't set up (local development); this
 * browser otherwise, so recording works before you sign in.
 */

import {
  RecordingSchema,
  type CreateRecording,
  type Recording,
  type RecordingSummary,
  CreateRecordingSchema,
  type UpdateRecording,
} from '@music/contracts';
import { useCallback, useEffect, useMemo, useState } from 'react';
import * as api from '../api/recordings.js';
import { useAuth } from '../auth/AuthProvider.js';

export interface RecordingStore {
  /** "account" or "browser", for telling the learner where it's kept. */
  where: 'account' | 'browser';
  list(): Promise<RecordingSummary[]>;
  get(id: string): Promise<Recording | null>;
  create(body: CreateRecording): Promise<Recording>;
  update(id: string, patch: UpdateRecording): Promise<Recording>;
  remove(id: string): Promise<void>;
}

const STORAGE_KEY = 'music.recordings.v1';
const CHANGED = 'recordings-changed';

function readLocal(): Recording[] {
  try {
    const list: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(list)) return [];
    return list.flatMap((item: unknown) => {
      const parsed = RecordingSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    });
  } catch {
    return [];
  }
}

function writeLocal(list: Recording[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    throw new Error("This browser's storage is full. Sign in to keep recordings in your account, or delete some.");
  }
  window.dispatchEvent(new Event(CHANGED));
}

const summary = ({ take: _take, corrections: _corrections, ...rest }: Recording): RecordingSummary => rest;

export const browserStore: RecordingStore = {
  where: 'browser',
  async list() {
    return readLocal()
      .map(summary)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async get(id) {
    return readLocal().find((r) => r.id === id) ?? null;
  },
  async create(input) {
    const body = CreateRecordingSchema.parse(input);
    const at = new Date().toISOString();
    const recording: Recording = {
      id: crypto.randomUUID(),
      title: body.title,
      source: body.source,
      durationMs: body.take.durationMs,
      noteCount: body.take.notes.length,
      keyOverride: body.keyOverride,
      createdAt: at,
      updatedAt: at,
      take: body.take,
      corrections: body.corrections,
    };
    writeLocal([...readLocal(), recording]);
    return recording;
  },
  async update(id, patch) {
    const list = readLocal();
    const i = list.findIndex((r) => r.id === id);
    if (i < 0) throw new Error('That recording is gone. It may have been deleted in another tab.');
    const updated = { ...list[i]!, ...patch, updatedAt: new Date().toISOString() };
    list[i] = updated;
    writeLocal(list);
    return updated;
  },
  async remove(id) {
    writeLocal(readLocal().filter((r) => r.id !== id));
  },
};

const accountStore: RecordingStore = {
  where: 'account',
  list: api.listRecordings,
  get: api.getRecording,
  create: async (body) => {
    const r = await api.createRecording(body);
    window.dispatchEvent(new Event(CHANGED));
    return r;
  },
  update: async (id, patch) => {
    const r = await api.updateRecording(id, patch);
    window.dispatchEvent(new Event(CHANGED));
    return r;
  },
  remove: async (id) => {
    await api.deleteRecording(id);
    window.dispatchEvent(new Event(CHANGED));
  },
};

/** The store for the current sign-in state, or null while sign-in is still loading. */
export function useRecordingStore(): RecordingStore | null {
  const { status } = useAuth();
  if (status === 'loading') return null;
  return status === 'signed-out' ? browserStore : accountStore;
}

export type ListState = { status: 'loading' } | { status: 'ready'; list: RecordingSummary[] } | { status: 'error'; message: string };

/** Your recordings, newest first, refreshed whenever one is saved, changed or deleted. */
export function useRecordingList(store: RecordingStore | null): ListState {
  const [state, setState] = useState<ListState>({ status: 'loading' });
  const load = useCallback(() => {
    if (!store) return;
    store.list().then(
      (list) => setState({ status: 'ready', list }),
      (err: Error) => setState({ status: 'error', message: err.message }),
    );
  }, [store]);
  useEffect(() => {
    load();
    window.addEventListener(CHANGED, load);
    return () => window.removeEventListener(CHANGED, load);
  }, [load]);
  return useMemo(() => state, [state]);
}
