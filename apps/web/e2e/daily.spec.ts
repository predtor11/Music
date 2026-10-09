import { fakeApi } from './fake-api.js';
import { expect, test } from './fake-midi.js';

const key = (page: import('@playwright/test').Page, note: number) => page.locator(`[data-testid="piano"] [data-note="${note}"]`);

test('shows today\'s plan, leaning on the left hand, with rests that check for stiffness', async ({ page, midi }) => {
  void midi;
  await fakeApi(page);
  await page.goto('/#/daily');
  await expect(page.getByTestId('nav-daily')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('plan-list').locator('li')).toHaveCount(7);
  await expect(page.getByTestId('left-share')).toContainText(/Left hand (5\d|6\d|70)%/);
  await expect(page.getByTestId('plan-list')).toContainText('Left-hand fingers 3 and 4');
  await expect(page.getByTestId('plan-list')).toContainText('Rest');
});

test('plays a control block: wrong keys are flagged, a full pass gets a verdict', async ({ page, midi }) => {
  await fakeApi(page);
  await page.goto('/#/daily');
  await page.getByTestId('header-connect').click();
  await page.getByTestId('start-daily').click();
  await expect(page.getByTestId('drill-runner')).toHaveAttribute('data-mode', 'control');
  await page.getByText('Click', { exact: true }).locator('input').uncheck();
  await page.getByTestId('start-block').click();

  // Warm-up is the left-hand five-finger run: G3 F3 E3 D3 C3 on the way, then back.
  await midi.on(50);
  await expect(key(page, 50)).toHaveAttribute('data-mark', 'bad');
  await midi.off(50);
  for (const n of [55, 53, 52, 50, 48, 50, 52, 53, 55]) {
    await midi.on(n);
    await midi.off(n);
  }
  await expect(page.getByTestId('verdict')).toBeVisible();
  await expect(page.getByTestId('pass-badge')).toHaveCount(1);
});

/** Plays whatever the drill asks for until the block is finished. */
async function playBlock(page: import('@playwright/test').Page, midi: import('./fake-midi.js').Midi) {
  const next = page.getByTestId('next-block');
  for (let i = 0; i < 400 && !(await next.isVisible()); i++) {
    const notes = await page.locator('[data-testid="piano"] [data-mark="target"]').evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-note'))));
    for (const n of notes) await midi.on(n);
    for (const n of notes) await midi.off(n);
    await page.waitForTimeout(40);
  }
  await expect(next).toBeVisible();
}

test('asks whether it feels stiff after the second block, and a stiff answer means a longer rest', async ({ page, midi }) => {
  test.setTimeout(120_000);
  await fakeApi(page);
  await page.goto('/#/daily');
  await page.getByTestId('header-connect').click();
  await page.getByTestId('start-daily').click();
  for (let block = 0; block < 2; block++) {
    await page.getByText('Click', { exact: true }).locator('input').uncheck();
    await page.getByTestId('start-block').click();
    await playBlock(page, midi);
    await page.getByTestId('next-block').click();
  }
  await expect(page.getByTestId('stiff-check')).toBeVisible();
  await page.getByTestId('stiff-stiff').click();
  await expect(page.getByTestId('rest')).toContainText('15% slower');
  await expect(page.getByTestId('rest-next')).toBeDisabled();
  await page.getByTestId('stop-today').click();
  await expect(page.getByTestId('daily-summary')).toContainText('Stopped early');
});
