import type { Lesson, Progress, SkillScore, TestItem, Unit } from '@music/contracts';
import { skillFor } from '@music/skills';

/** About this many items per review session. */
export const REVIEW_SIZE = 10;

export interface ReviewCandidate {
  item: TestItem;
  skill: string;
  /** Quiz and checkpoint items come before play-along ones, which were taught with hints. */
  fromQuiz: boolean;
}

/** Lessons and units the learner has reached, so review never uses a term before it is taught. */
export function reachedContent(progress: Progress): { lessonIds: string[]; unitIds: string[] } {
  const lessonIds: string[] = [];
  const unitIds: string[] = [];
  for (const unit of progress.units) {
    if (unit.checkpointPassed) unitIds.push(unit.unitId);
    for (const l of unit.lessons) if (l.status === 'done' || l.status === 'in-progress') lessonIds.push(l.lessonId);
  }
  return { lessonIds, unitIds };
}

/** Every item in the given lessons and checkpoints, tagged with its skill, without repeats. */
export function candidates(lessons: readonly Lesson[], units: readonly Unit[]): ReviewCandidate[] {
  const seen = new Set<string>();
  const out: ReviewCandidate[] = [];
  const add = (item: TestItem, fromQuiz: boolean) => {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    out.push({ item, skill: skillFor(item), fromQuiz });
  };
  for (const lesson of lessons) {
    for (const step of lesson.steps) {
      if (step.type === 'quiz') step.items.forEach((i) => add(i, true));
      if (step.type === 'play-along') step.items.forEach((i) => add(i, false));
    }
  }
  for (const unit of units) unit.checkpoint.items.forEach((i) => add(i, true));
  return out;
}

/**
 * Picks review items for the due skills. Pure.
 * Weakest skill first (lowest first-try accuracy, then longest overdue), one
 * item per skill per round so a short session still touches every weak spot,
 * quiz items before play-along ones, up to `limit` items.
 */
export function pickReviewItems(queue: readonly SkillScore[], pool: readonly ReviewCandidate[], limit = REVIEW_SIZE): TestItem[] {
  const weakest = [...queue].sort(
    (a, b) =>
      a.firstTryAccuracy - b.firstTryAccuracy ||
      (a.dueAt ? Date.parse(a.dueAt) : 0) - (b.dueAt ? Date.parse(b.dueAt) : 0) ||
      a.skill.localeCompare(b.skill),
  );
  const bySkill = new Map<string, TestItem[]>();
  for (const s of weakest) bySkill.set(s.skill, []);
  const ordered = [...pool.filter((c) => c.fromQuiz), ...pool.filter((c) => !c.fromQuiz)];
  for (const c of ordered) bySkill.get(c.skill)?.push(c.item);

  const picked: TestItem[] = [];
  for (let round = 0; picked.length < limit; round++) {
    let any = false;
    for (const items of bySkill.values()) {
      const item = items[round];
      if (!item) continue;
      any = true;
      picked.push(item);
      if (picked.length === limit) break;
    }
    if (!any) break;
  }
  return picked;
}
