/**
 * A song cut into short sections, each with one plain-English line, so a
 * beginner sees "this part goes 1 – 5 – 6m – 4" without reading a chart.
 */

import { baseOf, type Analysis, type ChordSegment } from '@music/analysis';

export interface Section {
  /** 1, 2, 3 ... */
  number: number;
  /** Seconds. */
  start: number;
  end: number;
  /** Indexes into analysis.segments of every segment (chords and gaps) in the section. */
  segments: number[];
  /** The chords as numbers, for example "1 – 5 – 6m – 4". */
  numbers: string;
  /** The chords as symbols, for example "G D Em C". */
  symbols: string;
  /** What to know about this part, in plain words. */
  line: string;
}

const MAX_RUNS = 8;

/** Same chord again and again counts once. */
function runs(analysis: Analysis): Array<{ chord: NonNullable<ChordSegment['chord']>; indexes: number[]; edited: boolean; unsure: boolean }> {
  const out: ReturnType<typeof runs> = [];
  analysis.segments.forEach((seg, i) => {
    if (!seg.chord) return;
    const last = out[out.length - 1];
    const same = last && baseOf(last.chord).symbol === baseOf(seg.chord).symbol && last.indexes[last.indexes.length - 1] === i - 1;
    if (same) {
      last.indexes.push(i);
      last.edited ||= !!seg.edited;
      last.unsure ||= seg.confidence < 0.5;
    } else out.push({ chord: seg.chord, indexes: [i], edited: !!seg.edited, unsure: seg.confidence < 0.5 });
  });
  return out;
}

/** How the section's last chord feels, for a beginner. */
function endingWords(number: string): string {
  const n = baseNumber(number);
  if (n === '1') return 'It ends back on 1, home, so it feels finished.';
  if (n === '5') return 'It ends on 5, which pulls strongly back to 1.';
  if (n === '4') return 'It ends on 4, which leaves it hanging a little.';
  return `It ends on ${number}.`;
}

/** "5/7" (inversion) counts as "5". */
const baseNumber = (number: string) => number.split('/')[0]!;

export function songSections(analysis: Analysis): Section[] {
  const all = runs(analysis);
  if (all.length === 0) return [];
  // Cut where the progression repeats, so each section is one go round of it.
  const loopLength = analysis.summary.loop?.numbers.length ?? 0;
  const size = loopLength >= 2 && loopLength <= MAX_RUNS ? loopLength : 4;
  const sections: Section[] = [];
  const seen = new Map<string, number>();
  for (let at = 0; at < all.length; at += size) {
    const group = all.slice(at, at + size);
    const first = group[0]!.indexes[0]!;
    const last = group[group.length - 1]!.indexes.at(-1)!;
    const numbers = group.map((g) => g.chord.number);
    const key = group.map((g) => baseOf(g.chord).number).join(' ');
    const number = sections.length + 1;
    const sentences: string[] = [];
    const same = seen.get(key);
    if (same) sentences.push(`The same chords as section ${same}.`);
    else {
      seen.set(key, number);
      sentences.push(group.length === 1 ? `One chord, ${numbers[0]}.` : `It goes ${numbers.join(' – ')}.`);
      sentences.push(endingWords(numbers[numbers.length - 1]!));
    }
    const outside = group.filter((g) => !g.chord.inKey).map((g) => g.chord.symbol);
    if (outside.length) sentences.push(`${[...new Set(outside)].join(' and ')} ${new Set(outside).size > 1 ? 'are' : 'is'} from outside the key, a borrowed colour.`);
    const fixed = group.filter((g) => g.edited).length;
    if (fixed) sentences.push(`You changed ${fixed} chord${fixed > 1 ? 's' : ''} here.`);
    else if (group.some((g) => g.unsure)) sentences.push('Not sure about every chord here: tap one to hear it and fix it.');
    sections.push({
      number,
      start: analysis.segments[first]!.start,
      end: analysis.segments[last]!.end,
      segments: Array.from({ length: last - first + 1 }, (_, i) => first + i),
      numbers: numbers.join(' – '),
      symbols: group.map((g) => g.chord.symbol).join(' '),
      line: sentences.join(' '),
    });
  }
  return sections;
}

/** The segment sounding at `time`, or -1. */
export function segmentAt(analysis: Analysis, time: number): number {
  return analysis.segments.findIndex((s) => time >= s.start && time < s.end);
}
