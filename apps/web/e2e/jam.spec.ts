import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { fakeApi } from './fake-api.js';
import { expect, test } from './fake-midi.js';

const key = (page: Page, note: number) => page.locator(`[data-testid="piano"] [data-note="${note}"]`);
const played = (page: Page) => page.evaluate(() => (window as unknown as { __sound: { played: Array<{ kind: string; notes: number[] }> } }).__sound.played);

// The real content, served the way the curriculum service does.
const CONTENT = fileURLToPath(new URL('../../../services/curriculum/content/', import.meta.url));
async function serveBandTalk(page: Page) {
  for (const [path, file] of [
    ['bandtalk', 'bandtalk.json'],
    ['glossary', 'glossary.json'],
  ]) {
    const body = readFileSync(CONTENT + file, 'utf8');
    await page.route(`**/api/curriculum/${path}`, (route) => route.fulfill({ contentType: 'application/json', body }));
  }
}

test.beforeEach(async ({ page }) => {
  await fakeApi(page);
  await page.addInitScript(() => ((window as unknown as { __sound: unknown }).__sound = { played: [] }));
});

test('the band plays 1-5-6-4 in G, shows the chord now and next, and lights the notes that fit', async ({ page, midi }) => {
  await page.goto('/#/jam?n=1,5,6,4&key=G&bpm=180&bpc=2');
  await page.getByTestId('header-connect').click();
  await expect(page.getByTestId('nav-jam')).toHaveAttribute('aria-current', 'page');

  // Before starting: the first chord and its notes are lit.
  await expect(page.getByTestId('jam-chord')).toHaveText('G');
  await expect(page.getByTestId('jam-numeral')).toHaveText('1 in G major');
  await expect(page.getByTestId('jam-next')).toContainText('D');
  for (const n of [55, 59, 62]) await expect(key(page, n)).toHaveAttribute('data-mark', 'target');
  await expect(key(page, 60)).not.toHaveAttribute('data-mark');

  // The key scale shows as dots when asked for.
  await page.getByTestId('jam-light').getByRole('radio', { name: '+ key scale' }).click();
  await expect(key(page, 60)).toHaveAttribute('data-mark', 'fit');
  await expect(key(page, 65)).not.toHaveAttribute('data-mark');

  // Start: a count-in, then the chords go round.
  await page.getByTestId('jam-play').click();
  await expect(page.getByTestId('jam-count')).toBeVisible();
  await expect(page.getByTestId('jam-chord')).toHaveText('G');
  await midi.on(62);
  await expect(key(page, 62)).toHaveAttribute('data-mark', 'good');
  await midi.off(62);
  await expect(page.getByTestId('jam-stats')).toContainText('1 notes');
  await expect(page.getByTestId('jam-stats')).toContainText('100% chord notes');
  await expect(page.getByTestId('jam-chord')).toHaveText('D');
  await expect(page.getByTestId('jam-chord')).toHaveText('Em');
  await expect(page.getByTestId('jam-chord')).toHaveText('C');
  for (const n of [60, 64, 67]) await expect(key(page, n)).toHaveAttribute('data-mark', /target|good/);

  // The band played the chords, smoothly voiced below middle C's octave.
  const chords = (await played(page)).filter((c) => c.kind === 'chord');
  expect(chords.length).toBeGreaterThanOrEqual(4);
  for (const c of chords) for (const n of c.notes) expect(n).toBeLessThan(76);

  await page.getByTestId('jam-play').click();
  await expect(page.getByTestId('jam-play')).toHaveText('▶ Start the band');
});

test('takes your own chords and says which ones it cannot read', async ({ page }) => {
  await page.goto('/#/jam');
  await page.getByTestId('jam-preset').selectOption('custom');
  await page.getByTestId('jam-custom').fill('1 b7 4 9');
  await expect(page.getByTestId('jam-bad')).toContainText("9 isn't a chord number");
  await expect(page.getByTestId('jam-chip-1')).toContainText('B♭');
  await expect(page.getByTestId('jam-chip-1')).toContainText('♭7');
  await page.getByTestId('jam-custom').fill('');
  await expect(page.getByTestId('jam-play')).toBeDisabled();
});

test('band talk: search a phrase, hear its example, and open it in the jam-along', async ({ page }) => {
  await serveBandTalk(page);
  await page.goto('/#/bandtalk');
  await expect(page.getByTestId('nav-bandtalk')).toHaveAttribute('aria-current', 'page');

  await page.getByTestId('bandtalk-search').fill('middle eight');
  await expect(page.getByTestId('bandtalk-bridge')).toBeVisible();
  await expect(page.getByTestId('bandtalk-capo')).toHaveCount(0);
  await page.getByTestId('bandtalk-bridge').click();
  await expect(page.getByTestId('bandtalk-phrase')).toHaveText('the bridge');
  await expect(page.getByTestId('bandtalk-say')).toContainText('from the bridge');
  // Am F C G in C: the first chord is lit.
  for (const n of [57, 60, 64]) await expect(key(page, n)).toHaveAttribute('data-mark', 'target');
  await page.getByTestId('bandtalk-play').click();
  await expect.poll(async () => (await played(page)).length).toBeGreaterThanOrEqual(2);
  await expect(page.getByTestId('bandtalk-step-1')).toHaveAttribute('data-on', 'true');

  // A phrase the course teaches shows the glossary's own entry.
  await page.getByTestId('bandtalk-search').fill('');
  await page.getByTestId('bandtalk-two-five-one').click();
  await expect(page.getByTestId('bandtalk-glossary')).toContainText('The progression ii, V, I');
  await expect(page.getByTestId('bandtalk-lesson')).toHaveAttribute('href', '#/lesson/u5-l11');
  await page.getByTestId('related-dominant').click();
  await expect(page.getByTestId('related-body')).toContainText('5th scale degree');

  await page.getByTestId('bandtalk-jam').click();
  await expect(page.getByTestId('jam-chord')).toHaveText('Dm7');
  await expect(page.getByTestId('jam-style')).toHaveValue('ballad');
});

test('band talk opens straight at a phrase from its address', async ({ page }) => {
  await serveBandTalk(page);
  await page.goto('/#/bandtalk/capo');
  await expect(page.getByTestId('bandtalk-phrase')).toHaveText('capo');
  await expect(page.getByTestId('bandtalk-step-1')).toContainText('A sounds');
});
