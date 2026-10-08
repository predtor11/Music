import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { GlossarySchema, TechniqueSessionSchema, type GlossaryTerm, type HandPosition, type TechniqueBeat, type TechniqueSession } from '@music/contracts';
import { ContentError, DEFAULT_CONTENT_DIR } from './content.js';

export interface Technique {
  /** Sorted by `order`. */
  sessions: TechniqueSession[];
  sessionsById: Map<string, TechniqueSession>;
  /** Terms the technique sessions teach, in session order. */
  glossary: GlossaryTerm[];
}

/**
 * Walk the beats with the hands, and report every note whose finger isn't
 * resting on that key at that moment. Content and the animation agree only
 * if this comes back empty.
 */
export function fingeringProblems(hands: HandPosition[], beats: TechniqueBeat[]): string[] {
  const at = new Map(hands.map((h) => [h.hand, h.keys]));
  const problems: string[] = [];
  beats.forEach((beat, i) => {
    for (const m of beat.move ?? []) at.set(m.hand, m.keys);
    for (const n of beat.notes) {
      const keys = at.get(n.hand);
      if (!keys) problems.push(`beat ${i + 1}: the ${n.hand} hand isn't on the keyboard`);
      else if (keys[n.finger - 1] !== n.midi) problems.push(`beat ${i + 1}: ${n.hand} finger ${n.finger} rests on ${keys[n.finger - 1]}, not ${n.midi}`);
    }
  });
  return problems;
}

/** Right hand keys go up from the thumb, left hand keys go down from the thumb. */
function shapeProblem(h: HandPosition): string | null {
  const rising = h.keys.every((k, i) => i === 0 || k > h.keys[i - 1]!);
  const falling = h.keys.every((k, i) => i === 0 || k < h.keys[i - 1]!);
  if (h.hand === 'right' && !rising) return `right hand keys must rise from the thumb: ${h.keys.join(' ')}`;
  if (h.hand === 'left' && !falling) return `left hand keys must fall from the thumb: ${h.keys.join(' ')}`;
  return null;
}

/** Read and check content/technique: sessions/*.json and glossary.json. */
export function loadTechnique(dir: string = DEFAULT_CONTENT_DIR): Technique {
  const root = join(dir, 'technique');
  const problems: string[] = [];
  const sessions: TechniqueSession[] = [];
  const sessionDir = join(root, 'sessions');
  const files = existsSync(sessionDir) ? readdirSync(sessionDir).filter((f) => f.endsWith('.json')).sort() : [];
  for (const file of files) {
    const result = TechniqueSessionSchema.safeParse(JSON.parse(readFileSync(join(sessionDir, file), 'utf8')));
    if (!result.success) {
      for (const issue of result.error.issues) problems.push(`technique/${file}: ${issue.path.join('.') || '(root)'}: ${issue.message}`);
      continue;
    }
    sessions.push(result.data);
  }
  sessions.sort((a, b) => a.order - b.order);

  const sessionsById = new Map<string, TechniqueSession>();
  sessions.forEach((session, i) => {
    if (sessionsById.has(session.id)) problems.push(`technique session ${session.id} appears twice`);
    sessionsById.set(session.id, session);
    if (session.order !== i + 1) problems.push(`technique session ${session.id} has order ${session.order}, expected ${i + 1}`);
    session.steps.forEach((step, s) => {
      const where = `technique session ${session.id} step ${s + 1}`;
      const all = [...step.hands, ...(step.type === 'drill' ? step.beats : (step.demo ?? [])).flatMap((b) => b.move ?? [])];
      for (const h of all) {
        const p = shapeProblem(h);
        if (p) problems.push(`${where}: ${p}`);
      }
      const beats = step.type === 'drill' ? step.beats : (step.demo ?? []);
      for (const p of fingeringProblems(step.hands, beats)) problems.push(`${where}: ${p}`);
    });
  });

  const glossaryFile = join(root, 'glossary.json');
  let glossary: GlossaryTerm[] = [];
  if (existsSync(glossaryFile)) {
    const result = GlossarySchema.safeParse(JSON.parse(readFileSync(glossaryFile, 'utf8')));
    if (result.success) glossary = result.data;
    else for (const issue of result.error.issues) problems.push(`technique/glossary.json: ${issue.path.join('.')}: ${issue.message}`);
  }
  const rank = new Map(sessions.map((s, i) => [s.id, i]));
  for (const term of glossary) {
    if (!rank.has(term.lessonId)) problems.push(`technique term ${term.id} names session ${term.lessonId}, which doesn't exist`);
  }
  glossary = glossary
    .map((term, i) => ({ term, i }))
    .sort((a, b) => (rank.get(a.term.lessonId) ?? 0) - (rank.get(b.term.lessonId) ?? 0) || a.i - b.i)
    .map(({ term }) => term);

  if (problems.length > 0) throw new ContentError(problems);
  return { sessions, sessionsById, glossary };
}
