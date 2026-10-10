/**
 * Skill tags. Every attempt carries one ("interval:M3", "note:D"), the
 * progress service schedules reviews per tag, and the practice service finds
 * review items by tag, so all three must tag an item the same way. Pure.
 */

import type { InstrumentId, TestItem } from '@music/contracts';
import { intervalInfo, pcName, pitchClass, pretty } from '@music/theory';

/** The concept an item tests, for example "interval:M3" or "chord:C-E-G". */
export function skillFor(item: TestItem, instrument: InstrumentId = 'piano'): string {
  const skill = baseSkillFor(item);
  return instrument === 'guitar' ? `g:${skill}` : skill;
}

function baseSkillFor(item: TestItem): string {
  switch (item.kind) {
    case 'find-note':
      return `note:${pcName(item.midi !== undefined ? pitchClass(item.midi) : item.pc!)}`;
    case 'play-interval':
      return `interval:${intervalInfo(item.semitones).short}`;
    case 'play-scale':
      return `scale:${pcName(item.sequence[0]!)}`;
    case 'build-chord':
      return `chord:${item.pitchClasses.map((pc) => pcName(pc)).join('-')}`;
    case 'name-it':
      return `name-it:${item.answer}`;
    case 'play-progression':
      return `progression:${item.numerals.join('-')}`;
    case 'read-staff':
      return `staff:${item.clef}`;
    case 'tap-rhythm':
      return `rhythm:${item.timeSignature.join('/')}`;
  }
}

/** The topic of a skill: the part before ":" ("interval" for "interval:M3"). */
export function topicOf(skill: string): string {
  if (skill.startsWith('g:')) return topicOf(skill.slice(2));
  const i = skill.indexOf(':');
  return i < 0 ? skill : skill.slice(0, i);
}

const TOPIC_NAMES: Record<string, string> = {
  note: 'Finding',
  interval: 'Interval',
  scale: 'Scale from',
  chord: 'Chord',
  'name-it': 'Naming',
  progression: 'Progression',
  rhythm: 'Rhythm in',
};

const INTERVAL_NAMES: Record<string, string> = {};
for (let n = 0; n <= 21; n++) INTERVAL_NAMES[intervalInfo(n).short] = intervalInfo(n).name;

/** A short label a learner can read: "note:D" → "Finding D", "interval:M3" → "Interval: major 3rd". */
export function skillLabel(skill: string): string {
  if (skill.startsWith('g:')) return `Guitar: ${skillLabel(skill.slice(2))}`;
  const topic = topicOf(skill);
  const rest = skill.slice(topic.length + 1);
  if (!rest) return topic;
  switch (topic) {
    case 'interval':
      return `Interval: ${INTERVAL_NAMES[rest] ?? rest}`;
    case 'chord':
      return `Chord ${rest.split('-').map((n) => pretty(n)).join(' ')}`;
    case 'staff':
      return `Reading the ${rest} clef`;
    case 'note':
    case 'scale':
    case 'name-it':
      return `${TOPIC_NAMES[topic]} ${pretty(rest)}`;
    default:
      return `${TOPIC_NAMES[topic] ?? topic} ${rest}`;
  }
}
