/**
 * The last progress report that loaded, kept in localStorage per user, so the
 * progress screen can show it (with a gentle note) when the network is down.
 */

import { ProgressReportSchema, type ProgressReport } from '@music/contracts';
import type { InstrumentId } from '../instruments/model.js';

export interface SavedReport {
  report: ProgressReport;
  /** Minutes ahead of UTC the report's days were split at. */
  tzOffset: number;
  /** When it was fetched, ISO. */
  savedAt: string;
}

const key = (userId: string, instrument: InstrumentId) => `music.report.v1:${userId}${instrument === 'piano' ? '' : ':guitar'}`;

export function saveReport(userId: string, saved: SavedReport, storage: Pick<Storage, 'setItem'> = localStorage, instrument: InstrumentId = 'piano'): void {
  try {
    storage.setItem(key(userId, instrument), JSON.stringify(saved));
  } catch {
    // Storage full or blocked: the report just won't be available offline.
  }
}

export function loadReport(userId: string, storage: Pick<Storage, 'getItem'> = localStorage, instrument: InstrumentId = 'piano'): SavedReport | null {
  try {
    const raw = storage.getItem(key(userId, instrument));
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<SavedReport>;
    const report = ProgressReportSchema.safeParse(data.report);
    if (!report.success || typeof data.tzOffset !== 'number' || typeof data.savedAt !== 'string') return null;
    return { report: report.data, tzOffset: data.tzOffset, savedAt: data.savedAt };
  } catch {
    return null;
  }
}

/** "today at 14:05", "yesterday", "3 days ago": how long ago the saved copy is, in plain words. */
export function savedAgo(savedAt: string, now = new Date()): string {
  const then = new Date(savedAt);
  const days = Math.floor((now.getTime() - then.getTime()) / 86_400_000);
  if (Number.isNaN(days) || days < 0) return 'earlier';
  if (days === 0) return 'earlier today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}
