/**
 * Best score and rounds played per ear level, kept on this device so the
 * level list can show how you're doing even when nothing is saved to the server.
 */

const STORE = 'music.ear.stats';

export interface LevelStats {
  rounds: number;
  /** Best first-try score, in percent. */
  best: number;
  last: number;
}

export function readStats(): Record<string, LevelStats> {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as Record<string, LevelStats>) : {};
  } catch {
    return {};
  }
}

export function recordRound(levelId: string, percent: number): LevelStats {
  const all = readStats();
  const prev = all[levelId];
  const next = { rounds: (prev?.rounds ?? 0) + 1, best: Math.max(prev?.best ?? 0, percent), last: percent };
  try {
    localStorage.setItem(STORE, JSON.stringify({ ...all, [levelId]: next }));
  } catch {
    // Private windows can refuse storage; the round still counts on screen.
  }
  return next;
}
