import type { Progress, ProgressReport, StoredAttempt } from '@music/contracts';
import { detectPatterns, type MistakePattern } from './patterns.js';
import { DAY, MINUTE, isFirstTry, median } from './skills.js';

type Suggestion = ProgressReport['suggestions'][number];

export interface WeeklyReportInput {
  userId: string;
  /** End of the window; the window is the 7 days before it. */
  to: Date;
  /**
   * Attempts from at least 14 days before `to`: the week before the window is
   * the baseline for speed changes. Anything outside both weeks is ignored.
   */
  attempts: readonly StoredAttempt[];
  /**
   * Local dates (YYYY-MM-DD) with any practice, all time, for the streak.
   * Defaults to the dates found in `attempts`.
   */
  practiceDays?: readonly string[];
  /** The learner's offset from UTC in minutes (India is +330); days split at local midnight. */
  utcOffsetMinutes?: number;
  /** Unlock state, for "next lesson" and "take the checkpoint" suggestions. */
  progress?: Progress;
  /** Skills due for review right now. */
  dueReviews?: number;
}

const WEEK = 7 * DAY;
/** A pause longer than this inside a session counts as a break, not practice. */
const MAX_GAP = 5 * MINUTE;
/** A topic below this first-try accuracy, with enough attempts, gets a review suggestion. */
const WEAK_ACCURACY = 0.75;
const MIN_TOPIC_ATTEMPTS = 5;

/** The topic is the part of a skill before ":", for example "interval" in "interval:M3". */
export function topicOf(skill: string): string {
  // Guitar skills carry a "g:" prefix; reports are per instrument, so the topic is the same as piano's.
  if (skill.startsWith('g:')) return topicOf(skill.slice(2));
  const i = skill.indexOf(':');
  return i === -1 ? skill : skill.slice(0, i);
}

