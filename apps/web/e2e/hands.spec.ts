import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { fakeApi } from './fake-api.js';
import { expect, test } from './fake-midi.js';

// The real technique content, served the way the curriculum service does.
const DIR = fileURLToPath(new URL('../../../services/curriculum/content/technique/sessions/', import.meta.url));
const SESSIONS = readdirSync(DIR)
  .map((f) => JSON.parse(readFileSync(DIR + f, 'utf8')) as { id: string; order: number; steps: unknown[] })
  .sort((a, b) => a.order - b.order);

async function serveTechnique(page: Page) {
  await page.route(
    (url) => url.pathname.startsWith('/api/curriculum/technique'),
    (route) => {
      const id = new URL(route.request().url()).pathname.split('/')[4];
      const body = id ? SESSIONS.find((s) => s.id === id) : SESSIONS.map(({ steps: _, ...s }) => s);
      return route.fulfill({ status: body ? 200 : 404, contentType: 'application/json', body: JSON.stringify(body ?? { message: 'Unknown' }) });
    },
  );
}

const key = (page: Page, note: number) => page.locator(`[data-testid="piano"] [data-note="${note}"]`);

test('lists the hand sessions and opens one', async ({ page, midi }) => {
  void midi;
  await fakeApi(page);
  await serveTechnique(page);
  await page.goto('/#/hands');
  await expect(page.getByTestId('nav-hands')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('hand-session-h1')).toContainText('Your fingers have numbers');
  await page.getByTestId('hand-session-h1').click();
  await expect(page.getByTestId('hand-title')).toHaveText('Your fingers have numbers');
});

test('shows the hand on the keys, plays the demo, and guides a drill finger by finger', async ({ page, midi }) => {
  await fakeApi(page);
  await serveTechnique(page);
  await page.addInitScript(() => ((window as unknown as { __sound: unknown }).__sound = { played: [] }));
  await page.goto('/#/hands/h1');
  await page.getByTestId('header-connect').click();

  // Explain: the right hand rests in C position, thumb on middle C.
  await expect(page.getByTestId('hand-right')).toBeVisible();
  await expect(page.getByTestId('finger-right-1')).toHaveAttribute('data-key', '60');
  await expect(page.getByTestId('finger-right-5')).toHaveAttribute('data-key', '67');
  await page.getByTestId('watch').click();
  await expect(page.getByTestId('finger-right-1')).toHaveAttribute('data-cue', 'true');
  await expect(key(page, 60)).toHaveAttribute('data-mark', 'target');

  // Skip to the first drill.
  for (let i = 0; i < 3; i++) await page.getByTestId('next').click();
  await expect(page.getByTestId('step-title')).toHaveText('Right hand: count 1 to 5');
  await expect(page.getByTestId('next')).toBeDisabled();
  await expect(page.getByTestId('finger-right-1')).toHaveAttribute('data-cue', 'true');
  await expect(key(page, 60)).toHaveAttribute('data-mark', 'target');

  // A wrong key is marked; the right one moves the cue to the next finger.
  await midi.on(64);
  await expect(key(page, 64)).toHaveAttribute('data-mark', 'bad');
  await midi.off(64);
  await midi.on(60);
  await midi.off(60);
  await expect(page.getByTestId('finger-right-2')).toHaveAttribute('data-cue', 'true');
  await expect(key(page, 62)).toHaveAttribute('data-mark', 'target');
  for (const n of [62, 64, 65, 67]) {
    await midi.on(n);
    await midi.off(n);
  }
  await expect(page.getByTestId('run-badge')).toHaveCount(1);
  await expect(page.getByTestId('run-badge').first()).toContainText('1 slip');

  // A second run finishes the drill.
  for (const n of [60, 62, 64, 65, 67]) {
    await midi.on(n);
    await midi.off(n);
  }
  await expect(page.getByTestId('drill-done')).toBeVisible();
  await expect(page.getByTestId('next')).toBeEnabled();
});

test('moves the hand for thumb under', async ({ page, midi }) => {
  await fakeApi(page);
  await serveTechnique(page);
  await page.goto('/#/hands/h6');
  await page.getByTestId('header-connect').click();
  for (let i = 0; i < 2; i++) await page.getByTestId('next').click();
  await expect(page.getByTestId('step-title')).toHaveText('Practise the tuck');
  for (const n of [60, 62, 64]) {
    await midi.on(n);
    await midi.off(n);
  }
  // The thumb has tucked under to F, and the whole hand moved with it.
  await expect(page.getByTestId('finger-right-1')).toHaveAttribute('data-key', '65');
  await expect(page.getByTestId('finger-right-1')).toHaveAttribute('data-cue', 'true');
});
