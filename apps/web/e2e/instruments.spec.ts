import { expect, test } from '@playwright/test';
import { fakeApi, LESSON } from './fake-api.js';

test.describe('first-run instruments', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('asks before showing an input and keeps the guitar choice across reloads', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('instrument-picker')).toBeVisible();
    for (const name of ['A grand piano', 'An acoustic guitar']) {
      const image = page.getByRole('img', { name, exact: true });
      await expect(image).toBeVisible();
      await expect.poll(() => image.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    }
    await expect(page.getByTestId('piano')).toHaveCount(0);
    await expect(page.getByTestId('fretboard')).toHaveCount(0);
    await page.getByTestId('choose-guitar').click();
    await expect(page.getByTestId('fretboard')).toBeVisible();
    await expect(page.getByTestId('instrument-header')).toHaveValue('guitar');
    await expect(page.getByTestId('guitar-microphone')).toHaveText('Start microphone');
    await page.reload();
    await expect(page.getByTestId('instrument-picker')).toHaveCount(0);
    await expect(page.getByTestId('fretboard')).toBeVisible();
  });

  test('keeps returning learners on piano without another onboarding step', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('music.settings.v1', JSON.stringify({ theme: 'light', keyboardSize: 49 })));
    await page.goto('/');
    await expect(page.getByTestId('piano')).toBeVisible();
    await expect(page.getByTestId('instrument-picker')).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('piano')).toBeVisible();
    await expect(page.getByTestId('size-select')).toHaveValue('49');
  });
});

test('switches the whole app, clears held notes, and switches back from settings', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-note="60"]').click();
  await expect(page.getByTestId('display-main')).toHaveText('C4');
  await page.getByTestId('instrument-header').selectOption('guitar');
  await expect(page.getByTestId('piano')).toHaveCount(0);
  await expect(page.getByTestId('fretboard')).toBeVisible();
  await expect(page.getByTestId('display-kind')).toHaveText('Waiting for you');
  await expect(page.getByTestId('nav-daily')).toHaveCount(0);
  await page.getByTestId('fret-1-0').click();
  await expect(page.getByTestId('display-main')).toHaveText('E4');
  // Moving a fret releases the old pitch, rather than adding a second note on one string.
  await page.getByTestId('fret-1-3').click();
  await expect(page.getByTestId('display-main')).toHaveText('G4');
  await page.getByTestId('nav-settings').click();
  await expect(page.getByTestId('settings-size')).toHaveCount(0);
  await page.getByTestId('instrument-settings').selectOption('piano');
  await expect(page.getByTestId('settings-size')).toBeVisible();
  await expect(page.getByTestId('piano')).toBeVisible();
  await page.getByTestId('nav-chords').click();
  await expect(page.getByTestId('display-kind')).toHaveText('Waiting for you');
});

test('grades guitar tap input in a lesson and saves the instrument with the attempt', async ({ page }) => {
  const api = await fakeApi(page, { signedIn: true });
  const guitarLesson = { ...LESSON, instrument: 'guitar', title: 'The open low E string', steps: [
    { type: 'show', title: 'Open E', body: 'This is the thickest string.', highlightMidi: [40] },
    { type: 'play-along', title: 'Play E', items: [{ kind: 'find-note', id: 'guitar-e', prompt: 'Play the open low E.', midi: 40 }] },
  ] };
  await page.route((url) => url.pathname === `/api/curriculum/lessons/${LESSON.id}`, (route) => route.fulfill({ json: guitarLesson }));
  await page.goto('/');
  await page.getByTestId('instrument-header').selectOption('guitar');
  await page.goto(`/#/lesson/${LESSON.id}`);
  await expect(page.getByTestId('lesson-title')).toHaveText(guitarLesson.title);
  await expect(page.getByTestId('fret-6-0')).toHaveAttribute('data-mark', 'target');
  await expect(page.getByTestId('piano')).toHaveCount(0);
  await page.getByTestId('next').click();
  await expect(page.getByTestId('prompt')).toHaveText('Play the open low E.');
  await page.getByTestId('fret-6-0').focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => api.attempts.length).toBe(1);
  expect(api.attempts[0]).toMatchObject({ instrument: 'guitar', played: [40], correct: true });
  expect(api.sessions[0]).toMatchObject({ instrument: 'guitar' });
});

