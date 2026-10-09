import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BandTalkSchema, type BandTalkTerm } from '@music/contracts';
import { chordFromNumeral, parseKey } from '@music/theory';
import { ContentError, DEFAULT_CONTENT_DIR } from './content.js';

/**
 * Read and check content/bandtalk.json. Every link must name a real glossary
 * term, a phrase the glossary already teaches must link to it rather than
 * define it again, and every example chord must be one the app can spell.
 */
export function loadBandTalk(glossaryIds: ReadonlySet<string>, dir: string = DEFAULT_CONTENT_DIR): BandTalkTerm[] {
  const file = join(dir, 'bandtalk.json');
  if (!existsSync(file)) return [];
  const problems: string[] = [];
  const result = BandTalkSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
  if (!result.success) {
    throw new ContentError(result.error.issues.map((i) => `bandtalk.json: ${i.path.join('.') || '(root)'}: ${i.message}`));
  }
  const ids = new Set<string>();
  for (const term of result.data) {
    const where = `band talk "${term.phrase}"`;
    if (ids.has(term.id)) problems.push(`${where}: id ${term.id} appears twice`);
    ids.add(term.id);
    if (glossaryIds.has(term.id) && term.glossaryId !== term.id) problems.push(`${where}: the glossary already teaches "${term.id}"; link to it with glossaryId instead of defining it again`);
    for (const id of [term.glossaryId, ...term.related]) {
      if (id !== undefined && !glossaryIds.has(id)) problems.push(`${where}: links to glossary term ${id}, which doesn't exist`);
    }
    const exampleKey = parseKey(term.example.key);
    if (!exampleKey) problems.push(`${where}: example key ${term.example.key} isn't a key`);
    for (const step of term.example.steps) {
      if (!('numeral' in step)) continue;
      const key = parseKey(step.key ?? term.example.key);
      if (!key) problems.push(`${where}: step key ${step.key} isn't a key`);
      else if (!chordFromNumeral(step.numeral, key)) problems.push(`${where}: ${step.numeral} isn't a chord number`);
    }
    if (term.jam) {
      const key = parseKey(term.jam.key);
      if (!key) problems.push(`${where}: jam key ${term.jam.key} isn't a key`);
      else for (const n of term.jam.numerals) if (!chordFromNumeral(n, key)) problems.push(`${where}: jam numeral ${n} isn't a chord number`);
    }
  }
  if (problems.length > 0) throw new ContentError(problems);
  return result.data;
}
