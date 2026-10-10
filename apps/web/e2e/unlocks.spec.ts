import type { Lesson, Progress, SkillScore, TestItem, Unit } from '@music/contracts';
import type { Page, Route } from '@playwright/test';
import { fakeApi, LESSON, nextItemSessionId, UNIT } from './fake-api.js';
import { expect, test } from './fake-midi.js';
import { computeProgress, NO_COMPLETIONS } from '../../../services/progress/src/unlocks.js';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const LESSON2: Lesson = { ...LESSON, id: 'test-l2', order: 2, title: 'Finding E' };
const UNIT2 = { ...UNIT, id: 'test-unit-2', order: 2, title: 'Steps', lessonIds: ['test-l3'], checkpoint: undefined };
const LESSON3: Lesson = { ...LESSON, id: 'test-l3', unitId: UNIT2.id, order: 1, title: 'Half steps' };

const progress = (statuses: Array<Progress['units'][number]['lessons'][number]['status']>, unit2Open = false): Progress => ({
  userId: USER_ID,
  units: [
    {
      unitId: UNIT.id,
      unlocked: true,
      checkpointPassed: unit2Open,
      lessons: [
        { lessonId: LESSON.id, status: statuses[0]! },
        { lessonId: LESSON2.id, status: statuses[1]! },
      ],
    },
    { unitId: UNIT2.id, unlocked: unit2Open, checkpointPassed: false, lessons: [{ lessonId: LESSON3.id, status: unit2Open ? 'available' : 'locked' }] },
  ],
});

const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const GUITAR_UNIT: Unit = { ...UNIT, id: 'guitar-1', instrument: 'guitar', lessonIds: ['guitar-1-strings'], title: 'Meet the fretboard' };
// Non-consecutive orders catch the old arithmetic fallback (Unit 2 does not exist).
const GUITAR_UNIT2: Unit = { ...GUITAR_UNIT, id: 'guitar-3', order: 3, lessonIds: ['guitar-3-notes'], title: 'Guitar notes' };
const GUITAR_UNITS = [GUITAR_UNIT, GUITAR_UNIT2];

async function guitarCourse(page: Page, state: Progress) {
  await fakeApi(page, { signedIn: true });
  const requests: string[] = [];
  await page.route((url) => url.pathname.startsWith('/api/'), (route) => {
    const url = new URL(route.request().url());
    requests.push(url.pathname + url.search);
    const path = url.pathname.replace(/^\/api/, '');
    // A mixed catalog also checks that piano units never enter the guitar chain.
    if (path === '/curriculum/units') return json(route, [UNIT, ...GUITAR_UNITS]);
    const unit = GUITAR_UNITS.find((u) => path === `/curriculum/lessons/${u.lessonIds[0]}`);
    if (unit) return json(route, { ...LESSON, id: unit.lessonIds[0], unitId: unit.id, instrument: 'guitar', title: unit.title });
    if (path === '/progress/') return json(route, state);
    if (path === '/progress/review-queue') return json(route, []);
    return route.fallback();
  });
  await page.goto('/');
  await page.getByTestId('instrument-header').selectOption('guitar');
  await page.getByTestId('nav-lessons').click();
  await expect(page.getByTestId('unit-guitar-1')).toBeVisible();
  return requests;
}

test('guitar starts open with instrument-scoped progress and real prerequisite badges', async ({ page }) => {
  const state = computeProgress(USER_ID, [UNIT, ...GUITAR_UNITS], NO_COMPLETIONS, 'guitar');
  const requests = await guitarCourse(page, state);
  expect(requests).toContain('/api/progress/?instrument=guitar');
  expect(requests).toContain('/api/curriculum/units?instrument=guitar');
  await expect(page.getByTestId('unit-guitar-1')).toHaveAttribute('data-unlocked', 'true');
  await expect(page.getByTestId('checkpoint-guitar-1')).toBeEnabled();
  await expect(page.getByTestId('lesson-guitar-1-strings')).toHaveAttribute('data-status', 'available');
  await expect(page.getByTestId('unit-locked-guitar-1')).toHaveCount(0);
  await expect(page.getByTestId('unit-locked-guitar-3')).toContainText('Pass the Unit 1 test');
  await expect(page.getByTestId(`unit-${UNIT.id}`)).toHaveCount(0);
  await page.getByTestId('lesson-guitar-1-strings').click();
  await expect(page.getByTestId('lesson-title')).toHaveText(GUITAR_UNIT.title);
});

