import { expect, test, type Page } from '@playwright/test';
import type { TestItem, Unit } from '@music/contracts';
import { chordFromNumeral, chordShapeMidi, GUITAR_CHORD_SHAPES, parseKey, midiToPositions, pretty, STANDARD_TUNING } from '@music/theory';
import { buildApp } from '../../../services/curriculum/src/app.js';
import { loadCurriculum } from '../../../services/curriculum/src/content.js';
import { computeProgress, NO_COMPLETIONS } from '../../../services/progress/src/unlocks.js';
import { fakeApi, nextItemSessionId } from './fake-api.js';

const curriculum = loadCurriculum();
const units = curriculum.units.filter((u) => ['guitar-5', 'guitar-6'].includes(u.id));
const app = buildApp({ logger: false });
const USER = '00000000-0000-4000-8000-000000000001';

async function course(page: Page, unit: Unit, guitarPassed = true) {
  const api = await fakeApi(page, { signedIn: true });
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/api/, '');
    if (path.startsWith('/curriculum/')) {
      const response = await app.inject({ url: path.replace('/curriculum', '') + url.search });
      return route.fulfill({ status: response.statusCode, contentType: 'application/json', body: response.body });
    }
    if (path === '/progress/') return route.fulfill({ json: computeProgress(USER, curriculum.units, {
      ...NO_COMPLETIONS, checkpointsPassed: new Set(curriculum.units.filter((u) => guitarPassed ? u.instrument === 'guitar' && u.order < unit.order : (u.instrument ?? 'piano') === 'piano').map((u) => u.id)),
    }, 'guitar') });
    if (path === '/progress/review-queue') return route.fulfill({ json: [] });
    if (api.sessions.at(-1)?.kind === 'checkpoint' && nextItemSessionId(path)) {
      const answered = new Set(api.attempts.filter((a) => a.correct).map((a) => a.itemId));
      return route.fulfill({ json: unit.checkpoint.items.find((i) => !answered.has(i.id)) ?? null });
    }
    if (/^\/practice\/sessions\/[^/]+\/end$/.test(path)) {
      const count = api.attempts.filter((a) => a.correct).length;
      const now = new Date().toISOString();
      return route.fulfill({ json: { session: { ...api.sessions.at(-1)!, userId: USER, startedAt: now, endedAt: now }, summary: { total: count, answered: count, firstTryCorrect: count, accuracy: 100, passed: true } } });
    }
    return route.fallback();
  });
  await page.goto('/');
  await page.getByTestId('instrument-header').selectOption('guitar');
  return api;
}

async function chord(page: Page, pcs: number[]) {
  // Each physical string can supply one note; choose a playable alternate voicing.
  function place(index: number, selected: Array<[number, number]>): Array<[number, number]> | null {
    if (index === pcs.length) return selected;
    for (let fret = 0; fret <= 12; fret++) {
      for (let string = 1; string <= 6; string++) {
        if (selected.some(([s]) => s === string)) continue;
        if ((STANDARD_TUNING.strings[6 - string]! + fret) % 12 !== pcs[index]) continue;
        const result = place(index + 1, [...selected, [string, fret]]);
        if (result) return result;
      }
    }
    return null;
  }
  const positions = place(0, []);
  if (!positions) throw new Error(`No six-string voicing for ${pcs.join(',')}`);
  for (const [string, fret] of positions) await page.getByTestId(`fret-${string}-${fret}`).click();
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
    const shape = GUITAR_CHORD_SHAPES.find((s) => s.name === shapeName);
    if (shape) {
      for (const [i, fret] of shape.frets.entries()) if (fret !== null) await page.getByTestId(`fret-${6 - i}-${fret}`).click();
    } else await chord(page, item.pitchClasses);
  }
  else if (item.kind === 'play-progression') {
    for (const [i, numeral] of item.numerals.entries()) {
      await expect(page.getByTestId(`chord-${i}`)).toHaveAttribute('data-state', 'current');
      await chord(page, chordFromNumeral(numeral, parseKey(item.key)!)!.pitchClasses);
      await expect(page.getByTestId(`chord-${i}`)).toHaveAttribute('data-state', 'good');
    }
  } else throw new Error(`Unexpected harmony item ${item.kind}`);
}

