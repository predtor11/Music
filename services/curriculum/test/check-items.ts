import type { TestItem } from '@music/contracts';
import {
  type Key,
  MIDDLE_C,
  intervalInfo,
  CHORD_TYPES,
  chordFromNumeral,
  diatonicTriadQualities,
  isBlackKey,
  keyName,
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

/** Half steps above the root for each chord kind a lesson can name. */
const CHORD_SHAPES: Record<string, number[]> = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  diminished: [0, 3, 6],
  augmented: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
};
/** Other ways charts write a chord suffix, mapped to the suffix @music/theory uses. */
const SUFFIX_ALIASES: Record<string, string> = { '°': 'dim', '+': 'aug', ø: 'm7b5', 'm7♭5': 'm7b5', '°7': 'dim7' };
const SYMBOL = new RegExp(`^(${NOTE})([^/]*)(?:/(${NOTE}))?$`);
const TRIAD_NAMED = new RegExp(`\\b(${NOTE}) (major|minor|diminished|augmented) triad\\b`);
const WRITTEN = new RegExp(`\\b(?:written|says) (${NOTE}[^\\s.,]*)(?=[.,]|$)`);

/** Pitch classes of a chord symbol like "Cm", "Bdim" or "Dsus4", root first. */
function symbolPcs(symbol: string): number[] | undefined {
  const m = SYMBOL.exec(symbol);
  const type = m && CHORD_TYPES.find((t) => t.suffix === (SUFFIX_ALIASES[m[2]!] ?? m[2]));
  if (!type) return undefined;
  const root = spelledPc(parseNote(m[1]!)!.note);
  return type.intervals.map((s) => mod12(root + s));
}
/** The bass note a slash chord names ("C/E" → 4), or undefined. */
function symbolBass(symbol: string): number | undefined {
  const bass = SYMBOL.exec(symbol)?.[3];
  return bass === undefined ? undefined : spelledPc(parseNote(bass)!.note);
}
const samePcs = (a: number[], b: number[]) => new Set(a).size === new Set(b).size && a.every((pc) => b.includes(pc));

/** Pitch classes of a numeral's chord in a key, root first. */
function numeralPcs(numeral: string, key: string): number[] {
  const chord = chordFromNumeral(numeral, keyOf(key));
  if (!chord) throw new Error(`not a numeral: ${numeral}`);
  return chord.pitchClasses;
}
const NUMERAL_CHORD = new RegExp(`^In (${NOTE} major), play the (\\S+) chord\\.`);

const INVERSIONS = ['root position', 'first inversion', 'second inversion', 'third inversion'];
const INVERSION = /\bin (root position|first inversion|second inversion|third inversion)\b/;
const LOWEST_NAMED = new RegExp(`\\bwith (${NOTE}) lowest\\b`);

/** A chord in any voicing: its root and its chord type, or undefined. */
function identify(shown: number[]): { root: number; intervals: readonly number[] } | undefined {
  const pcs = [...new Set(shown.map(pitchClass))];
  for (const type of CHORD_TYPES) {
    const root = pcs.find((r) => type.intervals.length === pcs.length && samePcs(type.intervals.map(mod12), pcs.map((p) => mod12(p - r))));
    if (root !== undefined) return { root, intervals: type.intervals };
  }
  return undefined;
}

/** The kind of a root-position chord: "major", "minor", ... or undefined. */
function chordKind(shown: number[]): string | undefined {
  const low = Math.min(...shown);
  const shape = [...new Set(shown.map((k) => mod12(k - low)))].sort((a, b) => a - b).join();
  return Object.keys(CHORD_SHAPES).find((kind) => CHORD_SHAPES[kind]!.join() === shape);
}

/** Note lengths in beats (quarter-note beats). */
const NOTE_BEATS: Record<string, number> = { whole: 4, half: 2, quarter: 1, eighth: 0.5, 'dotted half': 3, 'dotted quarter': 1.5 };
/** Letters on the staff, from the bottom line up: line, space, line ... */
const STAFF_LETTERS: Record<string, string[]> = { treble: ['E', 'F', 'G', 'A', 'B', 'C', 'D', 'E', 'F'], bass: ['G', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'A'] };
/** Lowest and highest MIDI note a clef is drawn for, ledger lines included. */
const CLEF_RANGE: Record<string, [number, number]> = { treble: [55, 88], bass: [33, 67] };
const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

