/**
 * Pieces you import are kept in this browser, so they're there next time.
 * Nothing is uploaded. Pure helpers plus a thin localStorage wrapper.
 */

import type { Piece } from './piece.js';
import { STARTER_PIECES } from './starter.js';

const KEY = 'music.pieces.imported';
const TEMPO_KEY = 'music.pieces.tempo';

export function importedPieces(): Piece[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]') as Piece[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

/** Imported this visit, in case the browser won't store them. */
const thisVisit = new Map<string, Piece>();

/** Save an imported piece. Returns false when the browser won't store it (private mode, or full). */
export function saveImported(piece: Piece): boolean {
  thisVisit.set(piece.id, piece);
  try {
    const rest = importedPieces().filter((p) => p.id !== piece.id);
    localStorage.setItem(KEY, JSON.stringify([piece, ...rest]));
    return true;
  } catch {
    return false;
  }
}

export function removeImported(id: string): void {
  thisVisit.delete(id);
  try {
    localStorage.setItem(KEY, JSON.stringify(importedPieces().filter((p) => p.id !== id)));
  } catch {
    // Nothing to do: it just stays in the list.
  }
}

export function findPiece(id: string): Piece | null {
  return STARTER_PIECES.find((p) => p.id === id) ?? importedPieces().find((p) => p.id === id) ?? thisVisit.get(id) ?? null;
}

/** The tempo you last reached on a piece, so "In time" picks up where you left off. */
export function savedTempo(id: string): number | null {
  try {
    const all = JSON.parse(localStorage.getItem(TEMPO_KEY) ?? '{}') as Record<string, number>;
    return typeof all[id] === 'number' ? all[id] : null;
  } catch {
    return null;
  }
}

export function saveTempo(id: string, percent: number): void {
  try {
    const all = JSON.parse(localStorage.getItem(TEMPO_KEY) ?? '{}') as Record<string, number>;
    localStorage.setItem(TEMPO_KEY, JSON.stringify({ ...all, [id]: percent }));
  } catch {
    // Not saved; the tempo starts fresh next time.
  }
}
