import { expect, test, type Page } from '@playwright/test';
import type { TestItem } from '@music/contracts';
import { chordShapeMidi, OPEN_CHORD_SHAPES, midiToPositions, pretty, STANDARD_TUNING } from '@music/theory';
import { buildApp } from '../../../services/curriculum/src/app.js';
import { loadCurriculum } from '../../../services/curriculum/src/content.js';
import { computeProgress, NO_COMPLETIONS } from '../../../services/progress/src/unlocks.js';
import { fakeApi, nextItemSessionId } from './fake-api.js';

const curriculum = loadCurriculum();
const unit = curriculum.unitsById.get('guitar-4')!;
const app = buildApp({ logger: false });
const USER = '00000000-0000-4000-8000-000000000001';

async function course(page: Page, prerequisitesPassed = true) {
  const api = await fakeApi(page, { signedIn: true });
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api/, '');
    if (path.startsWith('/curriculum/')) {
      const response = await app.inject({ url: path.replace('/curriculum', '') + url.search });
      return route.fulfill({ status: response.statusCode, contentType: 'application/json', body: response.body });
    }
    if (path === '/progress/') return route.fulfill({ json: computeProgress(USER, curriculum.units, {
      ...NO_COMPLETIONS, checkpointsPassed: new Set(prerequisitesPassed ? ['guitar-intro', 'guitar-1', 'guitar-2', 'guitar-3'] : curriculum.units.filter((u) => (u.instrument ?? 'piano') === 'piano').map((u) => u.id)),
    }, 'guitar') });
    if (path === '/progress/review-queue') return route.fulfill({ json: [] });
    if (api.sessions.at(-1)?.kind === 'checkpoint' && nextItemSessionId(path)) {
      const answered = new Set(api.attempts.filter((a) => a.correct).map((a) => a.itemId));
      return route.fulfill({ json: unit.checkpoint.items.find((i) => !answered.has(i.id)) ?? null });
    }
    if (/^\/practice\/sessions\/[^/]+\/end$/.test(path)) {
      const count = api.attempts.filter((a) => a.correct).length;
      const session = api.sessions.at(-1)!;
      const now = new Date().toISOString();
      return route.fulfill({ json: { session: { ...session, userId: USER, startedAt: now, endedAt: now },
        summary: { total: count, answered: count, firstTryCorrect: count, accuracy: 100, passed: true } } });
    }
    return route.fallback();
  });
  await page.goto('/');
  await page.getByTestId('instrument-header').selectOption('guitar');
  return api;
}

async function pluck(page: Page, midi: number) {
  const pos = midiToPositions(STANDARD_TUNING, midi, 12).at(-1)!;
  await page.getByTestId(`fret-${pos.string}-${pos.fret}`).click();
}

async function answer(page: Page, item: TestItem, shapeName?: string) {
  await expect(page.getByTestId('prompt')).toHaveText(pretty(item.prompt));
  if (item.kind === 'name-it') await page.getByRole('button', { name: pretty(item.answer), exact: true }).click();
  else if (item.kind === 'find-note') await pluck(page, item.midi!);
  else if (item.kind === 'play-interval') {
    await pluck(page, item.startMidi!);
    await pluck(page, item.startMidi! + item.semitones);
  } else if (item.kind === 'build-chord') {
    const shape = OPEN_CHORD_SHAPES.find((s) => s.name === shapeName);
    if (shape) {
      // Tap every played string from the actual diagram, including repeated notes.
      for (const [i, fret] of shape.frets.entries()) {
        if (fret !== null) await page.getByTestId(`fret-${6 - i}-${fret}`).click();
      }
    } else {
      // Use three nearby strings, with a different octave from the shown triad.
      const positions: Record<number, [number, number]> = { 0: [2, 1], 4: [1, 0], 7: [3, 0], 9: [3, 2], 8: [3, 1], 11: [2, 0], 2: [4, 0] };
      for (const pc of item.pitchClasses) {
        const [string, fret] = positions[pc]!;
        await page.getByTestId(`fret-${string}-${fret}`).click();
      }
    }
  } else throw new Error('Unexpected chords-unit item kind');
}

