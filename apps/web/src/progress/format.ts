/**
 * Turns the weekly report into what the progress screen shows: plain-word
 * topic and skill names, the seven days of the week, per-topic trends, speed
 * changes and where each suggestion leads. Pure, so it is unit tested.
 */

import type { ProgressReport } from '@music/contracts';
import { pretty } from '@music/theory';
import { href } from '../router.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const TOPICS: Record<string, string> = {
  note: 'Note names',
  interval: 'Intervals',
  chord: 'Chords',
  scale: 'Scales',
  'name-it': 'Naming keys',
  progression: 'Chord progressions',
  numeral: 'Chord numbers',
  key: 'Keys',
  staff: 'Reading music',
  rhythm: 'Rhythm',
};

export function topicLabel(topic: string): string {
  return TOPICS[topic] ?? topic.charAt(0).toUpperCase() + topic.slice(1).replace(/-/g, ' ');
}

const QUALITY: Record<string, string> = { M: 'major', m: 'minor', P: 'perfect', A: 'augmented', d: 'diminished' };

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

/** "interval:M3" → "Intervals: major 3rd", "note:F#" → "Note names: F♯". */
export function skillLabel(skill: string): string {
  // Guitar skills carry a "g:" prefix; the report is already per instrument, so label them like piano's.
  if (skill.startsWith('g:')) return skillLabel(skill.slice(2));
  const i = skill.indexOf(':');
  if (i === -1) return topicLabel(skill);
  const topic = skill.slice(0, i);
  let rest = skill.slice(i + 1);
  const interval = topic === 'interval' ? /^([MmPAd])(\d+)$/.exec(rest) : null;
  if (interval) rest = `${QUALITY[interval[1]!]} ${ordinal(Number(interval[2]))}`;
  else if (topic === 'chord') rest = rest.split('-').map(pretty).join(' ');
  else rest = pretty(rest);
  return `${topicLabel(topic)}: ${rest}`;
}

export interface Day {
  /** YYYY-MM-DD in the learner's time zone. */
  date: string;
  /** Mon, Tue… */
  short: string;
  /** Monday 6 October */
  long: string;
}

/** The seven local days of the report, oldest first, ending on the day of `to`. */
export function weekDays(report: Pick<ProgressReport, 'to'>, tzOffset: number): Day[] {
  const end = Date.parse(report.to) + tzOffset * 60_000;
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(end - (6 - i) * DAY_MS);
    return {
      date: d.toISOString().slice(0, 10),
      short: d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }),
      long: d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }),
    };
  });
}

export const percent = (n: number) => `${Math.round(n * 100)}%`;

export interface TopicSummary {
  topic: string;
  label: string;
  attempts: number;
  /** First-try accuracy over the whole week. */
  accuracy: number;
  /** One point per day with practice: slot is the index in weekDays. */
  points: Array<{ slot: number; value: number; label: string }>;
  /** Last practised day's accuracy minus the first one's, or null with one day. */
  change: number | null;
}

/** Per topic, most practised first. */
export function topicSummaries(report: Pick<ProgressReport, 'accuracyTrend'>, days: readonly Day[]): TopicSummary[] {
  const slot = new Map(days.map((d, i) => [d.date, i]));
  const byTopic = new Map<string, ProgressReport['accuracyTrend']>();
  for (const row of report.accuracyTrend) byTopic.set(row.topic, [...(byTopic.get(row.topic) ?? []), row]);
  return [...byTopic.entries()]
    .map(([topic, rows]) => {
      const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
      const attempts = sorted.reduce((n, r) => n + r.attempts, 0);
      const right = sorted.reduce((n, r) => n + r.firstTryAccuracy * r.attempts, 0);
      const points = sorted.flatMap((r) => {
        const i = slot.get(r.date);
        if (i === undefined) return [];
        const day = days[i]!;
        return [{ slot: i, value: r.firstTryAccuracy, label: `${day.short}: ${percent(r.firstTryAccuracy)} of ${r.attempts}` }];
      });
      return {
        topic,
        label: topicLabel(topic),
        attempts,
        accuracy: attempts ? right / attempts : 0,
        points,
        change: sorted.length > 1 ? sorted.at(-1)!.firstTryAccuracy - sorted[0]!.firstTryAccuracy : null,
      };
    })
    .sort((a, b) => b.attempts - a.attempts || a.label.localeCompare(b.label));
}

/** First-try accuracy over every topic, weighted by attempts; null with no attempts. */
export function overallAccuracy(report: Pick<ProgressReport, 'accuracyTrend'>): number | null {
  const attempts = report.accuracyTrend.reduce((n, r) => n + r.attempts, 0);
  if (!attempts) return null;
  return report.accuracyTrend.reduce((n, r) => n + r.firstTryAccuracy * r.attempts, 0) / attempts;
}

/** Right, almost or wrong, for colouring an accuracy. */
export function accuracyTone(n: number): 'good' | 'warn' | 'bad' {
  return n >= 0.8 ? 'good' : n >= 0.6 ? 'warn' : 'bad';
}

export function formatTime(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function formatMinutes(minutes: number): string {
  return minutes < 10 ? String(Math.round(minutes * 10) / 10) : String(Math.round(minutes));
}

/** Speed change in words: negative change means faster. */
export function speedChange(changePercent: number | null): { text: string; tone: 'good' | 'warn' | 'neutral' } {
  if (changePercent === null) return { text: 'New this week', tone: 'neutral' };
  const n = Math.round(Math.abs(changePercent));
  if (n < 1) return { text: 'Same speed', tone: 'neutral' };
  return changePercent < 0 ? { text: `${n}% faster`, tone: 'good' } : { text: `${n}% slower`, tone: 'warn' };
}

/** Where a suggestion leads, with the button text. */
export function suggestionLink(s: ProgressReport['suggestions'][number]): { href: string; action: string } {
  if (s.lessonId) return { href: href.lesson(s.lessonId), action: 'Open lesson' };
  if (s.unitId) return { href: href.checkpoint(s.unitId), action: 'Take the unit test' };
  if (/free play/i.test(s.text)) return { href: href.chords, action: 'Free play' };
  if (/streak|ten minutes|no practice/i.test(s.text)) return { href: href.lessons, action: 'Go to lessons' };
  // Mistake patterns, weak topics and due reviews: practise the weak spots.
  return { href: href.review, action: 'Start a review' };
}

/** Nothing practised this week (and nothing to chart). */
export function isEmptyReport(report: ProgressReport): boolean {
  return report.practice.sessions === 0 && report.accuracyTrend.length === 0;
}

/** "6 – 12 October" for the report's window. */
export function rangeLabel(days: readonly Day[]): string {
  const fmt = (date: string, withMonth: boolean) =>
    new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', ...(withMonth ? { month: 'long' } : {}), timeZone: 'UTC' });
  const first = days[0]!.date;
  const last = days.at(-1)!.date;
  return `${fmt(first, first.slice(5, 7) !== last.slice(5, 7))} – ${fmt(last, true)}`;
}