/** Answers to questions about rhythm and the staff (Unit 8). undefined means the prompt is not one of these. */
function isRightReadingAnswer(choice: string, prompt: string): boolean | undefined {
  let m: RegExpExecArray | null;
  if ((m = /^How many beats are in a bar of (\d+)\/(\d+)\?$/.exec(prompt))) return choice === m[1];
  if ((m = /^How many (\w+) notes last as long as one ((?:dotted )?\w+) note\?$/.exec(prompt))) {
    const [small, big] = [NOTE_BEATS[m[1]!], NOTE_BEATS[m[2]!]];
    if (small === undefined || big === undefined) throw new Error(`unknown note length in: ${prompt}`);
    return Number(choice) === big / small;
  }
  if ((m = /^Which is faster: (\d+) BPM or (\d+) BPM\?$/.exec(prompt))) return choice === `${Math.max(Number(m[1]), Number(m[2]))} BPM`;
  if ((m = /^On the (treble|bass) clef, which note sits on the (\d)(?:st|nd|rd|th) (line|space) from the bottom\?$/.exec(prompt))) {
    const n = Number(m[2]);
    return choice === STAFF_LETTERS[m[1]!]![m[3] === 'line' ? (n - 1) * 2 : (n - 1) * 2 + 1];
  }
  return undefined;
}

/** Answers to questions about chords (Unit 4 on). undefined means the prompt is not one of these. */
function isRightChordAnswer(choice: string, shown: number[], prompt: string): boolean | undefined {
  const sorted = [...shown].sort((a, b) => a - b);
  const notePc = () => {
    const parsed = parseNote(choice);
    return parsed ? spelledPc(parsed.note) : undefined;
  };
  if (prompt === 'How many notes are in this chord?') return Number(choice) === new Set(shown).size;
  if (prompt === 'Which inversion is this chord?' || prompt === 'Is this chord in root position?') {
    const chord = identify(shown);
    if (!chord) return false;
    const inversion = INVERSIONS[chord.intervals.map(mod12).indexOf(mod12(pitchClass(sorted[0]!) - chord.root))];
    if (prompt === 'Which inversion is this chord?') return choice === inversion;
    return (choice === 'yes' || choice === 'no') && (inversion === 'root position') === (choice === 'yes');
  }
  if (prompt === 'What is the bass note of this chord?') {
    const parsed = parseNote(choice);
    return !!parsed && spelledPc(parsed.note) === pitchClass(sorted[0]!);
  }
  if (prompt === 'Which chord is this?') {
    const pcs = symbolPcs(choice);
    return !!pcs && samePcs(pcs, shown.map(pitchClass));
  }
  const share = new RegExp(`^Which note do (\\S+) and (\\S+) share\\?$`).exec(prompt);
  if (share) {
    const parsed = parseNote(choice);
    const [a, b] = [symbolPcs(share[1]!), symbolPcs(share[2]!)];
    return !!parsed && !!a && !!b && a.includes(spelledPc(parsed.note)) && b.includes(spelledPc(parsed.note));
  }
  if (prompt === 'Is this chord a triad?') {
    if (choice !== 'yes' && choice !== 'no') return false;
    const gaps = sorted.slice(1).map((k, i) => k - sorted[i]!);
    return (sorted.length === 3 && gaps.every((g) => g === 3 || g === 4)) === (choice === 'yes');
  }
  if (/(?:What kind of triad is (?:this|it)|Is (?:this chord|it) major or minor)\?$/.test(prompt)) return choice === chordKind(shown);
  if (/Which chord symbol is (?:this|it)\?$/.test(prompt)) {
    const pcs = symbolPcs(choice);
    return !!pcs && pcs[0] === pitchClass(sorted[0]!) && samePcs(pcs, shown.map(pitchClass));
  }
  if (prompt === 'What is the root of this chord?') return chordKind(shown) !== undefined && notePc() === pitchClass(sorted[0]!);
  let m: RegExpExecArray | null;
  if ((m = new RegExp(`^Is this chord diatonic to (${NOTE} major)\\?$`).exec(prompt))) {
    if (choice !== 'yes' && choice !== 'no') return false;
    const pcs = scalePcs(keyOf(m[1]!));
    return shown.every((k) => pcs.includes(pitchClass(k))) === (choice === 'yes');
  }
  if ((m = new RegExp(`^In (${NOTE} major), what kind of triad is built on scale degree (\\d)\\?$`).exec(prompt))) {
    const quality = diatonicTriadQualities('major')[Number(m[2]) - 1];
    return choice === (quality === 'dim' ? 'diminished' : quality);
  }
  if ((m = new RegExp(`^In (${NOTE} major), which (?:Roman numeral|number) is this chord\\?$`).exec(prompt))) {
    const named = chordFromNumeral(choice, keyOf(m[1]!));
    return !!named && spelledPc(named.root) === pitchClass(sorted[0]!) && samePcs(named.pitchClasses, shown.map(pitchClass));
  }
  if ((m = new RegExp(`^In (${NOTE} major), which chord is the (\\S+)\\?$`).exec(prompt))) {
    const want = numeralPcs(m[2]!, m[1]!);
    const pcs = symbolPcs(choice);
    return !!pcs && pcs[0] === want[0] && samePcs(pcs, want);
  }
  const tone = /^Which note is the (3rd|5th) of this chord\?$/.exec(prompt);
  if (tone) return sorted.length === 3 && chordKind(shown) !== undefined && notePc() === pitchClass(sorted[tone[1] === '3rd' ? 1 : 2]!);
  return undefined;
}

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

