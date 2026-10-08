import { fakeApi, LESSON } from './fake-api.js';
import { expect, test } from './fake-midi.js';

const key = (page: import('@playwright/test').Page, note: number) => page.locator(`[data-testid="piano"] [data-note="${note}"]`);

test('lists units and lessons, and opens a lesson', async ({ page, midi }) => {
  void midi;
  await fakeApi(page);
  await page.goto('/#/lessons');
  await expect(page.getByTestId('unit-test-unit')).toContainText('The keyboard map');
  await page.getByTestId('lesson-test-l1').click();
  await expect(page.getByTestId('lesson-title')).toHaveText(LESSON.title);
});

test('teaches with text and the virtual keyboard, grades play-along and quiz, and saves attempts', async ({ page, midi }) => {
  const api = await fakeApi(page);
  await page.goto(`/#/lesson/${LESSON.id}`);
  await page.getByTestId('header-connect').click();

  // Explain: text plus the keys it talks about, labelled.
  await expect(page.getByTestId('step-title')).toHaveText('Two black keys');
  await expect(key(page, 60)).toHaveAttribute('data-mark', 'target');
  await expect(key(page, 62)).toContainText('D');
  // The keyboard mirrors the physical one.
  await midi.on(64);
  await expect(key(page, 64)).toHaveAttribute('data-active', 'true');
  await midi.off(64);
  await expect(key(page, 64)).not.toHaveAttribute('data-active', 'true');
  await page.getByTestId('next').click();

  // Show.
  await expect(key(page, 48)).toHaveAttribute('data-mark', 'target');
  await page.getByTestId('next').click();

  // Play-along: the target is lit; a wrong key is marked and explained.
  await expect(page.getByTestId('next')).toBeDisabled();
  await expect(page.getByTestId('prompt')).toHaveText('Play any D.');
  await expect(key(page, 62)).toHaveAttribute('data-mark', 'target');
  await midi.on(64);
  await expect(key(page, 64)).toHaveAttribute('data-mark', 'bad');
  await expect(key(page, 62)).toHaveAttribute('data-mark', 'missed');
  await expect(page.getByTestId('item-message')).toHaveText('You played E. D is one whole step lower.');
  await midi.off(64);
  // Retry.
  await midi.on(62);
  await expect(key(page, 62)).toHaveAttribute('data-mark', 'good');
  await midi.off(62);

  // Interval item moves in by itself.
  await expect(page.getByTestId('prompt')).toHaveText('Play C4, then a whole step up.');
  await midi.on(60);
  await expect(page.getByTestId('item-message')).toContainText('Now play');
  await midi.on(62);
  await expect(page.getByTestId('item-message')).toHaveText('Yes, that’s a major 2nd.'.replace('’', "'"));
  await midi.off(60, 62);
  await expect(page.getByTestId('step-complete')).toBeVisible();
  await page.getByTestId('next').click();

  // Explore names what you play.
  await midi.on(60, 64, 67);
  await expect(page.getByTestId('display-main')).toHaveText('C');
  await midi.off(60, 64, 67);
  await page.getByTestId('next').click();

  // Quiz: no hints; chord graded once held.
  await expect(page.getByTestId('prompt')).toHaveText('Play a C major chord.');
  await expect(key(page, 60)).not.toHaveAttribute('data-mark', /.+/);
  await midi.on(52, 55, 60);
  await expect(page.getByTestId('item-message')).toHaveText("Yes, that’s the chord.");
  await midi.off(52, 55, 60);

  await expect(page.getByTestId('prompt')).toHaveText('Which key is lit?');
  await page.getByTestId('choice-D').click();
  await expect(page.getByTestId('item-message')).toHaveText("Yes, it's D.");
  await page.getByTestId('finish').click();

  await expect(page.getByTestId('summary')).toBeVisible();
  await expect(page.getByTestId('score')).toHaveText('75%');
  await expect(page.getByTestId('passed')).toHaveText('Almost. Try it again to pass.');

  expect(api.sessions).toEqual([{ kind: 'lesson', refId: LESSON.id }]);
  expect(api.attempts.map((a) => [a.itemId, a.correct, a.retried, a.mistake])).toEqual([
    ['p1', false, false, 'wrong-note'],
    ['p1', true, true, null],
    ['p2', true, false, null],
    ['q1', true, false, null],
    ['q2', true, false, null],
  ]);
  expect(api.attempts[0]).toMatchObject({ itemKind: 'find-note', skill: 'note:D', expected: [2], played: [64] });
  expect(api.ended).toHaveLength(1);
});

test('keeps teaching when the practice server is down', async ({ page, midi }) => {
  await fakeApi(page, { practiceDown: true });
  await page.goto(`/#/lesson/${LESSON.id}`);
  await expect(page.getByTestId('offline')).toBeVisible();
  void midi;
});

test('runs a unit test from the practice service', async ({ page, midi }) => {
  const api = await fakeApi(page);
  await page.goto('/#/checkpoint/test-unit');
  await page.getByTestId('header-connect').click();
  await expect(page.getByTestId('prompt')).toHaveText('Play middle C.');
  await expect(key(page, 60)).not.toHaveAttribute('data-mark', /.+/);
  await midi.on(72);
  await expect(page.getByTestId('item-message')).toContainText('wrong octave');
  await page.getByTestId('skip').click();
  await expect(page.getByTestId('prompt')).toHaveText('Play any E.');
  await midi.on(64);
  await expect(page.getByTestId('summary')).toBeVisible();
  await expect(page.getByTestId('score')).toHaveText('50%');
  expect(api.sessions).toEqual([{ kind: 'checkpoint', refId: 'test-unit' }]);
});

test('shows how to start the server when lessons cannot load', async ({ page }) => {
  await page.route((url) => url.pathname.startsWith('/api/'), (r) => r.abort('connectionrefused'));
  await page.goto('/#/lessons');
  await expect(page.getByTestId('load-error')).toContainText('npm run dev:all');
});
