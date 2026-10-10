import type { Page } from '@playwright/test';
import { fakeApi } from './fake-api.js';
import { expect, test } from './fake-midi.js';

type Clip = { kind: string; notes: number[] };

/** Record sound instead of playing it (see src/audio/sound.ts), and fix the random questions. */
async function setup(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __sound: { played: unknown[] } }).__sound = { played: [] };
    (window as unknown as { __earSeed: number }).__earSeed = 7;
  });
  return {
    played: () => page.evaluate(() => (window as unknown as { __sound: { played: Clip[] } }).__sound.played),
  };
}

const key = (page: Page, note: number) => page.locator(`[data-testid="piano"] [data-note="${note}"]`);

test('lists the ear levels and opens one', async ({ page, midi }) => {
  void midi;
  await fakeApi(page);
  await page.goto('/#/ear');
  await expect(page.getByTestId('nav-ear')).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('ear-level-major-minor-root')).toContainText('Major or minor, root given');
  await expect(page.getByTestId('ear-level-major-minor-root')).toHaveAttribute('data-status', 'in-progress');
  await page.getByTestId('ear-level-major-minor-root').click();
  await expect(page.getByTestId('ear-title')).toHaveText('Major or minor, root given');
  await expect(page.getByTestId('ear-count')).toHaveText('Question 1 of 10');
});

test('chords in a key: home, then the mystery chord; a miss is named by number, then the answer is shown', async ({ page, midi }) => {
  const sound = await setup(page);
  const api = await fakeApi(page, { signedIn: true });
  await page.goto('/#/ear/one-four-five');
  await page.getByTestId('header-connect').click();

  // Home chord, the mystery chord, then the mystery chord broken up.
  await expect.poll(async () => (await sound.played()).length).toBe(3);
  const [home, mystery, broken] = await sound.played();
  expect(home!.kind).toBe('chord');
  expect(mystery!.kind).toBe('chord');
  expect(broken).toEqual({ kind: 'sequence', notes: mystery!.notes });
  await expect(page.locator('[data-testid="piano"] [data-mark]')).toHaveCount(0);
  await expect(page.getByTestId('ear-answer')).toHaveCount(0);

  // A wrong chord from the key is named by its number; nothing gives the answer away.
  const wrong = home!.notes.join() === mystery!.notes.join() ? mystery!.notes.map((n) => n + 2) : home!.notes;
  await midi.on(...wrong);
  await expect(page.getByTestId('item-message')).toContainText('Listen again');
  await expect(page.locator('[data-testid="piano"] [data-mark="missed"]')).toHaveCount(0);
  await midi.off(...wrong);

  // The right chord, an octave up, names it and lights it.
  const up = mystery!.notes.map((n) => n + 12);
  await midi.on(...up);
  await expect(page.getByTestId('ear-answer')).toBeVisible();
  await expect(page.getByTestId('ear-answer')).toHaveAttribute('data-right', 'true');
  await midi.off(...up);
  await expect.poll(() => api.attempts.length).toBe(2);
  expect(api.attempts.map((a) => a.correct)).toEqual([false, true]);
  expect(api.attempts[0]!.itemKind).toBe('build-chord');
  expect(api.sessions[0]).toMatchObject({ kind: 'free', refId: 'ear:one-four-five' });

  // Second question: a miss, then "Show me the answer".
  await page.getByTestId('ear-next').click();
  await expect(page.getByTestId('ear-count')).toHaveText('Question 2 of 10');
  await expect(page.getByTestId('ear-dots').locator('li').first()).toHaveAttribute('data-state', 'missed');
  await midi.on(49, 52, 56);
  await expect(page.getByTestId('show-answer')).toBeVisible();
  await midi.off(49, 52, 56);
  await page.getByTestId('show-answer').click();
  await expect(page.getByTestId('ear-answer')).toContainText('The answer');
  await expect(page.getByTestId('answer-detail')).toContainText(/The [145] chord in [CGFD]/);
  await expect(page.locator('[data-testid="piano"] [data-mark="target"]')).toHaveCount(3);
});