/** Physical guitar concepts have verbal answers rather than pitch names. */
const GUITAR_FACTS: Record<string, string> = {
  "Which guitar part is long and narrow?": "neck",
  "Which guitar part is at the top of the neck?": "headstock",
  "Which guitar part anchors the lower ends of the wires?": "bridge",
  "Which guitar part is a small turning control?": "tuning peg",
  "Which opening helps you hear an acoustic guitar?": "sound hole",
  "Which device senses the moving wires on an electric guitar?": "pickup",

  "Which guitar part is the large main section?": "body",
  "Which letter names the lit thickest string?": "E",
  "What should support the guitar while you sit?": "your thigh and a gentle supporting arm",
  "Which hand starts the string vibrating near the body?": "picking hand",
  "How should you hold a guitar pick?": "gently, with a small tip showing",
  "What makes a string an open string?": "no finger presses it",
  "For otherwise similar strings, what happens when a string gets tighter?": "the sound gets higher",
  "What is the goal when tuning a guitar string?": "match its reference sound",
  "Where do you press to play the first fret clearly?": "just behind the first metal bar",
  "In guitar tab, what does 0 mean?": "play the open string"
};

/** Every name that correctly answers "what is this?" for the keys shown. */
function isRightName(choice: string, shown: number[], prompt: string): boolean {
  const guitarFact = GUITAR_FACTS[prompt];
  if (guitarFact !== undefined) return choice === guitarFact;
  const readingAnswer = isRightReadingAnswer(choice, prompt);
  if (readingAnswer !== undefined) return readingAnswer;
  const chordAnswer = isRightChordAnswer(choice, shown, prompt);
  if (chordAnswer !== undefined) return chordAnswer;
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
  const showKeys = 'showKeys' in item && item.showKeys === true;
  const lit = (mode === 'play-along' || showKeys) && /\blit\b/.test(item.prompt);
  const problems: string[] = [];
  // Review asks play-along items without hints, so a prompt that points at lit keys must light them itself.
  if (item.kind !== 'name-it' && /\blit\b/.test(item.prompt) && !showKeys) problems.push('prompt points at lit keys, so set showKeys: true');
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
    case 'tap-rhythm': {
      // Onsets in order, each note over before the next starts, and "N taps" in the prompt matching.
      const { onsets, durations } = item;
      if (onsets.some((o, i) => i > 0 && o <= onsets[i - 1]!)) problems.push('onsets are not in order');
      if (durations) {
        if (durations.length !== onsets.length) problems.push('durations and onsets differ in length');
        onsets.forEach((o, i) => {
          const next = onsets[i + 1];
          if (next !== undefined && o + durations[i]! > next + 1e-9) problems.push(`note ${i + 1} overlaps the next one`);
        });
      }
      const taps = /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve) taps?\b/.exec(item.prompt);
      if (!taps) problems.push('prompt should say how many taps');
      else {
        const n = /^\d+$/.test(taps[1]!) ? Number(taps[1]) : NUMBER_WORDS.indexOf(taps[1]!);
        if (n !== onsets.length) problems.push(`prompt says ${taps[1]} taps, but there are ${onsets.length} onsets`);
      }
      const sig = /\b(\d+)\/(\d+)\b/.exec(item.prompt);
      if (sig && item.timeSignature.join('/') !== `${sig[1]}/${sig[2]}`) problems.push(`prompt says ${sig[0]}, but the time signature is ${item.timeSignature.join('/')}`);
      const bpm = /\b(\d+) BPM\b/.exec(item.prompt);
      if (bpm && Number(bpm[1]) !== item.bpm) problems.push(`prompt says ${bpm[0]}, but bpm is ${item.bpm}`);
      break;
    }
    case 'read-staff': {
      const [low, high] = CLEF_RANGE[item.clef]!;
      for (const m of item.midi) if (m < low || m > high) problems.push(`midi ${m} is too far off the ${item.clef} staff`);
      if (item.key && !parseKey(item.key)) problems.push(`key ${item.key} does not parse`);
      if (noteTokens(item.prompt).length) problems.push('prompt should not name the notes; the staff shows them');
      if (/\bchord\b/.test(item.prompt) !== item.midi.length > 1) problems.push('prompt should say "chord" exactly when more than one note is drawn');
      break;
    }
    case 'play-progression': {
      // "Play I–V–vi–IV in G.": the numerals and the key in the prompt must match the item.
      const key = parseKey(item.key);
      if (!key) problems.push(`key ${item.key} does not parse`);
      const bad = key ? item.numerals.filter((n) => !chordFromNumeral(n, key)) : [];
      if (bad.length) problems.push(`numerals ${bad.join(' ')} do not parse`);
      if (item.byEar) break;
      const inKey = new RegExp(`\\bin (${NOTE}(?:m| minor| major)?)(?=[.,:;]|$)`).exec(item.prompt);
      if (!inKey) problems.push('prompt names no key');
      else if (key && keyName(keyOf(inKey[1]!)) !== keyName(key)) problems.push(`prompt says ${inKey[1]}, but key is ${item.key}`);
      if (!item.prompt.includes(item.numerals.join('–'))) problems.push(`prompt should spell out ${item.numerals.join('–')}`);
      break;
    }
    case 'build-chord': {
      // "Play a C major triad", "Play the chord written Cm", or the notes spelled out.
      const triad = TRIAD_NAMED.exec(item.prompt);
      const written = WRITTEN.exec(item.prompt);
      const numeral = NUMERAL_CHORD.exec(item.prompt);
      const want = numeral
        ? numeralPcs(numeral[2]!, numeral[1]!)
        : triad
        ? CHORD_SHAPES[triad[2]!]!.map((s) => mod12(spelledPc(parseNote(triad[1]!)!.note) + s))
        : written
          ? symbolPcs(written[1]!)
          : noteTokens(item.prompt).map((t) => t.pc);
      if (!want || want.length === 0) problems.push('prompt names no chord');
      else if (!samePcs(want, item.pitchClasses)) problems.push(`prompt asks for pcs ${[...new Set(want)].join(' ')}, not ${item.pitchClasses.join(' ')}`);
      if (item.bassPc !== null && !item.pitchClasses.includes(item.bassPc)) problems.push('bassPc is not in the chord');
      // The lowest note: "in first inversion", "C/E", "with E lowest", or any when the prompt says nothing.
      const inversion = INVERSION.exec(item.prompt);
      const lowest = LOWEST_NAMED.exec(item.prompt);
      const bass = inversion && want
        ? want[INVERSIONS.indexOf(inversion[1]!)]
        : lowest
          ? spelledPc(parseNote(lowest[1]!)!.note)
          : written && !triad && !numeral
            ? symbolBass(written[1]!)
            : undefined;
      if ((bass ?? null) !== item.bassPc) problems.push(`bassPc should be ${bass ?? null}`);
      break;
    }
  }
  return problems;
}
