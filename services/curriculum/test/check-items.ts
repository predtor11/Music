import type { TestItem } from '@music/contracts';
import {
  type Key,
  MIDDLE_C,
  intervalInfo,
  isBlackKey,
  keyScale,
  keySignature,
  mod12,
  parseKey,
  parseMidi,
  parseNote,
  pitchClass,
  sargam,
  scaleOffsets,
  spellInKey,
  spelledPc,
} from '@music/theory';

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
  ['unison', 0],
  ['half step', 1],
  ['whole step', 2],
  ...Array.from({ length: 12 }, (_, i) => [intervalInfo(i + 1).name, i + 1] as [string, number]),
  ['one octave', 12],
  ['two octaves', 24],
]);

/** "go up 3 half steps" names an interval by its count. */
const HALF_STEP_COUNT = /\b(\d+) half steps\b/;

function intervalNamesIn(text: string): number[] {
  const named = [...INTERVAL_NAMES].filter(([name]) => hasWord(text, name)).map(([, n]) => n);
  const count = HALF_STEP_COUNT.exec(text);
  return count ? [...named, Number(count[1])] : named;
}

const NOTE = '[A-G](?:#|b)?';
/** "G major" or "A natural minor" (or "A minor") named in a prompt. */
const KEY_NAMED = new RegExp(`\\b(${NOTE}) (major|natural minor|minor)\\b`);
const DEGREE_PROMPT = new RegExp(`^In (${NOTE} major), play scale degree (\\d)\\.`);

function keyOf(text: string): Key {
  const key = parseKey(text.replace('natural minor', 'minor'));
  if (!key) throw new Error(`not a key: ${text}`);
  return key;
}
const tonicPc = (key: Key) => spelledPc(key.tonic);
const scalePcs = (key: Key) => keyScale(key).map(spelledPc);
const sameNote = (a: { letter: string; accidental: number }, b: { letter: string; accidental: number }) =>
  a.letter === b.letter && a.accidental === b.accidental;

/** Answers to questions about scales and keys (Unit 3 on). undefined means the prompt is not one of these. */
function isRightKeyAnswer(choice: string, shown: number[], prompt: string): boolean | undefined {
  let m: RegExpExecArray | null;
  if ((m = new RegExp(`^How many (sharps|flats) are in the key of (${NOTE} major)\\?$`).exec(prompt))) {
    const sig = keySignature(keyOf(m[2]!));
    return Number(choice) === (m[1] === 'sharps' ? sig : -sig);
  }
  if ((m = /^Which major key has (\d) (sharp|flat)s?\?$/.exec(prompt))) {
    const want = Number(m[1]) * (m[2] === 'sharp' ? 1 : -1);
    return /major$/.test(choice) && keySignature(keyOf(choice)) === want;
  }
  if (prompt === 'What is the tonic of this scale?') {
    const parsed = parseNote(choice);
    return !!parsed && spelledPc(parsed.note) === pitchClass(Math.min(...shown));
  }
  if ((m = new RegExp(`^In (${NOTE} major), which scale degree is this note\\?$`).exec(prompt))) {
    return shown.length === 1 && scalePcs(keyOf(m[1]!)).indexOf(pitchClass(shown[0]!)) + 1 === Number(choice);
  }
  if ((m = new RegExp(`^In (${NOTE} major), what is this note called\\?$`).exec(prompt))) {
    const parsed = parseNote(choice);
    return shown.length === 1 && !!parsed && sameNote(parsed.note, spellInKey(pitchClass(shown[0]!), keyOf(m[1]!)));
  }
  if ((m = new RegExp(`^Is this key in the (${NOTE} (?:major|natural minor)) scale\\?$`).exec(prompt))) {
    if (choice !== 'yes' && choice !== 'no') return false;
    return shown.length === 1 && scalePcs(keyOf(m[1]!)).includes(pitchClass(shown[0]!)) === (choice === 'yes');
  }
  if ((m = new RegExp(`^A song uses the notes ((?:${NOTE} ?)+) and ends on (${NOTE})\\. What key is it in\\?$`).exec(prompt))) {
    const notes = new Set(m[1]!.trim().split(' ').map((n) => spelledPc(parseNote(n)!.note)));
    const key = keyOf(choice);
    const pcs = scalePcs(key);
    return tonicPc(key) === spelledPc(parseNote(m[2]!)!.note) && pcs.length === notes.size && pcs.every((pc) => notes.has(pc));
  }
  if ((m = new RegExp(`circle of fifths in the (sharp|flat) direction, which key comes after (${NOTE} major)\\?$`).exec(prompt))) {
    const key = keyOf(choice);
    return key.mode === 'major' && tonicPc(key) === mod12(tonicPc(keyOf(m[2]!)) + (m[1] === 'sharp' ? 7 : 5));
  }
  if ((m = new RegExp(`^What is the relative (minor|major) of (${NOTE} (?:major|minor))\\?$`).exec(prompt))) {
    const from = keyOf(m[2]!);
    const key = keyOf(choice);
    if (key.mode !== m[1] || from.mode === key.mode) return false;
    return tonicPc(key) === mod12(tonicPc(from) + (key.mode === 'minor' ? -3 : 3));
  }
  if (prompt === 'Is this scale major or natural minor?') {
    const low = Math.min(...shown);
    const offsets = [...new Set(shown.map((k) => mod12(k - low)))].sort((a, b) => a - b);
    const want = scaleOffsets(choice === 'major' ? 'major' : 'naturalMinor');
    return (choice === 'major' || choice === 'natural minor') && offsets.join() === want.join();
  }
  return undefined;
}

