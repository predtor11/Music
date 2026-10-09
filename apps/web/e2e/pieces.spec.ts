import type { Page } from '@playwright/test';
import { writeMidiFile } from '@music/analysis';
import { fakeApi } from './fake-api.js';
import { expect, test } from './fake-midi.js';

const key = (page: Page, note: number) => page.locator(`[data-testid="piano"] [data-note="${note}"]`);

async function tap(midi: { on(n: number): Promise<void>; off(n: number): Promise<void> }, ...notes: number[]) {
  for (const n of notes) {
    await midi.on(n);
    await midi.off(n);
  }
}

test('shows a piece before you play it: key, chords per bar and melody', async ({ page, midi }) => {
  void midi;
  await fakeApi(page);
  await page.goto('/#/pieces');
  await expect(page.getByTestId('nav-pieces')).toHaveAttribute('aria-current', 'page');
  await page.getByTestId('piece-starter-prelude-c').click();
  await expect(page.getByTestId('piece-title')).toHaveText('Prelude in C (opening)');
  await expect(page.getByTestId('piece-key')).toHaveText('C major');
  await expect(page.getByTestId('bar-2')).toContainText('Dm7/C');
  await expect(page.getByTestId('bar-3')).toContainText('G7/B');
  await expect(page.getByTestId('melody')).toContainText('G');
});

test('Wait for me: lights the next key, marks a wrong one, and counts a loop', async ({ page, midi }) => {
  await fakeApi(page);
  await page.addInitScript(() => ((window as unknown as { __sound: unknown }).__sound = { played: [] }));
  await page.goto('/#/pieces/starter-ode-to-joy');
  await page.getByTestId('header-connect').click();
  await page.getByTestId('bar-1').click();
  await expect(page.getByTestId('bar-1')).toHaveAttribute('data-selected', 'true');
  await expect(page.getByTestId('bar-2')).not.toHaveAttribute('data-selected', 'true');
  await page.getByTestId('start').click();

  // Ode to Joy starts E E F G.
  await expect(key(page, 64)).toHaveAttribute('data-mark', 'target');
  await tap(midi, 62);
  await expect(key(page, 62)).toHaveAttribute('data-mark', 'bad');
  await tap(midi, 64, 64);
  await expect(key(page, 65)).toHaveAttribute('data-mark', 'target');
  await tap(midi, 65, 67);
  await expect(page.getByTestId('loop-badge')).toHaveCount(1);
  await expect(page.getByTestId('bar-1').locator('span').last()).toHaveText('1');

  // The left hand's chord needs all three keys.
  await page.getByRole('radio', { name: 'Left hand' }).click();
  await page.getByTestId('start').click();
  await expect(key(page, 48)).toHaveAttribute('data-mark', 'target');
  await midi.on(48);
  await midi.on(52);
  await expect(key(page, 55)).toHaveAttribute('data-mark', 'target');
  await midi.on(55);
  await expect(page.getByTestId('loop-badge')).toHaveCount(2);
});

test('opens your own MIDI file and keeps it', async ({ page, midi }) => {
  void midi;
  await fakeApi(page);
  await page.goto('/#/pieces');
  // A C major chord under a melody, saved as one track.
  const notes = [48, 52, 55].map((m) => ({ midi: m, start: 0, end: 2, velocity: 0.7 }));
  notes.push(...[72, 74, 76, 77].map((m, i) => ({ midi: m, start: i * 0.5, end: i * 0.5 + 0.5, velocity: 0.7 })));
  await page.getByTestId('import-file').setInputFiles({ name: 'my_tune.mid', mimeType: 'audio/midi', buffer: Buffer.from(writeMidiFile(notes, { bpm: 120 })) });
  await expect(page.getByTestId('piece-title')).toHaveText('my tune');
  await expect(page.getByTestId('bar-1')).toContainText('C');
  await page.getByTestId('back').click();
  await expect(page.locator('[data-testid^="piece-import-"]')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('[data-testid^="piece-import-"]')).toHaveCount(1);
});

test('says plainly when a file is not MIDI', async ({ page, midi }) => {
  void midi;
  await fakeApi(page);
  await page.goto('/#/pieces');
  await page.getByTestId('import-file').setInputFiles({ name: 'notes.mid', mimeType: 'audio/midi', buffer: Buffer.from('this is not midi') });
  await expect(page.getByTestId('import-error')).toContainText("Couldn't open notes.mid");
});
