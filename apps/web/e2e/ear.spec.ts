import type { Lesson } from '@music/contracts';
import type { Page } from '@playwright/test';
import { fakeApi } from './fake-api.js';
import { expect, test } from './fake-midi.js';

/** A lesson of by-ear questions, one of each kind. */
const EAR: Lesson = {
  id: 'ear-l1',
  unitId: 'test-unit',
  order: 2,
  title: 'Listening',
  summary: 'Ear test lesson.',
  minutes: 3,
  steps: [
    { type: 'show', title: 'A chord', body: 'Listen to it.', highlightMidi: [60, 64, 67] },
    {
      type: 'quiz',
      title: 'By ear',
      items: [
        { kind: 'find-note', id: 'e1', prompt: 'Find the note you hear.', midi: 64, byEar: true },
        { kind: 'play-interval', id: 'e2', prompt: 'Start on C4, then play the second note you hear.', startMidi: 60, semitones: 4, byEar: true },
        { kind: 'play-scale', id: 'e3', prompt: 'Play back the notes you hear.', sequence: [0, 2, 4], direction: 'up', byEar: true },
        { kind: 'build-chord', id: 'e4', prompt: 'Play the chord you hear.', pitchClasses: [0, 4, 7], bassPc: null, byEar: true },
      ],
    },
  ],
};

type Clip = { kind: string; notes: number[] };

/** Record sound instead of playing it (see src/audio/sound.ts). */
async function stubSound(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __sound: { played: unknown[] } }).__sound = { played: [] };
  });
  return {
    played: () => page.evaluate(() => (window as unknown as { __sound: { played: Clip[] } }).__sound.played),
  };
}

const key = (page: Page, note: number) => page.locator(`[data-testid="piano"] [data-note="${note}"]`);

test('by-ear questions play the answer first and keep it hidden', async ({ page, midi }) => {
  const sound = await stubSound(page);
  const api = await fakeApi(page);
  await page.route('**/api/curriculum/lessons/ear-l1', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(EAR) }));
  await page.goto('/#/lesson/ear-l1');
  await page.getByTestId('header-connect').click();

  // Lesson examples use the piano.
  await page.getByTestId('hear').click();
  await expect.poll(sound.played).toEqual([{ kind: 'chord', notes: [60, 64, 67] }]);
  await page.getByTestId('next').click();

  // Find a note: it plays on its own, nothing is lit or named.
  await expect(page.getByTestId('prompt')).toHaveText('Find the note you hear.');
  await expect(page.getByTestId('by-ear')).toBeVisible();
  await expect.poll(sound.played).toContainEqual({ kind: 'note', notes: [64] });
  await expect(page.locator('[data-testid="piano"] [data-mark]')).toHaveCount(0);
  await expect(page.getByTestId('item-message')).toHaveText('Play back what you heard.');

  await page.getByTestId('play-again').click();
  await expect.poll(async () => (await sound.played()).filter((c) => c.notes[0] === 64 && c.kind === 'note').length).toBe(2);

  // A miss marks only the wrong key and says which way to go.
  await midi.on(67);
  await expect(key(page, 67)).toHaveAttribute('data-mark', 'bad');
  await expect(page.getByTestId('item-message')).toHaveText('Not that one. The note you heard is lower.');
  await expect(key(page, 64)).not.toHaveAttribute('data-mark', /.+/);
  await midi.off(67);

  // Asking to see it reveals the answer and plays it again.
  await page.getByTestId('show-answer').click();
  await expect(key(page, 64)).toHaveAttribute('data-mark', 'missed');
  await expect(page.getByTestId('item-message')).toContainText('E');
  await midi.on(64);
  await expect(key(page, 64)).toHaveAttribute('data-mark', 'good');
  await midi.off(64);

  // Interval: the hint doesn't name the interval.
  await expect(page.getByTestId('prompt')).toHaveText('Start on C4, then play the second note you hear.');
  await expect.poll(sound.played).toContainEqual({ kind: 'sequence', notes: [60, 64] });
  await midi.on(60);
  await expect(page.getByTestId('item-message')).toHaveText('Good. Now the second note you heard.');
  await midi.on(64);
  await expect(page.getByTestId('item-message')).toHaveText('Yes, that’s a major 3rd.'.replace('’', "'"));
  await midi.off(60, 64);

  // Scale.
  await expect(page.getByTestId('prompt')).toHaveText('Play back the notes you hear.');
  await expect.poll(sound.played).toContainEqual({ kind: 'sequence', notes: [60, 62, 64] });
  await midi.on(60);
  await expect(page.getByTestId('item-message')).toHaveText('1 of 3. Keep going.');
  await midi.off(60);
  for (const n of [62, 64]) {
    await midi.on(n);
    await midi.off(n);
  }
  await expect(page.getByTestId('item-message')).toHaveText('Yes, every note in order.');

  // Chord.
  await expect(page.getByTestId('prompt')).toHaveText('Play the chord you hear.');
  await expect.poll(sound.played).toContainEqual({ kind: 'chord', notes: [60, 64, 67] });
  await midi.on(60, 63, 67);
  await expect(page.getByTestId('item-message')).toHaveText('Close: 2 of your notes are in it. Listen again.');
  await midi.off(60, 63, 67);
  await midi.on(60, 64, 67);
  await expect(page.getByTestId('item-message')).toHaveText('Yes, that’s the chord.');
  await midi.off(60, 64, 67);

  await expect(page.getByTestId('step-complete')).toBeVisible();
  await expect.poll(() => api.attempts.map((a) => a.itemId)).toEqual(['e1', 'e1', 'e2', 'e3', 'e4', 'e4']);

  // The physical keyboard makes its own sound, so its notes were never played back.
  expect((await sound.played()).filter((c) => c.kind === 'note' && c.notes[0] !== 64)).toEqual([]);
});

test('the Chord Namer plays clicked keys and the held chord on the piano', async ({ page, midi }) => {
  void midi;
  const sound = await stubSound(page);
  await page.goto('/#/chords');
  await expect(page.getByTestId('hear')).toBeDisabled();
  for (const n of [60, 64, 67]) await key(page, n).click();
  await expect(page.getByTestId('display-main')).toHaveText('C');
  await page.getByTestId('hear').click();
  await expect.poll(sound.played).toEqual([
    { kind: 'note', notes: [60] },
    { kind: 'note', notes: [64] },
    { kind: 'note', notes: [67] },
    { kind: 'chord', notes: [60, 64, 67] },
  ]);
});