/** Plain-word answers for lessons that come before note names. */
function isRightPlainAnswer(choice: string, shown: number[], prompt: string): boolean | undefined {
  const [a, b] = shown;
  if (choice === 'the left one' || choice === 'the right one') {
    if (b === undefined) return false;
    const wantRight = /\bhigher\b/.test(prompt) ? b > a! : /\blower\b/.test(prompt) ? b < a! : undefined;
    return wantRight === undefined ? false : (choice === 'the right one') === wantRight;
  }
  if (choice === 'white key' || choice === 'black key') return shown.length === 1 && isBlackKey(a!) === (choice === 'black key');
  if (choice === 'group of two' || choice === 'group of three') {
    const pc = pitchClass(a!);
    return isBlackKey(a!) && (choice === 'group of two') === (pc === 1 || pc === 3);
  }
  if (choice === 'yes' || choice === 'no') {
    if (!/middle C\?/.test(prompt)) return false;
    return (choice === 'yes') === (shown.length === 1 && a === MIDDLE_C);
  }
  if (/^\d+$/.test(choice)) return b !== undefined && Math.abs(b - a!) === Number(choice);
  return undefined;
}

/** Every name that correctly answers "what is this?" for the keys shown. */
function isRightName(choice: string, shown: number[], prompt: string): boolean {
  const keyAnswer = isRightKeyAnswer(choice, shown, prompt);
  if (keyAnswer !== undefined) return keyAnswer;
  const plain = isRightPlainAnswer(choice, shown, prompt);
  if (plain !== undefined) return plain;
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

/**
 * `mode` is where the item runs: play-along lights the keys, so a play-along
 * prompt may say "Play the lit key" instead of naming it.
 */
export function checkItem(item: TestItem, mode: 'play-along' | 'quiz' = 'quiz'): string[] {
  const lit = mode === 'play-along' && /\blit\b/.test(item.prompt);
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
      const degree = DEGREE_PROMPT.exec(item.prompt);
      if (degree) {
        const want = scalePcs(keyOf(degree[1]!))[Number(degree[2]) - 1];
        if (want !== target) problems.push(`scale degree ${degree[2]} of ${degree[1]} is pc ${want}, not ${target}`);
        break;
      }
      if (lit) {
        if (item.midi === undefined) problems.push('a lit key needs midi');
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
      if (item.semitones !== 0 && !hasWord(item.prompt, item.semitones > 0 ? 'up' : 'down')) problems.push(`prompt should say ${item.semitones > 0 ? 'up' : 'down'}`);
      if (item.startMidi !== null) {
        onKeyboard(item.startMidi, 'start');
        onKeyboard(item.startMidi + item.semitones, 'target');
        const first = noteTokens(item.prompt)[0];
        if (!lit && first?.midi !== item.startMidi) problems.push(`prompt should start on midi ${item.startMidi}, names ${first?.text}`);
      }
      break;
    }
    case 'play-scale': {
      const tokens = noteTokens(item.prompt);
      if (tokens[0]?.pc !== item.sequence[0]) problems.push(`prompt should start on pc ${item.sequence[0]}`);
      if (tokens.length === item.sequence.length) {
        // The prompt spells out every note: they must match the sequence.
        if (tokens.some((t, i) => t.pc !== item.sequence[i])) problems.push('the notes in the prompt do not match the sequence');
        break;
      }
      const named = KEY_NAMED.exec(item.prompt);
      if (named) {
        // "Play the G major scale": the sequence must be that scale, up to its tonic again.
        const key = keyOf(`${named[1]} ${named[2]}`);
        const want = [...scalePcs(key), tonicPc(key)];
        if (want.join() !== item.sequence.join()) problems.push(`the ${named[0]} scale is ${want.join(' ')}, not ${item.sequence.join(' ')}`);
        break;
      }
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
