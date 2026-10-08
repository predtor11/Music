import type { TestItem } from '@music/contracts';
import { intervalInfo, mod12, parseMidi, parseNote, pitchClass, sargam, spelledPc } from '@music/theory';

/**
 * Checks that a test item's expected answer matches what its prompt asks for,
 * using @music/theory as the judge. Content authors write the prompt and the
 * answer by hand; this catches the two drifting apart ("Play F#" with pc 5).
 * Returns a list of problems; empty means the item checks out.
 */

const LOWEST = 21; // A0
const HIGHEST = 108; // C8
const NOTE_TOKEN = /(?<![A-Za-z#])([A-G](?:#|b)?)(-?\d)?(?![A-Za-z])/g;
const SA_IS = /\bSa is ([A-G](?:#|b)?)\.\s*/;

/** Note names in a prompt, in order. "middle C" counts as C4. */
function noteTokens(text: string): Array<{ pc: number; midi?: number; text: string }> {
  return [...text.replace(/middle C/g, 'C4').matchAll(NOTE_TOKEN)].map((m) => {
    const parsed = parseNote(m[1]!)!;
    const token: { pc: number; midi?: number; text: string } = { pc: spelledPc(parsed.note), text: m[0] };
    if (m[2] !== undefined) token.midi = parseMidi(m[0])!;
    return token;
  });
}

function hasWord(text: string, phrase: string): boolean {
  return new RegExp(`(?<![\\w-])${phrase}(?![\\w-])`).test(text);
}

/** Whether a sargam label ("Pa", "komal Ga") is named in the text, not a different variant of it. */
function namesSargam(text: string, label: string): boolean {
  if (label.includes(' ')) return hasWord(text, label);
  return new RegExp(`(?<!(komal|tivra) )\\b${label}\\b`).test(text);
}

const INTERVAL_NAMES = new Map<string, number>([
  ['half step', 1],
  ['whole step', 2],
  ...Array.from({ length: 12 }, (_, i) => [intervalInfo(i + 1).name, i + 1] as [string, number]),
]);

function intervalNamesIn(text: string): number[] {
  return [...INTERVAL_NAMES].filter(([name]) => hasWord(text, name)).map(([, n]) => n);
}

/** Every name that correctly answers "what is this?" for the keys shown. */
function isRightName(choice: string, shown: number[], prompt: string): boolean {
  if (shown.length === 2) {
    const n = Math.abs(shown[1]! - shown[0]!);
    return INTERVAL_NAMES.get(choice) === n || intervalInfo(n).short === choice;
  }
  if (shown.length !== 1) return false;
  const midi = shown[0]!;
  const sa = SA_IS.exec(prompt);
  if (sa) return choice === sargam(pitchClass(midi), spelledPc(parseNote(sa[1]!)!.note)).label;
  const parsed = parseNote(choice);
  if (!parsed || spelledPc(parsed.note) !== pitchClass(midi)) return false;
  return parsed.octave === undefined || parseMidi(choice) === midi;
}

export function checkItem(item: TestItem): string[] {
  const problems: string[] = [];
  const onKeyboard = (midi: number, what: string) => {
    if (midi < LOWEST || midi > HIGHEST) problems.push(`${what} ${midi} is off an 88-key keyboard`);
  };

  switch (item.kind) {
    case 'find-note': {
      if ((item.pc === undefined) === (item.midi === undefined)) {
        problems.push('needs exactly one of pc or midi');
        break;
      }
      const target = item.pc ?? pitchClass(item.midi!);
      if (item.midi !== undefined) onKeyboard(item.midi, 'midi');
      const sa = SA_IS.exec(item.prompt);
      if (sa) {
        const label = sargam(target, spelledPc(parseNote(sa[1]!)!.note)).label;
        if (!namesSargam(item.prompt.replace(SA_IS, ''), label)) problems.push(`prompt should name ${label}`);
        break;
      }
      const first = noteTokens(item.prompt)[0];
      if (!first) problems.push('prompt names no note');
      else if (item.midi !== undefined && first.midi !== item.midi) problems.push(`prompt names ${first.text}, but midi is ${item.midi}`);
      else if (first.pc !== target) problems.push(`prompt names ${first.text}, but pc is ${target}`);
      break;
    }
    case 'play-interval': {
      const size = Math.abs(item.semitones);
      const named = intervalNamesIn(item.prompt);
      if (named.length === 0) problems.push('prompt names no interval');
      if (named.some((n) => n !== size)) problems.push(`prompt names a different interval than ${intervalInfo(size).name}`);
      if (!hasWord(item.prompt, item.semitones > 0 ? 'up' : 'down')) problems.push(`prompt should say ${item.semitones > 0 ? 'up' : 'down'}`);
      if (item.startMidi !== null) {
        onKeyboard(item.startMidi, 'start');
        onKeyboard(item.startMidi + item.semitones, 'target');
        const first = noteTokens(item.prompt)[0];
        if (first?.midi !== item.startMidi) problems.push(`prompt should start on midi ${item.startMidi}, names ${first?.text}`);
      }
      break;
    }
    case 'play-scale': {
      const first = noteTokens(item.prompt)[0];
      if (first?.pc !== item.sequence[0]) problems.push(`prompt should start on pc ${item.sequence[0]}`);
      const step = hasWord(item.prompt, 'half step') ? 1 : hasWord(item.prompt, 'whole step') ? 2 : null;
      if (step === null) problems.push('no check for this kind of scale yet; add one to check-items.ts');
      else
        item.sequence.slice(1).forEach((pc, i) => {
          if (mod12(pc - item.sequence[i]!) !== step) problems.push(`sequence[${i + 1}] is not ${step} half step(s) above the one before`);
        });
      break;
    }
    case 'name-it': {
      item.shownMidi.forEach((m) => onKeyboard(m, 'shown key'));
      if (!item.choices.includes(item.answer)) problems.push(`answer ${item.answer} is not one of the choices`);
      if (new Set(item.choices).size !== item.choices.length) problems.push('choices repeat');
      for (const choice of item.choices) {
        const right = isRightName(choice, item.shownMidi, item.prompt);
        if (choice === item.answer && !right) problems.push(`answer ${choice} is wrong for the keys shown`);
        if (choice !== item.answer && right) problems.push(`choice ${choice} is also right, so the question is ambiguous`);
      }
      break;
    }
    case 'build-chord':
      problems.push('no check for build-chord yet; add one to check-items.ts');
      break;
  }
  return problems;
}
