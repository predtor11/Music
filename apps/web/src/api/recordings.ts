/** Calls to the recordings service, through the gateway at /api/recordings. */

import {
  RecordingListSchema,
  RecordingSchema,
  type CreateRecording,
  type Recording,
  type RecordingSummary,
  type UpdateRecording,
} from '@music/contracts';
import { ApiError, call } from './client.js';

export async function listRecordings(): Promise<RecordingSummary[]> {
  return RecordingListSchema.parse(await call('/recordings/takes'));
}

/** One recording with its notes, or null when it doesn't exist (or isn't yours). */
export async function getRecording(id: string): Promise<Recording | null> {
  try {
    return RecordingSchema.parse(await call(`/recordings/takes/${encodeURIComponent(id)}`));
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export async function createRecording(body: CreateRecording): Promise<Recording> {
  return RecordingSchema.parse(await call('/recordings/takes', { method: 'POST', body: JSON.stringify(body) }));
}

export async function updateRecording(id: string, patch: UpdateRecording): Promise<Recording> {
  return RecordingSchema.parse(await call(`/recordings/takes/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }));
}

export async function deleteRecording(id: string): Promise<void> {
  // A JSON body, because the app always sends a JSON content type and the server refuses an empty one.
  await call(`/recordings/takes/${encodeURIComponent(id)}`, { method: 'DELETE', body: '{}' });
}
