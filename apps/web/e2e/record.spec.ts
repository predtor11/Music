import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { expect, test, type Midi } from './fake-midi.js';

const G = { G2: 43, B3: 59, D4: 62, D3: 50, Fs3: 54, A3: 57, E3: 52, G3: 55, C3: 48 } as const;

/** The 1-5-6-4 in G on the fake keyboard, a little over half a second per chord. */
async function playAxis(page: Page, midi: Midi) {
  const chords = [
    [G.G2, G.B3, G.D4],
    [G.D3, G.Fs3, G.A3],
    [G.E3, G.G3, G.B3],
    [G.C3, G.E3, G.G3],
  ];
  for (const round of [0, 1]) {
    void round;
    for (const c of chords) {
      await midi.on(...c);
      await page.waitForTimeout(600);
      await midi.off(...c);
      await page.waitForTimeout(40);
    }
  }
}

test.beforeEach(async ({ page, midi }) => {
  void midi; // installs the fake keyboard
  await page.addInitScript(() => ((window as unknown as { __sound: unknown }).__sound = { played: [] }));
  await page.goto('/#/record');
  await page.getByTestId('header-connect').click();
  await expect(page.getByTestId('header-midi')).toContainText('Test Keyboard');
});

test('records what you play and says the key and chords, as names and numbers', async ({ page, midi }) => {
  await page.getByTestId('rec-toggle').click();
  await expect(page.getByTestId('rec-toggle')).toHaveAttribute('data-recording', 'true');
  await playAxis(page, midi);
  await expect(page.getByTestId('rec-notes')).toHaveText('24 notes');
  await page.getByTestId('rec-toggle').click();

  await expect(page.getByTestId('take-key')).toHaveText('G major');
  // Skip the empty lead-in before the first note.
  const chords = page.locator('[data-testid="take-chord"]:not([data-empty])');
  await expect(chords.first()).toContainText('G');
  expect((await chords.allInnerTexts()).slice(0, 4).map((t) => t.replace(/\s+/g, ' '))).toEqual(['G 1', 'D 5', 'Em 6m', 'C 4']);
  await expect(page.getByTestId('take-summary')).toContainText('1 – 5 – 6m – 4 (G D Em C) repeats 2 times');

  // Play it back through the app's piano.
  await page.getByTestId('take-play').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __sound: { played: unknown[] } }).__sound.played.length)).toBeGreaterThan(0);
  await page.getByTestId('take-stop').click();
});

test('fixes a chord, saves the take, exports it and imports it again', async ({ page, midi }) => {
  await page.getByTestId('rec-toggle').click();
  await playAxis(page, midi);
  await page.getByTestId('rec-toggle').click();
  await expect(page.getByTestId('take-key')).toHaveText('G major');

  // The app heard D; say it was D7.
  await page.getByTestId('take-chord').filter({ hasText: /^D/ }).first().click();
  await expect(page.getByTestId('take-fix')).toBeVisible();
  await page.getByTestId('fix-quality').selectOption('7');
  await expect(page.getByTestId('take-fix')).toContainText('Set by you');
  await expect(page.getByTestId('take-chords')).toContainText('D7');

  await page.getByTestId('rec-title').fill('Sunday jam');
  await page.getByTestId('rec-save').click();
  await expect(page).toHaveURL(/#\/record\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId('recording-title')).toHaveValue('Sunday jam');
  // The fix was saved with it.
  await expect(page.getByTestId('take-chords')).toContainText('D7');

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('take-export').click()]);
  expect(download.suggestedFilename()).toBe('Sunday jam.mid');
  const bytes = await readFile((await download.path())!);
  expect(bytes.subarray(0, 4).toString()).toBe('MThd');

  await page.goto('/#/record');
  await expect(page.getByTestId('rec-item')).toHaveCount(1);
  await expect(page.getByTestId('rec-item')).toContainText('Sunday jam');

  await page.getByTestId('rec-import-file').setInputFiles({ name: 'Sunday jam.mid', mimeType: 'audio/midi', buffer: bytes });
  await expect(page.getByTestId('rec-draft')).toBeVisible();
  await expect(page.getByTestId('rec-title')).toHaveValue('Sunday jam');
  await expect(page.getByTestId('take-key')).toHaveText('G major');
});

test('says so when nothing was played or the file is not MIDI', async ({ page }) => {
  await page.getByTestId('rec-toggle').click();
  await page.getByTestId('rec-toggle').click();
  await expect(page.getByTestId('rec-error')).toContainText('Nothing was played');
  await page.getByTestId('rec-import-file').setInputFiles({ name: 'notes.mid', mimeType: 'audio/midi', buffer: Buffer.from('hello') });
  await expect(page.getByTestId('rec-error')).toContainText('MIDI');
});