test('requests guitar curriculum/progress and blocks a piano-only deep link', async ({ page }) => {
  const paths: string[] = [];
  await page.route((url) => url.pathname.startsWith('/api/'), (route) => {
    const url = new URL(route.request().url()); paths.push(url.pathname + url.search);
    return route.fulfill({ json: [] });
  });
  await page.goto('/');
  await page.getByTestId('instrument-header').selectOption('guitar');
  await page.getByTestId('nav-lessons').click();
  await expect.poll(() => paths).toContain('/api/curriculum/units?instrument=guitar');
  await expect.poll(() => paths).toContain('/api/progress/?instrument=guitar');
  await expect.poll(() => paths).toContain('/api/progress/review-queue?instrument=guitar');
  await page.goto('/#/daily');
  await expect(page.getByRole('heading', { name: 'This view is for piano' })).toBeVisible();
  await expect(page.getByTestId('fretboard')).toHaveCount(0);
});

test('handles denied mic access while keeping tap input usable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: () => Promise.reject(new DOMException('Denied', 'NotAllowedError')), configurable: true,
    });
  });
  await page.goto('/');
  await page.getByTestId('instrument-header').selectOption('guitar');
  await page.getByTestId('guitar-microphone').click();
  await expect(page.getByTestId('guitar-mic-status')).toContainText('Microphone access was denied');
  await page.getByTestId('fret-6-0').click();
  await expect(page.getByTestId('display-main')).toHaveText('E2');
});

test('feeds microphone notes into the shared input and releases capture on instrument switch', async ({ page }) => {
  await page.addInitScript(() => {
    const mic = { requests: 0, stops: 0, closes: 0, frequency: 110 };
    Object.assign(window, { __mic: mic, __sound: { played: [] } });
    const track = { stop: () => { mic.stops++; }, addEventListener: () => {}, removeEventListener: () => {} };
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => {
      mic.requests++; return { getTracks: () => [track] };
    } });
    class MicrophoneContext {
      sampleRate = 48000;
      async resume() {}
      async close() { mic.closes++; }
      createMediaStreamSource() { return { connect: () => {}, disconnect: () => {} }; }
      createAnalyser() { return {
        fftSize: 4096, disconnect: () => {},
        getFloatTimeDomainData: (samples: Float32Array) => {
          for (let i = 0; i < samples.length; i++) samples[i] = 0.4 * Math.sin(2 * Math.PI * mic.frequency * i / 48000);
        },
      }; }
    }
    Object.defineProperty(window, 'AudioContext', { value: MicrophoneContext, configurable: true });
  });
  await page.goto('/');
  await page.getByTestId('instrument-header').selectOption('guitar');
  const mic = () => page.evaluate(() => (window as unknown as { __mic: { requests: number; stops: number; closes: number } }).__mic);
  expect((await mic()).requests).toBe(0);
  await page.getByTestId('guitar-microphone').click();
  await expect(page.getByTestId('guitar-pitch')).toContainText('A2');
  await expect(page.getByTestId('display-main')).toHaveText('A2');
  await expect(page.getByTestId('fret-5-0')).toHaveAttribute('data-heard', 'true');
  await page.evaluate(async () => {
    const modulePath = '/src/audio/playback.ts';
    const { beginPlayback } = await import(/* @vite-ignore */ modulePath);
    Object.assign(window, { __finishReference: beginPlayback() });
  });
  await expect(page.getByTestId('display-kind')).toHaveText('Waiting for you');
  expect((await mic()).stops).toBe(0);
  await page.evaluate(() => (window as unknown as { __finishReference: () => void }).__finishReference());
  await expect(page.getByTestId('display-main')).toHaveText('A2');
  await page.getByTestId('instrument-header').selectOption('piano');
  await expect.poll(mic).toMatchObject({ requests: 1, stops: 1, closes: 1 });
  await expect(page.getByTestId('display-kind')).toHaveText('Waiting for you');
  await page.getByTestId('instrument-header').selectOption('guitar');
  await expect(page.getByTestId('guitar-microphone')).toHaveText('Start microphone');
  expect((await mic()).requests).toBe(1);
});