export function localDate(iso: string | number, utcOffsetMinutes = 0): string {
  const t = typeof iso === 'number' ? iso : Date.parse(iso);
  return new Date(t + utcOffsetMinutes * MINUTE).toISOString().slice(0, 10);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Minutes played: per session, the first answer's time plus the gaps between answers, ignoring breaks. */
export function practiceMinutes(attempts: readonly StoredAttempt[]): number {
  const bySession = groupBy(attempts, (a) => a.sessionId);
  let ms = 0;
  for (const list of bySession.values()) {
    const times = list.map((a) => Date.parse(a.playedAt)).sort((a, b) => a - b);
    const first = list.find((a) => Date.parse(a.playedAt) === times[0]);
    ms += Math.min(first?.timeMs ?? 0, MAX_GAP);
    for (let i = 1; i < times.length; i++) ms += Math.min(times[i]! - times[i - 1]!, MAX_GAP);
  }
  return round1(ms / MINUTE);
}

/** Days in a row with practice, ending today, or yesterday when today has none yet. */
export function streakDays(days: Iterable<string>, today: string): number {
  const set = new Set(days);
  let cursor = Date.parse(`${today}T00:00:00Z`);
  if (!set.has(today)) cursor -= DAY;
  let streak = 0;
  while (set.has(new Date(cursor).toISOString().slice(0, 10))) {
    streak += 1;
    cursor -= DAY;
  }
  return streak;
}

function groupBy<T>(items: Iterable<T>, key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

const accuracy = (list: readonly StoredAttempt[]) => (list.length ? list.filter(isFirstTry).length / list.length : 0);

export function accuracyTrend(attempts: readonly StoredAttempt[], utcOffsetMinutes = 0): ProgressReport['accuracyTrend'] {
  const groups = groupBy(attempts, (a) => `${topicOf(a.skill)}|${localDate(a.playedAt, utcOffsetMinutes)}`);
  return [...groups.entries()]
    .map(([k, list]) => {
      const [topic, date] = k.split('|') as [string, string];
      return { topic, date, firstTryAccuracy: accuracy(list), attempts: list.length };
    })
    .sort((a, b) => a.topic.localeCompare(b.topic) || a.date.localeCompare(b.date));
}

/** Median time of correct answers this week, against the week before. Negative change means faster. */
export function speedChanges(week: readonly StoredAttempt[], previous: readonly StoredAttempt[]): ProgressReport['speed'] {
  const before = groupBy(
    previous.filter((a) => a.correct),
    (a) => a.skill,
  );
  return [...groupBy(
    week.filter((a) => a.correct),
    (a) => a.skill,
  ).entries()]
    .map(([skill, list]) => {
      const now = median(list.map((a) => a.timeMs))!;
      const then = median((before.get(skill) ?? []).map((a) => a.timeMs));
      return { skill, medianTimeMs: now, changePercent: then ? round1(((now - then) / then) * 100) : null, n: list.length };
    })
    .sort((a, b) => b.n - a.n || a.skill.localeCompare(b.skill))
    .map(({ n: _n, ...s }) => s);
}

const TOPIC_WORDS: Record<string, string> = {
  interval: 'intervals',
  chord: 'chords',
  scale: 'scales',
  note: 'note names',
  key: 'keys',
  numeral: 'chord numbers',
};
export const topicWords = (topic: string) => TOPIC_WORDS[topic] ?? topic;

function patternAdvice(p: MistakePattern): string {
  if (p.id.startsWith('interval-mixup:')) {
    const [a, b] = p.id.slice('interval-mixup:'.length).split('-');
    return `You often mix up ${a} and ${b}. Play both from the same starting note, back and forth, until you can hear which is which.`;
  }
  switch (p.id) {
    case 'chord-third':
      return 'Your chords often get the wrong 3rd. Play a major chord, then move only the middle note down a half step to make it minor, on several roots.';
    case 'chord-fifth':
      return 'The 5th of your chords slips a half step. Check it is 7 half steps above the root before you play.';
    case 'chord-seventh':
      return 'You mix up major 7th and minor 7th chords. The major 7th sits a half step below the octave; the minor 7th a whole step below.';
    case 'scale-missed-accidental':
      return 'You leave out sharps or flats in scales. Name the black keys of the key out loud before you start.';
    case 'scale-extra-accidental':
      return 'You add black keys the scale does not have. Play the scale slowly and say each note name.';
    case 'note-sharp-flat':
      return 'Sharps go one key to the right, flats one key to the left. A quick find-the-note drill on black keys will fix this.';
    case 'mistake:wrong-inversion':
      return 'Your chords often come out in another inversion. Start each chord from the note asked for at the bottom.';
    case 'mistake:wrong-octave':
      return 'You often find the right note in the wrong octave. Use middle C as your landmark.';
    default:
      return `Watch out for this: ${p.description.charAt(0).toLowerCase()}${p.description.slice(1)}. Slow down on ${p.skills.join(', ')}.`;
  }
}

function suggest(
  report: Omit<ProgressReport, 'suggestions'>,
  week: readonly StoredAttempt[],
  input: WeeklyReportInput,
): Suggestion[] {
  const out: Suggestion[] = [];

  const topPattern = report.patterns[0];
  if (topPattern) out.push({ text: patternAdvice(topPattern) });

  const weakest = [...groupBy(week, (a) => topicOf(a.skill)).entries()]
    .filter(([, list]) => list.length >= MIN_TOPIC_ATTEMPTS)
    .map(([topic, list]) => ({ topic, acc: accuracy(list) }))
    .filter((t) => t.acc < WEAK_ACCURACY)
    .sort((a, b) => a.acc - b.acc)[0];
  if (weakest) {
    out.push({
      text: `You got ${Math.round(weakest.acc * 100)}% of ${topicWords(weakest.topic)} right first time this week. A short review session on ${topicWords(weakest.topic)} will help.`,
    });
  }

  const units = input.progress?.units ?? [];
  const readyForCheckpoint = units.find((u) => u.unlocked && !u.checkpointPassed && u.lessons.length > 0 && u.lessons.every((l) => l.status === 'done'));
  if (readyForCheckpoint) {
    out.push({ text: 'You have finished every lesson in this unit. Take the checkpoint to unlock the next one.', unitId: readyForCheckpoint.unitId });
  }

  if (input.dueReviews) {
    const n = input.dueReviews;
    out.push({ text: `${n} skill${n === 1 ? ' is' : 's are'} due for review. A five-minute review keeps them from slipping.` });
  }

  for (const unit of units) {
    const next = unit.lessons.find((l) => l.status === 'in-progress') ?? unit.lessons.find((l) => l.status === 'available');
    if (next) {
      out.push({
        text: next.status === 'in-progress' ? 'Finish the lesson you started.' : 'Start your next lesson.',
        lessonId: next.lessonId,
        unitId: unit.unitId,
      });
      break;
    }
  }

  const { streakDays: streak, sessions } = report.practice;
  if (sessions === 0) out.push({ text: 'No practice this week. Ten minutes today is a good restart.' });
  else if (streak === 0) out.push({ text: 'Play for ten minutes today to start a new streak.' });
  else out.push({ text: `Keep your ${streak}-day streak going: even ten minutes counts.` });

  if (out.length < 2) out.push({ text: 'Try free play: play songs you know by ear and see which chords the app names.' });
  return out.slice(0, 3);
}

/**
 * The weekly report: practice time, accuracy per topic per day, repeated
 * mistakes, speed change against the week before, and 2-3 next steps. Pure.
 */
export function buildWeeklyReport(input: WeeklyReportInput): ProgressReport {
  const offset = input.utcOffsetMinutes ?? 0;
  const to = input.to.getTime();
  const from = to - WEEK;
  const inRange = (a: StoredAttempt, start: number, end: number) => {
    const t = Date.parse(a.playedAt);
    return t > start && t <= end;
  };
  const week = input.attempts.filter((a) => inRange(a, from, to));
  const previous = input.attempts.filter((a) => inRange(a, from - WEEK, from));
  const days = input.practiceDays ?? input.attempts.map((a) => localDate(a.playedAt, offset));

  const base: Omit<ProgressReport, 'suggestions'> = {
    userId: input.userId,
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    practice: {
      minutes: practiceMinutes(week),
      sessions: new Set(week.map((a) => a.sessionId)).size,
      streakDays: streakDays(days, localDate(to, offset)),
    },
    accuracyTrend: accuracyTrend(week, offset),
    patterns: detectPatterns(week),
    speed: speedChanges(week, previous),
  };
  return { ...base, suggestions: suggest(base, week, input) };
}