test('stale piano progress never invents a guitar prerequisite', async ({ page }) => {
  await guitarCourse(page, computeProgress(USER_ID, [UNIT], NO_COMPLETIONS));
  await expect(page.getByTestId('unit-locked-guitar-1')).toHaveCount(0);
  await expect(page.getByTestId('unit-locked-guitar-3')).toContainText('Pass the Unit 1 test');
  await expect(page.getByText(/Pass the Unit [02] test/)).toHaveCount(0);
});

/** Two units and three lessons, with progress and the review queue answered as given. */
async function course(page: Page, state: { progress: () => Progress; queue?: SkillScore[]; reviewItems?: TestItem[] }) {
  const api = await fakeApi(page, { signedIn: true });
  // Registered after fakeApi, so these win for the paths they handle.
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
    if (path === '/curriculum/units') return json(route, [{ ...UNIT, lessonIds: [LESSON.id, LESSON2.id], checkpoint: undefined }, UNIT2]);
    if (path === `/curriculum/lessons/${LESSON2.id}`) return json(route, LESSON2);
    if (path === `/curriculum/lessons/${LESSON3.id}`) return json(route, LESSON3);
    if (path === '/progress/') return json(route, state.progress());
    if (path === '/progress/review-queue') return json(route, state.queue ?? []);
    if (nextItemSessionId(path) && api.sessions.at(-1)?.kind === 'review') {
      const answered = new Set(api.attempts.map((a) => a.itemId));
      return json(route, (state.reviewItems ?? []).find((i) => !answered.has(i.id)) ?? null);
    }
    return route.fallback();
  });
  return api;
}

test('gates lessons and units by progress', async ({ page }) => {
  await course(page, { progress: () => progress(['done', 'available']) });
  await page.goto('/#/lessons');

  await expect(page.getByTestId(`lesson-${LESSON.id}`)).toHaveAttribute('data-status', 'done');
  await expect(page.getByTestId(`lesson-${LESSON2.id}`)).toHaveAttribute('data-status', 'available');
  await expect(page.getByTestId(`lesson-${LESSON3.id}`)).toHaveAttribute('data-status', 'locked');
  await expect(page.getByTestId(`unit-count-${UNIT.id}`)).toHaveText('1 of 2 done');

  // Up next is the open lesson.
  await expect(page.getByTestId('continue')).toContainText(LESSON2.title);

  // Unit 2 is locked until the Unit 1 test is passed: its lessons and test can't be opened.
  await expect(page.getByTestId(`unit-locked-${UNIT2.id}`)).toContainText('Pass the Unit 1 test');
  await expect(page.getByTestId(`checkpoint-${UNIT2.id}`)).toBeDisabled();
  await expect(page.locator(`a[data-testid="lesson-${LESSON3.id}"]`)).toHaveCount(0);

  await page.getByTestId(`lesson-${LESSON2.id}`).click();
  await expect(page.getByTestId('lesson-title')).toHaveText(LESSON2.title);
});

test('a passed unit test opens the next unit', async ({ page }) => {
  await course(page, { progress: () => progress(['done', 'done'], true) });
  await page.goto('/#/lessons');
  await expect(page.getByTestId(`unit-passed-${UNIT.id}`)).toBeVisible();
  await expect(page.getByTestId(`checkpoint-${UNIT2.id}`)).toBeEnabled();
  await expect(page.getByTestId(`lesson-${LESSON3.id}`)).toHaveAttribute('data-status', 'available');
  await expect(page.getByTestId('continue')).toContainText(LESSON3.title);
});

test('coming back from a finished lesson shows it done and the next one open', async ({ page }) => {
  let finished = false;
  await course(page, { progress: () => (finished ? progress(['done', 'available']) : progress(['available', 'locked'])) });
  await page.goto('/#/lessons');
  await expect(page.getByTestId(`lesson-${LESSON2.id}`)).toHaveAttribute('data-status', 'locked');
  await page.getByTestId(`lesson-${LESSON.id}`).click();
  await expect(page.getByTestId('lesson-title')).toHaveText(LESSON.title);

  // The progress service has handled the lesson's session.ended.
  finished = true;
  await page.goto('/#/lessons');
  await expect(page.getByTestId(`lesson-${LESSON.id}`)).toHaveAttribute('data-status', 'done');
  await expect(page.getByTestId(`lesson-${LESSON2.id}`)).toHaveAttribute('data-status', 'available');
});

