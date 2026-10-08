import { fakeApi } from './fake-api.js';
import { expect, test } from './fake-midi.js';


test('opens the example chart, changes key in one tap and shows numbers', async ({ page }) => {
  await fakeApi(page);
  await page.goto('/#/charts');
  await expect(page.getByTestId('charts-empty')).toBeVisible();
  await page.getByTestId('charts-example').click();

  await expect(page.getByTestId('chart-title')).toHaveText('Example: pop song in G');
  await expect(page.getByTestId('chart-key')).toHaveText('Key of G major');
  await expect(page.getByTestId('chart-chord').first()).toContainText('G');

  await page.getByTestId('key-up').click();
  await page.getByTestId('key-up').click();
  await expect(page.getByTestId('chart-key')).toHaveText('Key of A major');
  await expect(page.getByTestId('chart-chord').first()).toContainText('A');
  await expect(page.getByTestId('capo-hint')).toBeVisible();

  await page.getByTestId('chart-view').getByRole('radio', { name: 'Numbers' }).click();
  await expect(page.getByTestId('chart-chord').nth(1)).toContainText('5');

  await page.getByTestId('chart-chord').nth(1).click();
  await expect(page.getByTestId('chord-panel-name')).toHaveText('E');
});

test('writes a new chart by typing bars and saves it', async ({ page }) => {
  await fakeApi(page);
  await page.goto('/#/charts/new');
  await page.getByTestId('chart-title-input').fill('Our song');
  await page.getByTestId('chart-key-input').selectOption('D');
  const texts = page.getByTestId('section-text');
  await texts.nth(0).fill('| D | A/C# | Bm | G |');
  await texts.nth(1).fill('| G | Hm |');
  await expect(page.getByTestId('section-problem')).toContainText('"Hm"');
  await texts.nth(1).fill('| G | A | D | % |');
  await page.getByTestId('chart-save').click();

  await expect(page.getByTestId('chart-title')).toHaveText('Our song');
  await expect(page.getByTestId('chart-section')).toHaveCount(2);
  await expect(page.getByTestId('chart-chord').nth(1)).toContainText('A/C♯');

  await page.goto('/#/charts');
  await expect(page.getByTestId('charts-item')).toHaveCount(1);
});
