import type { Lesson } from '@music/contracts';
import { fakeApi } from './fake-api.js';
import { expect, test } from './fake-midi.js';

const key = (page: import('@playwright/test').Page, note: number) => page.locator(`[data-testid="piano"] [data-note="${note}"]`);

/** 1-5-6-4 in G: G (G B D), D (D F♯ A), Em (E G B), C (C E G). */
const G = [55, 59, 62];
const D = [50, 54, 57];
const EM = [52, 55, 59];
const C = [60, 64, 67];

const LESSON: Lesson = {
  id: 'prog-l1',
  unitId: 'test-unit',
  order: 2,
  title: 'The 1-5-6-4',
  summary: 'Test lesson.',
  minutes: 3,
  steps: [
    {
      type: 'play-along',
      title: 'Play along',
      items: [{ kind: 'play-progression', id: 'pp1', prompt: 'Play 1-5-6-4 in G.', key: 'G', numerals: ['1', '5', '6', '4'], bpm: 80 }],
    },
    {
      type: 'quiz',
      title: 'From the numbers alone',
      items: [{ kind: 'play-progression', id: 'pq1', prompt: 'Play 1-5-6-4 in G.', key: 'G', numerals: ['1', '5', '6', '4'] }],
    },
  ],
};

test('plays 1-5-6-4 in G on the virtual keyboard and with MIDI, explains a wrong chord, and saves attempts', async ({ page, midi }) => {
  const api = await fakeApi(page);
  await page.route('**/api/curriculum/lessons/prog-l1', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(LESSON) }));
  await page.goto(`/#/lesson/${LESSON.id}`);
  await page.getByTestId('header-connect').click();

  // Play-along: numerals with chord names, the chord to play lit, a click with a tempo.
  await expect(page.getByTestId('prompt')).toHaveText('Play 1-5-6-4 in G.');
  await expect(page.getByTestId('chord-name-2')).toHaveText('Em');
  await expect(page.getByTestId('chord-0')).toHaveAttribute('data-state', 'current');
  await expect(page.getByTestId('click-toggle')).toContainText('80 bpm');
  for (const n of G) await expect(key(page, n)).toHaveAttribute('data-mark', 'target');

  // Clicked keys stay down; each right chord lifts them for the next.
  for (const [i, chord] of [G, D, EM, C].entries()) {
    for (const n of chord) await key(page, n).click();
    await expect(page.getByTestId(`chord-${i}`)).toHaveAttribute('data-state', 'good');
  }
  await expect(page.getByTestId('item-message')).toHaveText('Yes! 1-5-6-4 in G: G, D, Em, C.');
  await expect(page.getByTestId('step-complete')).toBeVisible();
  await page.getByTestId('next').click();

  // Quiz: numerals only; names fill in as he plays.
  await expect(page.getByTestId('chord-name-1')).toHaveText('?');
  await expect(key(page, 55)).not.toHaveAttribute('data-mark', /.+/);
  await midi.on(...G);
  await expect(page.getByTestId('chord-name-0')).toHaveText('G');
  await midi.off(...G);
  // Any voicing: D in first inversion.
  await midi.on(54, 57, 62);
  await expect(page.getByTestId('chord-1')).toHaveAttribute('data-state', 'good');
  await midi.off(54, 57, 62);
  await midi.on(...EM);
  await expect(page.getByTestId('chord-2')).toHaveAttribute('data-state', 'good');
  await midi.off(...EM);
  // A wrong chord: D again instead of C.
  await midi.on(...D);
  await expect(page.getByTestId('chord-3')).toHaveAttribute('data-state', 'missed');
  await expect(page.getByTestId('item-message')).toHaveText("That's D, the 5 chord. C (4 in G) is C, E and G.");
  await expect(key(page, 50)).toHaveAttribute('data-mark', 'bad');
  await midi.off(...D);
  await midi.on(...C);
  await expect(page.getByTestId('item-message')).toHaveText('Yes! 1-5-6-4 in G: G, D, Em, C.');
  await midi.off(...C);

  await page.getByTestId('finish').click();
  await expect(page.getByTestId('summary')).toBeVisible();

  expect(api.attempts.map((a) => [a.itemId, a.correct, a.retried, a.mistake])).toEqual([
    ['pp1', true, false, null],
    ['pq1', false, false, 'missing-notes'],
    ['pq1', true, true, null],
  ]);
  expect(api.attempts[0]).toMatchObject({ itemKind: 'play-progression', skill: 'progression:1-5-6-4', played: [...G, ...D, ...EM, ...C] });
});
