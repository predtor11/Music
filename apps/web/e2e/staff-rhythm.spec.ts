import type { Lesson, TestItem } from '@music/contracts';
import type { Page, Route } from '@playwright/test';
import { expect, test } from './fake-midi.js';
import { signedInAs } from './fake-supabase.js';

const SESSION_ID = '22222222-2222-4222-8222-222222222222';

/** Serves one lesson with the given items and records attempts. */
async function serveLesson(page: Page, id: string, step: 'play-along' | 'quiz', items: TestItem[]) {
  const lesson: Lesson = { id, unitId: 'u8', order: 1, title: 'Staff and rhythm', summary: 'Test.', minutes: 3, steps: [{ type: step, title: 'Read and tap', items }] };
  const attempts: Array<Record<string, unknown>> = [];
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, '');
    if (path === `/curriculum/lessons/${id}`) return json(route, lesson);
    if (path === '/practice/sessions') return json(route, { id: SESSION_ID, userId: '00000000-0000-4000-8000-000000000001', kind: 'lesson', refId: id, startedAt: new Date().toISOString(), endedAt: null }, 201);
    if (path === '/practice/attempts') {
      attempts.push(route.request().postDataJSON() as Record<string, unknown>);
      return json(route, {}, 201);
    }
    return json(route, { message: 'no fake' }, 404);
  });
  await signedInAs(page);
  await page.goto(`/#/lesson/${id}`);
  await page.getByTestId('header-connect').click();
  return attempts;
}

const key = (page: Page, note: number) => page.locator(`[data-testid="piano"] [data-note="${note}"]`);
const notesOnStaff = (page: Page) => page.locator('[data-testid="staff"] .vf-stavenote');

test('read-staff: draws the note, explains a wrong one, and passes the right one', async ({ page, midi }) => {
  const attempts = await serveLesson(page, 'staff-1', 'play-along', [{ kind: 'read-staff', id: 'r1', prompt: 'Play the note on the staff.', clef: 'treble', midi: [62] }]);

  await expect(page.getByTestId('staff')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByTestId('staff')).toHaveAttribute('data-clef', 'treble');
  await expect(notesOnStaff(page)).toHaveCount(1);
  await expect(notesOnStaff(page).first()).toHaveAttribute('data-keys', 'd/4');
  // Reading means no lit keys until asked.
  await expect(key(page, 62)).not.toHaveAttribute('data-mark', /.+/);
  await page.getByTestId('show-keys').click();
  await expect(key(page, 62)).toHaveAttribute('data-mark', 'target');

  await midi.on(64);
  await expect(page.getByTestId('item-message')).toHaveText('You played E4. The staff shows D4, lower.');
  await expect(key(page, 64)).toHaveAttribute('data-mark', 'bad');
  await expect(key(page, 62)).toHaveAttribute('data-mark', 'missed');
  await expect(notesOnStaff(page)).toHaveCount(2);
  await expect(page.locator('[data-testid="staff"] .vf-stavenote[data-tone="bad"]')).toHaveAttribute('data-keys', 'e/4');
  await midi.off(64);

  await midi.on(74);
  await expect(page.getByTestId('item-message')).toContainText('Right note, wrong octave');
  await midi.off(74);

  await midi.on(62);
  await expect(page.getByTestId('item-message')).toHaveText("Yes, that's D4.");
  await expect(notesOnStaff(page).first()).toHaveAttribute('data-tone', 'good');
  await midi.off(62);
  await expect(page.getByTestId('step-complete')).toBeVisible();

  await expect.poll(() => attempts.length).toBe(3);
  expect(attempts.map((a) => [a.itemKind, a.correct, a.retried, a.mistake, a.played])).toEqual([
    ['read-staff', false, false, 'wrong-note', [64]],
    ['read-staff', false, true, 'wrong-octave', [74]],
    ['read-staff', true, true, null, [62]],
  ]);
  expect(attempts[0]).toMatchObject({ skill: 'staff:treble', expected: [62] });
});

test('read-staff: a chord in the bass clef with a key signature', async ({ page, midi }) => {
  const attempts = await serveLesson(page, 'staff-2', 'quiz', [
    { kind: 'read-staff', id: 'r2', prompt: 'Play this chord.', clef: 'bass', midi: [46, 50, 53], key: 'Bb' },
  ]);
  const staff = page.getByTestId('staff');
  await expect(staff).toHaveAttribute('data-ready', 'true');
  await expect(staff).toHaveAttribute('data-clef', 'bass');
  await expect(staff).toHaveAttribute('data-key', 'Bb');
  await expect(notesOnStaff(page).first()).toHaveAttribute('data-keys', 'bb/2 d/3 f/3');
  // No hints in a quiz.
  await expect(page.getByTestId('show-keys')).toHaveCount(0);

  // An octave too high.
  await midi.on(58, 62, 65);
  await expect(page.getByTestId('item-message')).toContainText('Right notes, but not where the staff puts them');
  await midi.off(58, 62, 65);

  await midi.on(46, 50, 53);
  await expect(page.getByTestId('item-message')).toHaveText("Yes, that's B♭2, D3 and F3.");
  await midi.off(46, 50, 53);
  await expect.poll(() => attempts.map((a) => [a.correct, a.mistake])).toEqual([
    [false, 'wrong-octave'],
    [true, null],
  ]);
});