test('leaves everything open when progress cannot be reached', async ({ page }) => {
  await fakeApi(page);
  await page.goto('/#/lessons');
  await expect(page.getByTestId('progress-offline')).toBeVisible();
  await expect(page.getByTestId(`lesson-${LESSON.id}`)).toHaveAttribute('data-status', 'available');
});

test('asks to sign in when progress needs a user', async ({ page }) => {
  await fakeApi(page);
  await page.route((url) => url.pathname.startsWith('/api/progress'), (route) => json(route, { message: 'not signed in' }, 401));
  await page.goto('/#/lessons');
  await expect(page.getByTestId('progress-signed-out')).toContainText('Sign in to save your progress');
  await expect(page.getByTestId('progress-offline')).toHaveCount(0);
  await expect(page.getByTestId(`lesson-${LESSON.id}`)).toHaveAttribute('data-status', 'available');
  await page.getByRole('button', { name: 'Sign in' }).last().click();
  await expect(page).toHaveURL(/#\/signin$/);
});

const REVIEW_ITEMS: TestItem[] = [
  { kind: 'play-interval', id: 'r1', prompt: 'Play E, then a half step up.', startMidi: 64, semitones: 1 },
  { kind: 'find-note', id: 'r2', prompt: 'Play any D.', pc: 2 },
];

test('review serves the weak-skill items and records each attempt', async ({ page, midi }) => {
  const queue: SkillScore[] = [
    { skill: 'note:D', attempts: 5, firstTryAccuracy: 0.6, medianTimeMs: 1800, dueAt: '2026-10-08T06:00:00.000Z' },
    { skill: 'interval:m2', attempts: 4, firstTryAccuracy: 0.25, medianTimeMs: 2400, dueAt: '2026-10-08T06:00:00.000Z' },
  ];
  const api = await course(page, { progress: () => progress(['done', 'available']), queue, reviewItems: REVIEW_ITEMS });
  await page.goto('/#/lessons');
  await expect(page.getByTestId('review-due')).toContainText('2 skills are due');
  await page.getByTestId('review-due').getByRole('button').click();

  await page.getByTestId('header-connect').click();
  await expect(page.getByTestId('review-skills')).toContainText('Interval: minor 2nd · 25%');
  await expect(page.getByTestId('prompt')).toHaveText('Play E, then a half step up.');
  await expect(page.getByTestId('review-skill')).toHaveText('Interval: minor 2nd');
  await midi.on(64);
  await midi.on(65);
  await midi.off(64, 65);
  await expect(page.getByTestId('prompt')).toHaveText('Play any D.');
  await midi.on(62);
  await midi.off(62);

  await expect(page.getByTestId('summary')).toBeVisible();
  await expect(page.getByTestId('passed')).toHaveCount(0);
  expect(api.sessions).toEqual([{ id: expect.any(String), kind: 'review', instrument: 'piano' }]);
  expect(api.attempts.map((a) => [a.itemId, a.skill, a.correct])).toEqual([
    ['r1', 'interval:m2', true],
    ['r2', 'note:D', true],
  ]);
});

test('review lights the key when the question points at a lit key', async ({ page, midi }) => {
  const queue: SkillScore[] = [{ skill: 'note:C4', attempts: 3, firstTryAccuracy: 0.3, medianTimeMs: 2000, dueAt: '2026-10-08T06:00:00.000Z' }];
  const items: TestItem[] = [
    { kind: 'find-note', id: 'lit', prompt: 'Play the lit key.', midi: 60, showKeys: true },
    { kind: 'find-note', id: 'plain', prompt: 'Play any D.', pc: 2 },
  ];
  await course(page, { progress: () => progress(['done', 'available']), queue, reviewItems: items });
  await page.goto('/#/review');
  await page.getByTestId('header-connect').click();
  const key = (n: number) => page.locator(`[data-testid="piano"] [data-note="${n}"]`);

  await expect(page.getByTestId('prompt')).toHaveText('Play the lit key.');
  await expect(key(60)).toHaveAttribute('data-mark', 'target');
  await midi.on(60);
  await midi.off(60);

  // Other review questions stay a test: nothing is lit.
  await expect(page.getByTestId('prompt')).toHaveText('Play any D.');
  await expect(page.locator('[data-testid="piano"] [data-mark]')).toHaveCount(0);
});

test('review says when nothing is due', async ({ page }) => {
  await course(page, { progress: () => progress(['done', 'available']), queue: [], reviewItems: [] });
  await page.goto('/#/review');
  await expect(page.getByTestId('review-empty')).toContainText('Nothing to review right now');
});
