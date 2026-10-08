import type { MistakeKind, ProgressReport, StoredAttempt } from '@music/contracts';
import { intervalInfo, mod12 } from '@music/theory';

export type MistakePattern = ProgressReport['patterns'][number];

/** A pattern has to show up this often in the window before the report mentions it. */
export const MIN_OCCURRENCES = 2;
const MAX_PATTERNS = 5;

const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);
const isHalfStep = (a: number, b: number) => [1, 11].includes(mod12(a - b));

interface Finding {
  id: string;
  description: string;
}

/** Interval items: which interval was asked for and which one was played. */
function intervalFinding(a: StoredAttempt): Finding | null {
  const [e0, e1] = a.expected;
  const [p0, p1] = a.played;
  if (e0 === undefined || e1 === undefined || p0 === undefined || p1 === undefined) return null;
  const asked = Math.abs(e1 - e0);
  const played = Math.abs(p1 - p0);
  // Same size in the wrong octave is an octave slip, not an interval mix-up.
  if (asked === played || mod12(asked) === mod12(played)) return null;
  const [lo, hi] = [intervalInfo(asked), intervalInfo(played)].sort((x, y) => x.semitones - y.semitones) as [
    ReturnType<typeof intervalInfo>,
    ReturnType<typeof intervalInfo>,
  ];
  return {
    id: `interval-mixup:${lo.short}-${hi.short}`,
    description: `Mixes up the ${lo.name} (${lo.semitones} half steps) and the ${hi.name} (${hi.semitones} half steps)`,
  };
}

/** Chord items: a chord tone played a half step off, named by its role in the chord. */
function chordFinding(a: StoredAttempt): Finding | null {
  if (a.expected.length === 0) return null;
  const root = mod12(a.expected[0]!);
  const expected = new Set(a.expected.map(mod12));
  const played = new Set(a.played.map(mod12));
  const missing = [...expected].filter((pc) => !played.has(pc));
  const extra = [...played].filter((pc) => !expected.has(pc));
  for (const m of missing) {
    if (!extra.some((x) => isHalfStep(m, x))) continue;
    const degree = mod12(m - root);
    if (degree === 3 || degree === 4) {
      return { id: 'chord-third', description: 'Plays the wrong 3rd in chords, so major and minor chords get swapped' };
    }
    if (degree >= 6 && degree <= 8) {
      return { id: 'chord-fifth', description: 'Moves the 5th of a chord a half step, which turns it diminished or augmented' };
    }
    if (degree === 10 || degree === 11) {
      return { id: 'chord-seventh', description: 'Mixes up the major 7th and minor 7th in seventh chords' };
    }
    return { id: 'chord-half-step', description: 'Plays a chord note one key away from where it belongs' };
  }
  return null;
}

/** Scale items: a sharp or flat left out, or one added that the key doesn't have. */
function scaleFinding(a: StoredAttempt): Finding | null {
  const expected = new Set(a.expected.map(mod12));
  const played = new Set(a.played.map(mod12));
  for (const m of expected) {
    if (played.has(m)) continue;
    const swapped = [...played].find((x) => !expected.has(x) && isHalfStep(m, x));
    if (swapped === undefined) continue;
    if (BLACK_KEYS.has(m) && !BLACK_KEYS.has(swapped)) {
      return { id: 'scale-missed-accidental', description: 'Plays a white key where the scale needs a sharp or flat' };
    }
    if (!BLACK_KEYS.has(m) && BLACK_KEYS.has(swapped)) {
      return { id: 'scale-extra-accidental', description: 'Adds a sharp or flat that the scale does not have' };
    }
    return { id: 'scale-half-step', description: 'Plays a scale note one key away from where it belongs' };
  }
  return null;
}

/** Single-note items: the neighbouring key, usually a sharp/flat mix-up. */
function noteFinding(a: StoredAttempt): Finding | null {
  const [e] = a.expected;
  const [p] = a.played;
  if (e === undefined || p === undefined || !isHalfStep(e, p)) return null;
  if (BLACK_KEYS.has(mod12(e)) || BLACK_KEYS.has(mod12(p))) {
    return { id: 'note-sharp-flat', description: 'Goes to the wrong side when finding sharps and flats' };
  }
  return { id: 'note-neighbour', description: 'Lands on the key next to the note asked for' };
}

const FROM_MISTAKE_KIND: Partial<Record<MistakeKind, string>> = {
  'wrong-octave': 'Plays the right note in the wrong octave',
  'wrong-inversion': 'Plays chords in a different inversion than asked',
  'wrong-order': 'Plays the right notes in the wrong order',
  'missing-notes': 'Leaves notes out of chords and scales',
  'extra-notes': 'Adds notes that do not belong',
};

/** What a single wrong attempt shows, if anything. Pure. */
export function classifyMistake(a: StoredAttempt): Finding | null {
  if (!a.correct) {
    const specific =
      a.itemKind === 'play-interval'
        ? intervalFinding(a)
        : a.itemKind === 'build-chord'
          ? chordFinding(a)
          : a.itemKind === 'play-scale'
            ? scaleFinding(a)
            : a.itemKind === 'find-note'
              ? noteFinding(a)
              : null;
    if (specific) return specific;
  }
  // Retried attempts carry the first try's mistake kind even though the final notes were right.
  if ((!a.correct || a.retried) && a.mistake && FROM_MISTAKE_KIND[a.mistake]) {
    return { id: `mistake:${a.mistake}`, description: FROM_MISTAKE_KIND[a.mistake]! };
  }
  return null;
}

/** Repeating mistake patterns across a set of attempts, most frequent first. Pure. */
export function detectPatterns(attempts: readonly StoredAttempt[]): MistakePattern[] {
  const found = new Map<string, MistakePattern & { skillSet: Set<string> }>();
  for (const a of attempts) {
    const f = classifyMistake(a);
    if (!f) continue;
    const entry = found.get(f.id) ?? { ...f, occurrences: 0, skills: [], skillSet: new Set<string>() };
    entry.occurrences += 1;
    entry.skillSet.add(a.skill);
    found.set(f.id, entry);
  }
  return [...found.values()]
    .filter((p) => p.occurrences >= MIN_OCCURRENCES)
    .sort((a, b) => b.occurrences - a.occurrences || a.id.localeCompare(b.id))
    .slice(0, MAX_PATTERNS)
    .map(({ skillSet, ...p }) => ({ ...p, skills: [...skillSet].sort() }));
}
