import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { fakeApi, LESSON, type FakeApi } from './fake-api.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Two quiz questions, so one can be answered online and one offline. */
const TWO: typeof LESSON = {
  ...LESSON,
  steps: [
    {
      type: 'quiz',
      title: 'Quick check',
      items: [
        { kind: 'name-it', id: 'q1', prompt: 'Which key is lit?', shownMidi: [62], choices: ['C', 'D', 'E'], answer: 'D' },
        { kind: 'name-it', id: 'q2', prompt: 'And this one?', shownMidi: [64], choices: ['C', 'D', 'E'], answer: 'E' },
      ],
    },
  ],
};

/** Unplugs (or reconnects) the browser and the fake server together. */
async function setOffline(context: BrowserContext, api: FakeApi, offline: boolean) {
  api.offline = offline;
  await context.setOffline(offline);
}

const chip = (page: Page) => page.getByTestId('sync-chip');

test('goes offline mid-lesson, finishes it, and the queue flushes when the connection returns', async ({ page, context }) => {
  const api = await fakeApi(page, { signedIn: true });
  await page.route(`**/api/curriculum/lessons/${LESSON.id}`, (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(TWO) }));
  await page.goto(`/#/lesson/${LESSON.id}`);
  await expect(chip(page)).toHaveAttribute('data-state', 'online');

  // The first answer reaches the server as usual.
  await expect(page.getByTestId('prompt')).toHaveText('Which key is lit?');
  await page.getByTestId('choice-D').click();
  await expect.poll(() => api.attempts.length).toBe(1);
  await expect(page.getByTestId('prompt')).toHaveText('And this one?');
  await expect(chip(page)).toHaveAttribute('data-state', 'online');

  // The connection drops. The lesson carries on.
  await setOffline(context, api, true);
  await expect(chip(page)).toHaveAttribute('data-state', 'offline');
  await page.getByTestId('choice-E').click();
  await expect(chip(page)).toHaveText('1 to sync');
  await expect(page.getByTestId('offline')).toBeVisible();
  await page.getByTestId('finish').click();

  // The score comes from this device, and the end of the lesson waits in the queue.
  await expect(page.getByTestId('summary')).toBeVisible();
  await expect(page.getByTestId('score')).toHaveText('100%');
  await expect(page.getByTestId('passed')).toHaveText('Passed');
  await expect(page.getByTestId('summary-offline')).toContainText('kept on this device');
  await expect(chip(page)).toHaveText('2 to sync');
  expect(api.attempts).toHaveLength(1);
  expect(api.ended).toHaveLength(0);

  // Back online: the queue empties by itself, in order, without repeats.
  await setOffline(context, api, false);
  await expect(chip(page)).toHaveAttribute('data-state', 'online');
  await expect(chip(page)).toHaveText('Online');
  expect(api.sessions).toHaveLength(1);
  expect(api.sessions[0]).toMatchObject({ kind: 'lesson', refId: LESSON.id, id: expect.stringMatching(UUID) });
  expect(api.attempts.map((a) => [a.itemId, a.correct])).toEqual([
    ['q1', true],
    ['q2', true],
  ]);
  expect(api.attempts.every((a) => a.sessionId === api.sessions[0]!.id && UUID.test(String(a.id)))).toBe(true);
  expect(api.ended).toEqual([api.sessions[0]!.id]);
});

test('scores a wrong-then-right answer on the device while offline, then syncs it', async ({ page, context }) => {
  const api = await fakeApi(page, { signedIn: true });
  await page.route(`**/api/curriculum/lessons/${LESSON.id}`, (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(TWO) }));
  await page.goto(`/#/lesson/${LESSON.id}`);
  await expect(page.getByTestId('prompt')).toHaveText('Which key is lit?');
  await expect.poll(() => api.sessions.length).toBe(1);

  // Wrong first, then right: counts as not first-try. Offline from here on.
  await setOffline(context, api, true);
  await page.getByTestId('choice-C').click();
  await page.getByTestId('choice-D').click();
  await page.getByTestId('choice-E').click();
  await page.getByTestId('finish').click();
  await expect(page.getByTestId('score')).toHaveText('50%');
  await expect(page.getByTestId('passed')).toHaveText('Almost. Try it again to pass.');
  await expect(chip(page)).toHaveText('4 to sync');

  await setOffline(context, api, false);
  await expect(chip(page)).toHaveText('Online');
  expect(api.attempts.map((a) => [a.itemId, a.correct, a.retried])).toEqual([
    ['q1', false, false],
    ['q1', true, true],
    ['q2', true, false],
  ]);
  expect(api.ended).toHaveLength(1);
});

test('shows the last saved progress report, gently, when the network is down', async ({ page, context }) => {
  const api = await fakeApi(page, { signedIn: true });
  const report = {
    userId: '00000000-0000-4000-8000-000000000001',
    from: new Date(Date.now() - 7 * 86_400_000).toISOString(),
    to: new Date().toISOString(),
    practice: { minutes: 12, sessions: 2, streakDays: 1 },
    accuracyTrend: [],
    patterns: [],
    speed: [],
    suggestions: [{ text: 'Keep your streak going.' }],
  };
  await page.route('**/api/progress/reports/weekly*', (route) => (api.offline ? route.abort('internetdisconnected') : route.fulfill({ contentType: 'application/json', body: JSON.stringify(report) })));

  await page.goto('/#/progress');
  await expect(page.getByTestId('progress-offline-note')).toHaveCount(0);
  await expect(page.getByText('Keep your streak going.')).toBeVisible();

  await setOffline(context, api, true);
  await page.goto('/#/');
  await expect(page.getByTestId('display-main')).toBeVisible(); // the chord namer is really up, so progress mounts afresh
  await page.goto('/#/progress');
  await expect(page.getByTestId('progress-offline-note')).toContainText("You're offline. Showing your report as last saved");
  await expect(page.getByText('Keep your streak going.')).toBeVisible();
  await expect(page.getByTestId('load-error')).toHaveCount(0);
});

test('says so, without an error, when offline with no saved report', async ({ page, context }) => {
  const api = await fakeApi(page, { signedIn: true });
  await page.goto('/#/lessons');
  await setOffline(context, api, true);
  await page.route('**/api/progress/reports/weekly*', (route) => route.abort('internetdisconnected'));
  await page.goto('/#/progress');
  await expect(page.getByTestId('progress-offline-empty')).toContainText("You're offline");
  await expect(page.getByTestId('load-error')).toHaveCount(0);
});