for (const id of unit.lessonIds) {
  test(`teaches and grades ${id} on the fretboard`, async ({ page }) => {
    test.setTimeout(60_000);
    const api = await course(page);
    const lesson = curriculum.lessonsById.get(id)!;
    if (id === 'g4-l8') await page.getByTestId('theme').click();
    await page.goto(`/#/lesson/${id}`);
    await expect(page.getByTestId('lesson-title')).toHaveText(lesson.title);
    if (lesson.guitarChord) {
      await expect(page.getByTestId('guitar-chord-diagram')).toContainText('string 6');
      await expect(page.getByTestId('guitar-chord-diagram').getByRole('img')).toBeVisible();
    }
    if (id === 'g4-l6' || id === 'g4-l8') await page.screenshot({ path: `/tmp/music-chord-${id}.png`, fullPage: true });
    for (const step of lesson.steps) {
      await expect(page.getByTestId('step-title')).toHaveText(pretty(step.title));
      if (lesson.guitarChord) await expect(page.getByTestId('guitar-chord-diagram')).toBeVisible();
      if (step.type === 'play-along' || step.type === 'quiz') {
        for (const item of step.items) await answer(page, item, lesson.guitarChord);
        await expect(page.getByTestId('step-complete')).toBeVisible();
      } else await expect(page.getByTestId('fretboard')).toBeVisible();
      if (step.type !== 'quiz') await page.getByTestId('next').click();
    }
    await page.getByTestId('finish').click();
    await expect(page.getByTestId('summary')).toBeVisible();
    expect(api.attempts.length).toBeGreaterThanOrEqual(3);
    if (lesson.guitarChord) {
      const expected = [...new Set(chordShapeMidi(STANDARD_TUNING, OPEN_CHORD_SHAPES.find((s) => s.name === lesson.guitarChord)!))].sort((a, b) => a - b);
      for (const attempt of api.attempts.filter((a) => a.itemKind === 'build-chord')) {
        // Grading settles as soon as all three pitch classes sound; repeated strings are optional.
        expect((attempt.played as number[]).every((n) => expected.includes(n))).toBe(true);
        expect([...new Set((attempt.played as number[]).map((n) => n % 12))].sort((a, b) => a - b)).toEqual([...new Set(expected.map((n) => n % 12))].sort((a, b) => a - b));
      }
    }
    expect(api.attempts.every((a) => a.correct && a.instrument === 'guitar' && String(a.skill).startsWith('g:'))).toBe(true);

  });
}

test('the chords checkpoint requires the preceding guitar unit and grades its real questions', async ({ page }) => {
  test.setTimeout(60_000);
  const api = await course(page);
  await page.getByTestId('nav-lessons').click();
  await expect(page.getByTestId('unit-guitar-4')).toHaveAttribute('data-unlocked', 'true');
  await expect(page.getByTestId('unit-guitar-4')).toContainText('Unit 5');
  await page.getByTestId('checkpoint-guitar-4').click();
  for (const item of unit.checkpoint.items) await answer(page, item);
  await expect(page.getByTestId('summary')).toBeVisible();
  expect(api.attempts).toHaveLength(10);
  expect(api.attempts.every((a) => a.correct && a.instrument === 'guitar' && String(a.skill).startsWith('g:'))).toBe(true);
});

test('piano progress cannot open the new guitar chords unit', async ({ page }) => {
  await course(page, false);
  await page.getByTestId('nav-lessons').click();
  await expect(page.getByTestId('unit-guitar-4')).toHaveAttribute('data-unlocked', 'false');
  await expect(page.getByTestId('unit-locked-guitar-4')).toContainText('Pass the Unit 4 test');
  await expect(page.getByTestId('checkpoint-guitar-4')).toBeDisabled();
});


test('an extra chord tone is rejected and a different correct voicing succeeds on retry', async ({ page }) => {
  const api = await course(page);
  await page.goto('/#/lesson/g4-l1');
  await page.getByTestId('next').click();
  await page.getByTestId('next').click();
  for (const [string, fret] of [[4, 0], [3, 0], [2, 1]]) await page.getByTestId(`fret-${string}-${fret}`).click();
  await expect(page.getByTestId('item-message')).toBeVisible();
  await expect.poll(() => api.attempts.length).toBe(1);
  expect(api.attempts[0]).toMatchObject({ correct: false, played: [50, 55, 60] });
  await page.keyboard.press('Escape');
  for (const [string, fret] of [[3, 0], [2, 1], [1, 0]]) await page.getByTestId(`fret-${string}-${fret}`).click();
  await expect(page.getByTestId('step-complete')).toBeVisible();
  await expect.poll(() => api.attempts.length).toBe(2);
  expect(api.attempts[1]).toMatchObject({ correct: true, played: [55, 60, 64], instrument: 'guitar', retried: true });
  expect(String(api.attempts[1]!.skill)).toMatch(/^g:/);
});