for (const unit of units) {
  for (const id of unit.lessonIds) {
    test(`teaches and grades ${id} without piano prerequisites`, async ({ page }) => {
      test.setTimeout(120_000);
      const api = await course(page, unit);
      const lesson = curriculum.lessonsById.get(id)!;
      if (lesson.order % 2 === 0) await page.getByTestId('theme').click();
      await page.goto(`/#/lesson/${id}`);
      await expect(page.getByTestId('lesson-title')).toHaveText(lesson.title);
      if (lesson.guitarChord) {
        await expect(page.getByTestId('guitar-chord-diagram')).toContainText(pretty(lesson.guitarChord));
        await expect(page.getByTestId('guitar-chord-diagram').getByRole('img')).toHaveAttribute('aria-label', new RegExp(`^${pretty(lesson.guitarChord)} chord`));
        if (lesson.guitarChord === 'Bm7b5') {
          await expect(page.getByTestId('guitar-barre')).toHaveAttribute('d', 'M124 86H232');
          await expect(page.getByTestId('guitar-chord-diagram')).toContainText('strings 5 through 3 at fret 2');
        }
        if (['Cmaj7', 'G7', 'Bm7b5'].includes(lesson.guitarChord)) await page.screenshot({ path: `/tmp/music-seventh-${lesson.guitarChord}.png`, fullPage: true });
      }
      for (const step of lesson.steps) {
        await expect(page.getByTestId('step-title')).toHaveText(pretty(step.title));
        await expect(page.getByTestId('fretboard')).toBeVisible();
        if (lesson.guitarChord) await expect(page.getByTestId('guitar-chord-diagram')).toBeVisible();
        if (step.type === 'play-along' || step.type === 'quiz') {
          for (const item of step.items) await answer(page, item, lesson.guitarChord);
          await expect(page.getByTestId('step-complete')).toBeVisible();
        }
        if (step.type !== 'quiz') await page.getByTestId('next').click();
      }
      await page.getByTestId('finish').click();
      await expect(page.getByTestId('summary')).toBeVisible();
      expect(api.attempts.length).toBeGreaterThanOrEqual(3);
      if (lesson.guitarChord) {
        const notes = chordShapeMidi(STANDARD_TUNING, GUITAR_CHORD_SHAPES.find((s) => s.name === lesson.guitarChord)!);
        for (const attempt of api.attempts.filter((a) => a.itemKind === 'build-chord')) {
          expect((attempt.played as number[]).every((n) => notes.includes(n))).toBe(true);
          expect([...new Set((attempt.played as number[]).map((n) => n % 12))].sort()).toEqual([...new Set(notes.map((n) => n % 12))].sort());
        }
      }
      expect(api.attempts.every((a) => a.correct && a.instrument === 'guitar' && String(a.skill).startsWith('g:'))).toBe(true);
    });
  }
  test(`${unit.id} checkpoint grades all real questions on the fretboard`, async ({ page }) => {
    test.setTimeout(180_000);
    const api = await course(page, unit);
    await page.getByTestId('nav-lessons').click();
    await expect(page.getByTestId(`unit-${unit.id}`)).toHaveAttribute('data-unlocked', 'true');
    await expect(page.getByTestId(`unit-${unit.id}`)).toContainText(`Unit ${unit.order}`);
    await page.getByTestId(`checkpoint-${unit.id}`).click();
    for (const item of unit.checkpoint.items) await answer(page, item);
    await expect(page.getByTestId('summary')).toBeVisible();
    expect(api.attempts).toHaveLength(unit.checkpoint.items.length);
    expect(api.attempts.every((a) => a.correct && a.instrument === 'guitar' && String(a.skill).startsWith('g:'))).toBe(true);
  });
  test(`piano completions cannot unlock ${unit.id}`, async ({ page }) => {
    await course(page, unit, false);
    await page.getByTestId('nav-lessons').click();
    await expect(page.getByTestId(`unit-${unit.id}`)).toHaveAttribute('data-unlocked', 'false');
    await expect(page.getByTestId(`unit-locked-${unit.id}`)).toContainText(`Pass the Unit ${unit.order - 1} test`);
    await expect(page.getByTestId(`checkpoint-${unit.id}`)).toBeDisabled();
  });
}

test('a wrong progression chord can be cleared and retried with another voicing', async ({ page }) => {
  const api = await course(page, units[0]!);
  await page.goto('/#/lesson/g5-l7');
  await page.getByTestId('next').click();
  await page.getByTestId('next').click();
  await chord(page, [0, 4, 7]);
  await expect(page.getByTestId('chord-0')).toHaveAttribute('data-state', 'missed');
  await page.keyboard.press('Escape');
  await chord(page, [7, 11, 2]);
  await expect(page.getByTestId('chord-0')).toHaveAttribute('data-state', 'good');
  await chord(page, [2, 6, 9]);
  await expect(page.getByTestId('chord-1')).toHaveAttribute('data-state', 'good');
  await chord(page, [7, 11, 2]);
  await expect(page.getByTestId('step-complete')).toBeVisible();
  expect(api.attempts.map((a) => [a.correct, a.retried])).toEqual([[false, false], [true, true]]);
  expect(api.attempts.every((a) => a.instrument === 'guitar' && String(a.skill).startsWith('g:'))).toBe(true);
});
