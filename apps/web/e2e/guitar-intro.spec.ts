import { expect, test } from '@playwright/test';
import { buildApp } from '../../../services/curriculum/src/app.js';
import { loadCurriculum } from '../../../services/curriculum/src/content.js';
import { computeProgress, NO_COMPLETIONS } from '../../../services/progress/src/unlocks.js';
import { fakeApi, nextItemSessionId } from './fake-api.js';
import type { Page } from '@playwright/test';

const curriculum = loadCurriculum();
const intro = curriculum.unitsById.get('guitar-intro')!;
const app = buildApp({ logger: false });
const USER = '00000000-0000-4000-8000-000000000001';

/** Serve the real curriculum; model progress from the completed checkpoint. */
async function guitarCourse(page: Page) {
  const api = await fakeApi(page, { signedIn: true });
  let passed = false;
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api/, '');
    if (path.startsWith('/curriculum/')) {
      const response = await app.inject({ url: path.replace('/curriculum', '') + url.search });
      return route.fulfill({ status: response.statusCode, contentType: 'application/json', body: response.body });
    }
    if (path === '/progress/') return route.fulfill({ json: computeProgress(USER, curriculum.units, { ...NO_COMPLETIONS, checkpointsPassed: new Set(passed ? [intro.id] : []) }, 'guitar') });
    if (path === '/progress/review-queue') return route.fulfill({ json: [] });
    if (api.sessions.at(-1)?.kind === 'checkpoint') {
      if (nextItemSessionId(path)) {
        const answered = new Set(api.attempts.filter((a) => a.correct).map((a) => a.itemId));
        return route.fulfill({ json: intro.checkpoint.items.find((i) => !answered.has(i.id)) ?? null });
      }
      if (/^\/practice\/sessions\/[^/]+\/end$/.test(path)) {
        const correct = api.attempts.filter((a) => a.correct && !a.retried).length;
        const accuracy = correct / intro.checkpoint.items.length * 100;
        passed = accuracy >= intro.checkpoint.passPercent;
        const session = api.sessions.at(-1)!;
        const now = new Date().toISOString();
        return route.fulfill({ json: {
          session: { ...session, userId: USER, refId: intro.id, startedAt: now, endedAt: now },
          summary: { total: intro.checkpoint.items.length, answered: api.attempts.length, firstTryCorrect: correct, accuracy, passed },
        } });
      }
    }
    return route.fallback();
  });
  await page.goto('/');
  await page.getByTestId('instrument-header').selectOption('guitar');
  await page.getByTestId('nav-lessons').click();
  await expect(page.getByTestId('unit-guitar-intro')).toBeVisible();
  return api;
}

for (const theme of ['dark', 'light']) {
  test(`teaches the parts slowly with a picture in every step (${theme})`, async ({ page }) => {
    // Walk all fifteen paced steps; individual assertions retain their normal timeout.
    test.setTimeout(60_000);
    const api = await guitarCourse(page);
    if (theme === 'light') await page.getByTestId('theme').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.getByTestId('unit-guitar-intro')).toHaveAttribute('data-unlocked', 'true');
    await expect(page.getByTestId('unit-locked-guitar-1')).toContainText('Pass the Unit 1 test');
    await page.getByTestId('lesson-gi-l1').click();
    await expect(page.getByTestId('lesson-title')).toHaveText('Meet the parts');
    const kinds = { explain: 'Learn', show: 'Look', 'play-along': 'Play along', explore: 'Explore', quiz: 'Quiz' };
    for (const step of curriculum.lessonsById.get('gi-l1')!.steps) {
      const kind = kinds[step.type];
      await expect(page.getByTestId('step-kind')).toHaveText(kind);
      await expect(page.getByTestId('guitar-diagram-parts')).toBeVisible();
      await expect.poll(() => page.getByTestId('guitar-diagram-parts').locator('img').evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      if (kind === 'Play along' || kind === 'Quiz') {
        await page.getByRole('button', { name: 'body', exact: true }).click();
        await expect(page.getByTestId('step-complete')).toBeVisible();
      } else await expect(page.getByTestId('fretboard')).toBeVisible();
      if (step.title === 'Meet the body') {
        await expect(page.getByTestId('step-title').locator('..').locator('..')).toHaveCSS('filter', 'blur(0px)');
        await page.screenshot({ path: `/tmp/music-guitar-parts-${theme}.png`, fullPage: true });
      }
      if (kind !== 'Quiz') await page.getByTestId('next').click();
    }
    await page.getByTestId('finish').click();
    await expect(page.getByTestId('summary')).toBeVisible();
    expect(api.attempts).toHaveLength(2);
    expect(api.attempts.every((a) => a.instrument === 'guitar' && a.correct)).toBe(true);
  });
}

test('passing the introductory checkpoint opens the existing fretboard unit', async ({ page }) => {
  // Ten answers each include the player's feedback pause and page transition.
  test.setTimeout(60_000);
  const api = await guitarCourse(page);
  await expect(page.getByTestId('checkpoint-guitar-1')).toBeDisabled();
  await page.getByTestId('checkpoint-guitar-intro').click();
  for (const item of intro.checkpoint.items) {
    if (item.kind !== 'name-it') throw new Error('Expected an introductory naming question');
    await expect(page.getByTestId('prompt')).toHaveText(item.prompt);
    await expect(page.getByTestId('fretboard')).toBeVisible();
    await page.getByRole('button', { name: item.answer, exact: true }).click();
  }
  await expect(page.getByTestId('summary')).toBeVisible();
  expect(api.attempts).toHaveLength(10);
  expect(api.attempts.every((a) => a.instrument === 'guitar' && a.correct)).toBe(true);
  await page.goto('/#/lessons');
  await expect(page.getByTestId('unit-guitar-1')).toHaveAttribute('data-unlocked', 'true');
  await expect(page.getByTestId('checkpoint-guitar-1')).toBeEnabled();
  await expect(page.getByTestId('lesson-g1-l1')).toHaveAttribute('data-status', 'available');
  await expect(page.getByTestId('unit-guitar-1')).toContainText('Unit 2');
});

test('the first tab example pairs its six lines with playable open and fretted notes', async ({ page }) => {
  const api = await guitarCourse(page);
  await page.goto('/#/lesson/gi-l10');
  await expect(page.getByTestId('guitar-diagram-tab')).toBeVisible();
  await expect(page.getByTestId('fret-6-0')).toHaveAttribute('data-mark', 'target');
  await expect(page.getByTestId('fret-6-1')).toHaveAttribute('data-mark', 'target');
  await expect(page.getByTestId('step-title').locator('..').locator('..')).toHaveCSS('filter', 'blur(0px)');
  await page.screenshot({ path: '/tmp/music-guitar-tab.png', fullPage: true });
  await page.getByTestId('next').click();
  await page.getByTestId('next').click();
  await expect(page.getByTestId('prompt')).toContainText('Play the lit note');
  await page.getByTestId('fret-6-0').click();
  await expect(page.getByTestId('step-complete')).toBeVisible();
  expect(api.attempts[0]).toMatchObject({ instrument: 'guitar', played: [40], correct: true });
});
