import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BandTalkSchema } from '@music/contracts';
import { buildApp } from '../src/app.js';
import { loadBandTalk } from '../src/bandtalk.js';
import { loadCurriculum } from '../src/content.js';

const glossary = loadCurriculum().glossary;
const ids = new Set(glossary.map((t) => t.id));
const terms = loadBandTalk(ids);

function write(json: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'bandtalk-'));
  writeFileSync(join(dir, 'bandtalk.json'), JSON.stringify(json));
  return dir;
}

const base = {
  id: 'vamp',
  phrase: 'vamp',
  category: 'form',
  meaning: 'Repeat a short pattern.',
  whyItMatters: 'Fills time.',
  sayIt: 'Vamp on it.',
  example: { caption: 'C and F', steps: [{ numeral: '1' }, { numeral: '4' }] },
};

describe('band talk', () => {
  it('covers the phrases bands use most, in every category', () => {
    expect(terms.length).toBeGreaterThanOrEqual(30);
    for (const id of ['two-five-one', 'bridge', 'turnaround', 'up-a-tone', 'capo', 'vamp']) expect(terms.map((t) => t.id)).toContain(id);
    expect(new Set(terms.map((t) => t.category))).toEqual(new Set(['chords', 'form', 'key', 'rhythm', 'playing']));
  });

  it('links to the glossary instead of defining a term twice', () => {
    for (const t of terms.filter((t) => t.glossaryId)) {
      expect(ids.has(t.glossaryId!)).toBe(true);
      expect(t.meaning).toBeUndefined();
    }
    for (const t of terms.filter((t) => !t.glossaryId)) expect(ids.has(t.id)).toBe(false);
  });

  it('rejects a phrase the glossary already teaches', () => {
    expect(() => loadBandTalk(ids, write([{ ...base, id: 'two-five-one' }]))).toThrow(/link to it with glossaryId/);
  });

  it('rejects a link to a term that does not exist', () => {
    expect(() => loadBandTalk(ids, write([{ ...base, related: ['not-a-term'] }]))).toThrow(/not-a-term, which doesn't exist/);
  });

  it('rejects an example chord the app cannot spell', () => {
    expect(() => loadBandTalk(ids, write([{ ...base, example: { caption: 'x', steps: [{ numeral: '9' }] } }]))).toThrow(/9 isn't a chord number/);
  });

  it('rejects a definition next to a glossary link', () => {
    expect(() => loadBandTalk(ids, write([{ ...base, id: 'x', glossaryId: 'key' }]))).toThrow(/either glossaryId or both/);
  });

  it('serves the cheat sheet', async () => {
    const app = buildApp({ logger: false });
    const res = await app.inject({ url: '/bandtalk' });
    expect(res.statusCode).toBe(200);
    expect(BandTalkSchema.parse(res.json())).toHaveLength(terms.length);
  });
});