/**
 * Taps at these beats (plus an offset in ms) after beat 0. Timed in the page:
 * a timer wakes just before each tap and a short spin lands it on the exact
 * millisecond, so a busy test machine doesn't make a tap late.
 */
async function tapAt(page: Page, taps: Array<[beat: number, offsetMs: number]>) {
  const runner = page.getByTestId('tap-rhythm');
  await expect(runner).toHaveAttribute('data-start-ms', /\d/);
  await page.evaluate((list) => {
    const el = document.querySelector('[data-testid="tap-rhythm"]')!;
    const start = Number(el.getAttribute('data-start-ms'));
    const beat = Number(el.getAttribute('data-beat-ms'));
    const midi = (window as unknown as { __midi: { send(d: number[]): void } }).__midi;
    list.forEach(([b, off], i) => {
      const note = 60 + (i % 5);
      const at = start + b * beat + off;
      setTimeout(() => {
        while (performance.now() < at) {
          // Spin to the exact moment.
        }
        midi.send([0x90, note, 100]);
        setTimeout(() => midi.send([0x80, note, 0]), 60);
      }, at - performance.now() - 40);
    });
  }, taps);
}

test('tap-rhythm: counts in, marks a late tap, then passes on time', async ({ page, midi }) => {
  test.setTimeout(45_000);
  void midi;
  const attempts = await serveLesson(page, 'rhythm-1', 'play-along', [
    { kind: 'tap-rhythm', id: 't1', prompt: 'Tap this rhythm.', bpm: 90, timeSignature: [4, 4], onsets: [0, 1, 2, 2.5, 3], toleranceMs: 150 },
  ]);
  const runner = page.getByTestId('tap-rhythm');
  await expect(page.getByTestId('rhythm-staff')).toHaveAttribute('data-ready', 'true');
  // Quarter, quarter, two eighths, quarter: four notes and a beamed pair.
  await expect(page.locator('[data-testid="rhythm-staff"] .vf-stavenote[data-rest="false"]')).toHaveCount(5);
  await expect(page.getByTestId('beat-target')).toHaveCount(5);

  // First try: one tap in the count-in (ignored), and the last note 350 ms late.
  await page.getByTestId('start').click();
  await expect(runner).toHaveAttribute('data-phase', 'tap');
  await tapAt(page, [
    [-2, 0],
    [0, 0],
    [1, 10],
    [2, -10],
    [2.5, 0],
    [3, 350],
  ]);
  await expect(page.getByTestId('rhythm-phase')).toHaveText('Get ready…');
  await expect(page.getByTestId('rhythm-phase')).toHaveText('Tap now');
  await expect(runner).toHaveAttribute('data-phase', 'graded', { timeout: 10_000 });
  await expect(page.getByTestId('item-message')).toHaveText('1 note off the beat.');
  const late = page.locator('[data-testid="tap"][data-tone="bad"]');
  await expect(late).toHaveCount(1);
  const offset = Number(await late.getAttribute('data-offset'));
  expect(offset).toBeGreaterThan(300);
  expect(offset).toBeLessThan(450);
  await expect(late).toContainText('ms late');
  await expect(page.locator('[data-testid="tap"][data-tone="good"]')).toHaveCount(4);
  await expect(page.locator('[data-testid="beat-target"][data-state="missed"]')).toHaveCount(1);

  // Second try, all on time.
  await page.getByTestId('start').click();
  await tapAt(page, [
    [0, 0],
    [1, 0],
    [2, 0],
    [2.5, 0],
    [3, 0],
  ]);
  await expect(page.getByTestId('item-message')).toHaveText('Right on the beat.', { timeout: 10_000 });
  await expect(page.locator('[data-testid="beat-target"][data-state="hit"]')).toHaveCount(5);
  await expect(page.getByTestId('step-complete')).toBeVisible();

  await expect.poll(() => attempts.length).toBe(2);
  expect(attempts.map((a) => [a.itemKind, a.skill, a.correct, a.retried, a.mistake])).toEqual([
    ['tap-rhythm', 'rhythm:4/4', false, false, 'missing-notes'],
    ['tap-rhythm', 'rhythm:4/4', true, true, null],
  ]);
  expect((attempts[1]!.played as number[]).length).toBe(5);
});

test('tap-rhythm: Listen plays it without grading', async ({ page, midi }) => {
  void midi;
  await serveLesson(page, 'rhythm-2', 'play-along', [
    { kind: 'tap-rhythm', id: 't2', prompt: 'Listen, then tap.', bpm: 200, timeSignature: [3, 4], onsets: [0, 1, 2], toleranceMs: 120 },
  ]);
  const runner = page.getByTestId('tap-rhythm');
  await page.getByTestId('listen').click();
  await expect(runner).toHaveAttribute('data-phase', 'listen');
  await expect(page.getByTestId('start')).toBeDisabled();
  await expect(runner).toHaveAttribute('data-phase', 'ready', { timeout: 6000 });
  await expect(page.getByTestId('tap')).toHaveCount(0);
});
