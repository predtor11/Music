import type { ProgressReport } from '@music/contracts';
import { expect, test, type Page } from '@playwright/test';

const USER_ID = '00000000-0000-4000-8000-000000000001';

/** Local YYYY-MM-DD for `daysAgo` days before now, as the report would group it. */
function localDate(daysAgo: number): string {
  const offset = -new Date().getTimezoneOffset();
  return new Date(Date.now() + offset * 60_000 - daysAgo * 86_400_000).toISOString().slice(0, 10);
}

function seeded(): ProgressReport {
  const to = new Date();
  return {
    userId: USER_ID,
    from: new Date(to.getTime() - 7 * 86_400_000).toISOString(),
    to: to.toISOString(),
    practice: { minutes: 38.4, sessions: 6, streakDays: 3 },
    accuracyTrend: [
      { topic: 'interval', date: localDate(4), firstTryAccuracy: 0.5, attempts: 12 },
      { topic: 'interval', date: localDate(2), firstTryAccuracy: 0.7, attempts: 10 },
      { topic: 'interval', date: localDate(0), firstTryAccuracy: 0.9, attempts: 10 },
      { topic: 'note', date: localDate(1), firstTryAccuracy: 1, attempts: 8 },
      { topic: 'note', date: localDate(0), firstTryAccuracy: 0.75, attempts: 4 },
    ],
    patterns: [
      { id: 'interval-mixup:M3-m3', description: 'Mixes up major and minor 3rds', occurrences: 5, skills: ['interval:M3', 'interval:m3'] },
      { id: 'mistake:wrong-octave', description: 'Right note, wrong octave', occurrences: 2, skills: ['note:C'] },
    ],
    speed: [
      { skill: 'interval:M3', medianTimeMs: 1800, changePercent: -22.5 },
      { skill: 'note:F#', medianTimeMs: 950, changePercent: 10 },
      { skill: 'interval:P5', medianTimeMs: 2400, changePercent: null },
    ],
    suggestions: [
      { text: 'You often mix up M3 and m3. Play both from the same starting note.' },
      { text: 'Finish the lesson you started.', lessonId: 'u1-l3', unitId: 'u1' },
      { text: 'Keep your 3-day streak going: even ten minutes counts.' },
    ],
  };
}

function empty(): ProgressReport {
  return { ...seeded(), practice: { minutes: 0, sessions: 0, streakDays: 0 }, accuracyTrend: [], patterns: [], speed: [], suggestions: [] };
}

async function mockReport(page: Page, body: ProgressReport | { status: number; message: string }) {
  const seen: string[] = [];
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const url = new URL(route.request().url());
    seen.push(url.pathname + url.search);
    if (url.pathname === '/api/progress/reports/weekly') {
      const status = 'status' in body ? body.status : 200;
      return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'not faked' }) });
  });
  return seen;
}

test('renders a seeded weekly report', async ({ page }) => {
  const seen = await mockReport(page, seeded());
  await page.goto('/#/progress');

  await expect(page.getByTestId('page-progress')).toBeVisible();
  expect(seen.some((p) => /\/api\/progress\/reports\/weekly\?tzOffset=-?\d+/.test(p))).toBe(true);

  // Headline numbers: (6 + 7 + 9 + 8 + 3) / 44 = 75%.
  await expect(page.getByTestId('stat-accuracy')).toContainText('75%');
  await expect(page.getByTestId('stat-minutes')).toContainText('38');
  await expect(page.getByTestId('stat-minutes')).toContainText('6 sessions');
  await expect(page.getByTestId('stat-streak')).toContainText('3days');

  // Accuracy trend per topic, most practised first, one dot per day.
  const topics = page.getByTestId('topics').locator('li');
  await expect(topics.first()).toHaveAttribute('data-testid', 'topic-interval');
  await expect(page.getByTestId('topic-interval').getByTestId('topic-accuracy')).toHaveText('69%');
  await expect(page.getByTestId('topic-interval')).toContainText('▲ 40 pts');
  await expect(page.getByTestId('topic-interval').locator('.ui-spark-dot')).toHaveCount(3);
  await page.getByTestId('topic-interval').locator('.ui-spark-dot').last().hover();
  await expect(page.getByRole('tooltip')).toContainText('90% of 10');

  // Practice habit: the days with practice are filled.
  await expect(page.getByTestId('habit').locator('li[data-active="true"]')).toHaveCount(4);
  await expect(page.getByTestId('streak-badge')).toHaveText('3 days in a row');

  // Repeat mistakes and speed, in plain words.
  await expect(page.getByTestId('mistake-interval-mixup:M3-m3')).toContainText('Mixes up major and minor 3rds');
  await expect(page.getByTestId('mistake-interval-mixup:M3-m3')).toContainText('Intervals: minor 3rd');
  await expect(page.getByTestId('speed-interval:M3')).toContainText('23% faster');
  await expect(page.getByTestId('speed-note:F#')).toContainText('Note names: F♯');
  await expect(page.getByTestId('speed-note:F#')).toContainText('10% slower');
  await expect(page.getByTestId('speed-interval:P5')).toContainText('New this week');

  // Suggestions lead somewhere.
  await expect(page.getByTestId('suggestions').locator('li')).toHaveCount(3);
  await page.getByTestId('suggestion-1-go').click();
  await expect(page).toHaveURL(/#\/lesson\/u1-l3$/);
});

test('works in both themes', async ({ page }) => {
  await mockReport(page, seeded());
  await page.goto('/#/progress');
  await expect(page.getByTestId('stat-accuracy')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const darkBg = await page.getByTestId('stat-accuracy').evaluate((el) => getComputedStyle(el).backgroundColor);

  await page.getByTestId('theme').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const lightBg = await page.getByTestId('stat-accuracy').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(lightBg).not.toBe(darkBg);
  await expect(page.getByTestId('topic-interval')).toBeVisible();
});

test('shows a friendly empty state with no practice this week', async ({ page }) => {
  await mockReport(page, empty());
  await page.goto('/#/progress');
  await expect(page.getByTestId('progress-empty')).toContainText('Your report starts with your first lesson');
  await expect(page.getByTestId('habit').locator('li[data-active="true"]')).toHaveCount(0);
  await expect(page.getByTestId('stat-accuracy')).toHaveCount(0);
  await page.getByTestId('empty-start').click();
  await expect(page).toHaveURL(/#\/lessons$/);
});

test('asks to sign in when the report needs a user', async ({ page }) => {
  await mockReport(page, { status: 401, message: 'not signed in' });
  await page.goto('/#/progress');
  await expect(page.getByTestId('progress-signin')).toBeVisible();
});
