import { expect, test, type Page } from '@playwright/test';
import type { TestItem } from '@music/contracts';
import { midiToPositions, pretty, STANDARD_TUNING } from '@music/theory';
import { buildApp } from '../../../services/curriculum/src/app.js';
import { loadCurriculum } from '../../../services/curriculum/src/content.js';
import { computeProgress, NO_COMPLETIONS } from '../../../services/progress/src/unlocks.js';
import { fakeApi, nextItemSessionId } from './fake-api.js';

const curriculum = loadCurriculum();
const unit = curriculum.unitsById.get('guitar-2')!;
const app = buildApp({ logger: false });
const USER = '00000000-0000-4000-8000-000000000001';

async function course(page: Page, prerequisitesPassed = true) {
  const api = await fakeApi(page, { signedIn: true });
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api/, '');
    if (path.startsWith('/curriculum/')) {
      const response = await app.inject({ url: path.replace('/curriculum', '') + url.search });
      return route.fulfill({ status: response.statusCode, contentType: 'application/json', body: response.body });
    }
    if (path === '/progress/') return route.fulfill({ json: computeProgress(USER, curriculum.units, {
      ...NO_COMPLETIONS, checkpointsPassed: new Set(prerequisitesPassed ? ['guitar-intro', 'guitar-1'] : curriculum.units.filter((u) => (u.instrument ?? 'piano') === 'piano').map((u) => u.id)),
    }, 'guitar') });
    if (path === '/progress/review-queue') return route.fulfill({ json: [] });
    if (api.sessions.at(-1)?.kind === 'checkpoint' && nextItemSessionId(path)) {
      const answered = new Set(api.attempts.filter((a) => a.correct).map((a) => a.itemId));
      return route.fulfill({ json: unit.checkpoint.items.find((i) => !answered.has(i.id)) ?? null });
    }
    if (/^\/practice\/sessions\/[^/]+\/end$/.test(path)) {
      const count = api.attempts.filter((a) => a.correct).length;
      const session = api.sessions.at(-1)!;
      const now = new Date().toISOString();
      return route.fulfill({ json: { session: { ...session, userId: USER, startedAt: now, endedAt: now },
        summary: { total: count, answered: count, firstTryCorrect: count, accuracy: 100, passed: true } } });
    }
    return route.fallback();
  });
  await page.goto('/');
  await page.getByTestId('instrument-header').selectOption('guitar');
  return api;
}

async function pluck(page: Page, midi: number) {
  const pos = midiToPositions(STANDARD_TUNING, midi, 12).at(-1)!;
  await page.getByTestId(`fret-${pos.string}-${pos.fret}`).click();
}

async function answer(page: Page, item: TestItem) {
  await expect(page.getByTestId('prompt')).toHaveText(pretty(item.prompt));
  if (item.kind === 'name-it') await page.getByRole('button', { name: pretty(item.answer), exact: true }).click();
  else if (item.kind === 'find-note') await pluck(page, item.midi!);
  else if (item.kind === 'play-interval') {
    await pluck(page, item.startMidi!);
    await pluck(page, item.startMidi! + item.semitones);
  } else throw new Error('Unexpected notes-unit item kind');
}

for (const id of unit.lessonIds) {
  test(`teaches and grades ${id} on the fretboard`, async ({ page }) => {
    const api = await course(page);
    const lesson = curriculum.lessonsById.get(id)!;
    await page.goto(`/#/lesson/${id}`);
    await expect(page.getByTestId('lesson-title')).toHaveText(lesson.title);
    for (const step of lesson.steps) {
      await expect(page.getByTestId('step-title')).toHaveText(pretty(step.title));
      if (step.type === 'play-along' || step.type === 'quiz') {
        for (const item of step.items) await answer(page, item);
        await expect(page.getByTestId('step-complete')).toBeVisible();
      } else await expect(page.getByTestId('fretboard')).toBeVisible();
      if (step.type !== 'quiz') await page.getByTestId('next').click();
    }
    await page.getByTestId('finish').click();
    await expect(page.getByTestId('summary')).toBeVisible();
    expect(api.attempts.length).toBeGreaterThanOrEqual(3);
    expect(api.attempts.every((a) => a.correct && a.instrument === 'guitar' && String(a.skill).startsWith('g:'))).toBe(true);
    if (id === 'g2-l1') expect(api.attempts[0]).toMatchObject({ played: [45], skill: 'g:note:A' });
  });
}

test('the notes checkpoint requires the preceding guitar unit and grades its real questions', async ({ page }) => {
  test.setTimeout(60_000);
  const api = await course(page);
  await page.getByTestId('nav-lessons').click();
  await expect(page.getByTestId('unit-guitar-2')).toHaveAttribute('data-unlocked', 'true');
  await expect(page.getByTestId('unit-guitar-2')).toContainText('Unit 3');
  await page.getByTestId('checkpoint-guitar-2').click();
  for (const item of unit.checkpoint.items) await answer(page, item);
  await expect(page.getByTestId('summary')).toBeVisible();
  expect(api.attempts).toHaveLength(10);
  expect(api.attempts.every((a) => a.correct && a.instrument === 'guitar' && String(a.skill).startsWith('g:'))).toBe(true);
});

test('piano progress cannot open the new guitar notes unit', async ({ page }) => {
  await course(page, false);
  await page.getByTestId('nav-lessons').click();
  await expect(page.getByTestId('unit-guitar-2')).toHaveAttribute('data-unlocked', 'false');
  await expect(page.getByTestId('unit-locked-guitar-2')).toContainText('Pass the Unit 2 test');
  await expect(page.getByTestId('checkpoint-guitar-2')).toBeDisabled();
});

test('an alternate position counts but the same letter in the wrong octave does not', async ({ page }) => {
  const api = await course(page);
  await page.goto('/#/lesson/g2-l6');
  await page.getByTestId('next').click();
  await page.getByTestId('next').click();
  await expect(page.getByTestId('prompt')).toHaveText('Play A3. Use any lit position.');
  await page.getByTestId('fret-5-0').click(); // A2, one octave too low.
  await expect(page.getByTestId('item-message')).toBeVisible();
  await expect.poll(() => api.attempts.length).toBe(1);
  expect(api.attempts[0]).toMatchObject({ played: [45], correct: false });
  await page.getByTestId('fret-3-2').click(); // A3, away from string 5's twelfth fret.
  await expect(page.getByTestId('step-complete')).toBeVisible();
  await expect.poll(() => api.attempts.length).toBe(2);
  expect(api.attempts[1]).toMatchObject({ played: [57], correct: true, retried: true, skill: 'g:note:A' });
});
