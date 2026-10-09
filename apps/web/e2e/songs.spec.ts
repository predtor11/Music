import { sampleNotes, writeMidiFile } from '@music/analysis';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => ((window as unknown as { __sound: unknown }).__sound = { played: [] }));
  await page.goto('/#/songs');
});

const chordTexts = (page: import('@playwright/test').Page) => page.locator('[data-testid="song-chord"]:not([data-empty])').allInnerTexts();

test('the sample song shows its key, chords as numbers and a line per section', async ({ page }) => {
  await page.getByTestId('songs-sample').click();
  await expect(page.getByTestId('song-key')).toHaveText('G major');
  const chords = (await chordTexts(page)).map((t) => t.replace(/\s+/g, ' '));
  expect(chords.slice(0, 4)).toEqual(['G 1', 'D 5', 'Em 6m', 'C 4']);
  await expect(page.getByTestId('song-summary')).toContainText('1 – 5 – 6m – 4');
  const lines = page.getByTestId('section-line');
  await expect(lines.first()).toContainText('It goes 1 – 5 – 6m – 4');
  await expect(lines.nth(1)).toContainText('The same chords as section 1');
});

test('a MIDI file opens, and a tapped chord lights its keys and can be fixed', async ({ page }) => {
  const bytes = writeMidiFile(sampleNotes(), { title: 'My song', bpm: 92 });
  await page.getByTestId('songs-file').setInputFiles({ name: 'My song.mid', mimeType: 'audio/midi', buffer: Buffer.from(bytes) });
  await expect(page.getByTestId('song-key')).toHaveText('G major');

  // Tap D: the keyboard shows D F# A.
  await page.locator('[data-testid="song-chord"]:not([data-empty])').nth(1).click();
  await expect(page.getByTestId('song-now')).toContainText('D');
  await expect(page.getByTestId('song-fix')).toBeVisible();
  // D, F# and A (and the D bass) are lit on the keyboard.
  await expect(page.locator('[data-note="62"][data-mark="target"]')).toBeVisible();
  await expect(page.locator('[data-note="66"][data-mark="target"]')).toBeVisible();
  await expect(page.locator('[data-note="69"][data-mark="target"]')).toBeVisible();

  // Say it was D7: the chord and the summary change.
  await page.getByTestId('song-fix-quality').selectOption('7');
  await expect(page.locator('[data-testid="song-chord"]:not([data-empty])').nth(1)).toContainText('D7');
  await expect(page.getByTestId('song-fix')).toContainText('Set by you');
  await page.getByTestId('song-fix-reset').click();
  await expect(page.locator('[data-testid="song-chord"]:not([data-empty])').nth(1)).not.toContainText('D7');

  // Change the key: the numbers count from the new key.
  await page.getByTestId('song-key-select').selectOption('C');
  await expect(page.getByTestId('song-key')).toHaveText('C major');
  expect((await chordTexts(page))[0]!.replace(/\s+/g, ' ')).toBe('G 5');
});

test('looping a section keeps playing that part', async ({ page }) => {
  await page.getByTestId('songs-sample').click();
  await page.getByTestId('section-loop').first().click();
  await expect(page.getByTestId('song-loop-band')).toBeVisible();
  const range = await page.getByTestId('loop-range').innerText();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __sound: { played: unknown[] } }).__sound.played.length)).toBeGreaterThan(0);
  await page.getByTestId('song-stop').click();
  await page.getByTestId('loop-clear').click();
  await expect(page.getByTestId('song-loop-band')).toHaveCount(0);
  expect(range).toMatch(/0:0\d to 0:\d+/);
});

test('a file that is not music says so in plain words', async ({ page }) => {
  await page.getByTestId('songs-file').setInputFiles({ name: 'notes.mid', mimeType: 'audio/midi', buffer: Buffer.from('hello') });
  await expect(page.getByTestId('songs-error')).toContainText("doesn't look like a MIDI file");
  await page.getByTestId('songs-file').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await expect(page.getByTestId('songs-error')).toContainText('could not open that file');
});
