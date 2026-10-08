import { describe, expect, it } from 'vitest';
import { GlossarySchema, TechniqueListSchema, TechniqueSessionSchema, type TechniqueSession } from '@music/contracts';
import { buildApp } from '../src/app.js';
import { fingeringProblems, loadTechnique } from '../src/technique.js';

const technique = loadTechnique();
const app = buildApp({ logger: false });

function sessionText(s: TechniqueSession): string {
  return [s.title, s.summary, ...s.steps.flatMap((st) => [st.title, st.body])].join('\n');
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const usePattern = (words: string[]) => new RegExp(words.map((w) => `(?<![\\w-])${escape(w)}(?:s|es)?(?![\\w-])`).join('|'), 'i');

describe('technique sessions', () => {
  it('loads every session in order', () => {
    expect(technique.sessions.map((s) => s.order)).toEqual(technique.sessions.map((_, i) => i + 1));
    expect(technique.sessions.length).toBeGreaterThanOrEqual(9);
  });

  for (const session of technique.sessions) {
    it(`${session.id} opens by explaining and has something to play`, () => {
      expect(session.steps[0]!.type).toBe('explain');
      expect(session.steps.some((s) => s.type === 'drill')).toBe(true);
    });

    it(`${session.id} stays on a 25-key keyboard (C3 to C5)`, () => {
      for (const step of session.steps) {
        const beats = step.type === 'drill' ? step.beats : (step.demo ?? []);
        const keys = [...step.hands, ...beats.flatMap((b) => b.move ?? [])].flatMap((h) => h.keys);
        for (const k of [...keys, ...beats.flatMap((b) => b.notes.map((n) => n.midi))]) {
          expect(k).toBeGreaterThanOrEqual(48);
          expect(k).toBeLessThanOrEqual(72);
        }
      }
    });
  }

  it('catches a finger that is not on the key it should play', () => {
    const hands = [{ hand: 'right' as const, keys: [60, 62, 64, 65, 67] }];
    expect(fingeringProblems(hands, [{ notes: [{ midi: 62, hand: 'right', finger: 2 }] }])).toEqual([]);
    expect(fingeringProblems(hands, [{ notes: [{ midi: 64, hand: 'right', finger: 2 }] }])).toHaveLength(1);
    expect(fingeringProblems(hands, [{ notes: [{ midi: 55, hand: 'left', finger: 1 }] }])).toHaveLength(1);
  });
});

describe('technique glossary', () => {
  const order = technique.sessions.map((s) => s.id);
  for (const term of technique.glossary) {
    const at = order.indexOf(term.lessonId);

    it(`"${term.term}" is introduced in bold in ${term.lessonId}`, () => {
      const session = technique.sessionsById.get(term.lessonId)!;
      const bold = new RegExp(`\\*\\*${escape(term.term)}(?:s|es)?\\*\\*`, 'i');
      expect(session.steps.some((s) => s.type === 'explain' && bold.test(s.body))).toBe(true);
    });

    it(`"${term.term}" is not used before ${term.lessonId}`, () => {
      const pattern = usePattern([term.term, ...term.aliases]);
      const early = technique.sessions.slice(0, at).filter((s) => pattern.test(sessionText(s)));
      expect(early.map((s) => s.id)).toEqual([]);
    });
  }
});

describe('technique routes', () => {
  it('lists the sessions without their steps', async () => {
    const res = await app.inject({ url: '/technique' });
    expect(res.statusCode).toBe(200);
    const list = TechniqueListSchema.parse(res.json());
    expect(list[0]).toMatchObject({ id: 'h1', order: 1 });
    expect(res.json()[0]).not.toHaveProperty('steps');
  });

  it('returns one session and its glossary', async () => {
    const res = await app.inject({ url: '/technique/h6' });
    expect(res.statusCode).toBe(200);
    expect(TechniqueSessionSchema.parse(res.json()).title).toBe('Thumb under');
    const terms = GlossarySchema.parse((await app.inject({ url: '/technique/glossary' })).json());
    expect(terms.map((t) => t.id)).toContain('thumb-under');
  });

  it('answers 404 for an unknown session', async () => {
    expect((await app.inject({ url: '/technique/nope' })).statusCode).toBe(404);
  });
});
