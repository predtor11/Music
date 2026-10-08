import type { Recording, RecordingSummary, UpdateRecording } from '@music/contracts';

/** Where recordings live: Postgres (schema `recordings`) in production, memory in tests and local runs. */
export interface RecordingStore {
  /** The user's recordings, newest first, without their notes. */
  list(userId: string): Promise<RecordingSummary[]>;
  get(userId: string, id: string): Promise<Recording | null>;
  create(userId: string, recording: Recording): Promise<Recording>;
  /** Returns null when the user has no recording with this id. */
  update(userId: string, id: string, patch: UpdateRecording, updatedAt: string): Promise<Recording | null>;
  /** Returns false when there was nothing to delete. */
  delete(userId: string, id: string): Promise<boolean>;
  count(userId: string): Promise<number>;
  close(): Promise<void>;
}

export function summaryOf(r: Recording): RecordingSummary {
  const { take: _take, corrections: _corrections, ...summary } = r;
  return summary;
}

export class InMemoryRecordingStore implements RecordingStore {
  private readonly rows = new Map<string, { userId: string; recording: Recording }>();

  async list(userId: string): Promise<RecordingSummary[]> {
    return [...this.rows.values()]
      .filter((r) => r.userId === userId)
      .map((r) => summaryOf(r.recording))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async get(userId: string, id: string): Promise<Recording | null> {
    const row = this.rows.get(id);
    return row && row.userId === userId ? row.recording : null;
  }

  async create(userId: string, recording: Recording): Promise<Recording> {
    this.rows.set(recording.id, { userId, recording });
    return recording;
  }

  async update(userId: string, id: string, patch: UpdateRecording, updatedAt: string): Promise<Recording | null> {
    const existing = await this.get(userId, id);
    if (!existing) return null;
    const updated = { ...existing, ...patch, updatedAt };
    this.rows.set(id, { userId, recording: updated });
    return updated;
  }

  async delete(userId: string, id: string): Promise<boolean> {
    if (!(await this.get(userId, id))) return false;
    return this.rows.delete(id);
  }

  async count(userId: string): Promise<number> {
    return [...this.rows.values()].filter((r) => r.userId === userId).length;
  }

  async close(): Promise<void> {}
}