test('a full round of major or minor ends with a score that shows on the level list', async ({ page, midi }) => {
  // Ten questions, each with its animations.
  test.setTimeout(90_000);
  const sound = await setup(page);
  await fakeApi(page);
  await page.goto('/#/ear/major-minor-root');
  await page.getByTestId('header-connect').click();

  // Sounds are only ever added, so each step waits for its own new ones.
  let seen = 0;
  const next = async (count: number) => {
    await expect.poll(async () => (await sound.played()).length).toBeGreaterThanOrEqual(seen + count);
    const fresh = (await sound.played()).slice(seen, seen + count);
    seen += count;
    return fresh;
  };
  for (let i = 1; i <= 10; i++) {
    await expect(page.getByTestId('ear-count')).toHaveText(`Question ${i} of 10`);
    const [chord, broken] = await next(2);
    expect(broken).toEqual({ kind: 'sequence', notes: chord!.notes });
    expect(await page.getByTestId('prompt').textContent()).toMatch(/^This chord is built on .+\. Is it major or minor\? Play it\.$/);
    await midi.on(...chord!.notes);
    await expect(page.getByTestId('answer-name')).toHaveText(/ (major|minor)$/);
    await expect(page.getByTestId('ear-answer')).toHaveAttribute('data-right', 'true');
    await midi.off(...chord!.notes);
    await page.getByTestId('compare').click();
    const [major, minor] = await next(2);
    expect(major!.notes[0]).toBe(minor!.notes[0]);
    await page.getByTestId('ear-next').click();
  }

  await expect(page.getByTestId('ear-summary')).toBeVisible();
  await expect(page.getByTestId('score')).toHaveText('100%');
  await page.getByTestId('ear-levels').click();
  await expect(page.getByTestId('ear-best-major-minor-root')).toHaveText('Best 100%');
  await expect(page.getByTestId('ear-level-major-minor-root')).toHaveAttribute('data-status', 'done');
  await expect(page.getByTestId('ear-level-major-minor')).toHaveAttribute('data-status', 'in-progress');
});

test('what key: a note from the key gets a hint, home names the key and shows its scale', async ({ page, midi }) => {
  const sound = await setup(page);
  const api = await fakeApi(page, { signedIn: true });
  await page.goto('/#/ear/key-chords');
  await page.getByTestId('header-connect').click();
  await expect.poll(async () => (await sound.played()).length).toBeGreaterThanOrEqual(4);
  const chords = await sound.played();
  // Every cadence starts and ends on home.
  const homeChord = chords[0]!.notes;
  expect(chords.at(-1)!.notes).toEqual(homeChord);
  const root = homeChord[0]!;

  await midi.on(root + 7);
  await midi.off(root + 7);
  await expect(page.getByTestId('item-message')).toContainText('belongs to the key');
  await midi.on(root + 12);
  await midi.off(root + 12);
  await expect(page.getByTestId('answer-name')).toHaveText(/ major$/);
  await expect(page.getByTestId('answer-detail')).toContainText('Its main chords are');
  await page.getByTestId('hear-scale').click();
  await expect.poll(async () => (await sound.played()).at(-1)!.kind).toBe('sequence');
  // Keys and tunes are scored on this device only.
  expect(api.attempts).toEqual([]);
});

test('play back a tune note by note', async ({ page, midi }) => {
  const sound = await setup(page);
  await fakeApi(page);
  await page.goto('/#/ear/melody');
  await page.getByTestId('header-connect').click();
  await expect.poll(async () => (await sound.played()).length).toBe(1);
  const tune = (await sound.played())[0]!.notes;
  await midi.on(tune[0]!);
  await midi.off(tune[0]!);
  await expect(page.getByTestId('item-message')).toHaveText(`1 of ${tune.length}. Keep going.`);
  await expect(key(page, tune[0]!)).toHaveAttribute('data-mark', 'good');
  for (const n of tune.slice(1)) {
    await midi.on(n);
    await midi.off(n);
  }
  await expect(page.getByTestId('item-message')).toHaveText('Yes, every note.');
  await expect(page.getByTestId('ear-answer')).toHaveAttribute('data-right', 'true');
});

test('progressions use the progression runner by ear', async ({ page, midi }) => {
  void midi;
  await setup(page);
  await fakeApi(page);
  await page.goto('/#/ear/progressions');
  await expect(page.getByTestId('progression')).toBeVisible();
  await expect(page.getByTestId('prompt')).toContainText('Listen, then play it back');
  await expect(page.getByTestId('chord-name-0')).toHaveText('?');
});
