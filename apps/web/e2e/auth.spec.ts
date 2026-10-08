import { expect, test, type Page } from '@playwright/test';
import { fakeApi, LESSON } from './fake-api.js';
import { attachCloud, fakeCloud } from './fake-supabase.js';

const EMAIL = 'jayesh@example.com';
const PASSWORD = 'correct-horse';

async function fillAndSubmit(page: Page, mode: 'Sign in' | 'Create account', email = EMAIL, password = PASSWORD) {
  await page.goto('/#/signin');
  await page.getByTestId('auth-mode').getByRole('radio', { name: mode }).click();
  await page.getByTestId('auth-email').fill(email);
  await page.getByTestId('auth-password').fill(password);
  await page.getByTestId('auth-submit').click();
}

const radio = (page: Page, group: string, name: string) => page.getByTestId(group).getByRole('radio', { name });

test('creates an account, signs in and sends the token on every /api call', async ({ page }) => {
  const cloud = fakeCloud();
  await attachCloud(page, cloud);
  await page.goto('/');
  await expect(page.getByTestId('account')).toHaveText('Sign in');

  await fillAndSubmit(page, 'Create account');
  await expect(page.getByTestId('account')).toHaveAttribute('data-signed-in', 'true');
  await page.getByTestId('account').click();
  await expect(page.getByTestId('account-email')).toHaveText(EMAIL);
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-state', 'saved');

  // Every call after sign-in carried the token (the fake identity service reads the user id from it).
  expect(cloud.apiAuth.length).toBeGreaterThan(0);
  for (const header of cloud.apiAuth) expect(header).toMatch(/^Bearer .+/);
});

test('settings follow you to another browser and survive a reload', async ({ browser }) => {
  const cloud = fakeCloud();
  const first = await browser.newContext();
  await attachCloud(first, cloud);
  const a = await first.newPage();
  await fillAndSubmit(a, 'Create account');
  await expect(a.getByTestId('account')).toHaveAttribute('data-signed-in', 'true');

  await a.goto('/#/settings');
  await expect(a.getByTestId('sync-state')).toHaveAttribute('data-state', 'saved');
  await radio(a, 'settings-naming', 'Sa Re Ga').click();
  await radio(a, 'settings-theme', 'Light').click();
  await a.getByTestId('settings-size').selectOption('49');
  await expect.poll(() => cloud.settings.get(cloud.users.get(EMAIL)!.id)).toMatchObject({ noteNaming: 'sargam', theme: 'light', keyboardSize: 49, lowestNote: 36 });
  expect(cloud.patches.every((p) => !('midiInputId' in p))).toBe(true);
  await expect(a.locator('html')).toHaveAttribute('data-theme', 'light');

  await a.reload();
  await expect(radio(a, 'settings-naming', 'Sa Re Ga')).toHaveAttribute('aria-checked', 'true');
  await expect(a.getByTestId('account-email')).toHaveText(EMAIL);

  // A different browser: nothing in its storage, same account.
  const second = await browser.newContext();
  await attachCloud(second, cloud);
  const b = await second.newPage();
  await fillAndSubmit(b, 'Sign in');
  await expect(b.getByTestId('account')).toHaveAttribute('data-signed-in', 'true');
  await b.goto('/#/settings');
  await expect(radio(b, 'settings-naming', 'Sa Re Ga')).toHaveAttribute('aria-checked', 'true');
  await expect(radio(b, 'settings-theme', 'Light')).toHaveAttribute('aria-checked', 'true');
  await expect(b.getByTestId('settings-size')).toHaveValue('49');
  await expect(b.locator('html')).toHaveAttribute('data-theme', 'light');

  await Promise.all([first.close(), second.close()]);
});

test('signed out, settings stay in this browser', async ({ page }) => {
  await attachCloud(page, fakeCloud());
  await page.goto('/#/settings');
  await expect(page.getByTestId('sync-state')).toHaveAttribute('data-state', 'local');
  await radio(page, 'settings-naming', 'Both').click();
  await page.reload();
  await expect(radio(page, 'settings-naming', 'Both')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('settings-signin')).toBeVisible();
});

test('settings changed while signed out go up to the account on sign-in', async ({ page }) => {
  const cloud = fakeCloud();
  cloud.users.set(EMAIL, { id: '6f1c5f5e-6a43-4b3b-9d3c-0d6c2f8f2f12', password: PASSWORD, confirmed: true });
  await attachCloud(page, cloud);
  await page.goto('/#/settings');
  await radio(page, 'settings-naming', 'Sa Re Ga').click();
  await fillAndSubmit(page, 'Sign in');
  await expect.poll(() => cloud.settings.get('6f1c5f5e-6a43-4b3b-9d3c-0d6c2f8f2f12')?.noteNaming).toBe('sargam');
});

test('explains a wrong password and signs out again', async ({ page }) => {
  const cloud = fakeCloud();
  await attachCloud(page, cloud);
  await fillAndSubmit(page, 'Create account');
  await expect(page.getByTestId('account')).toHaveAttribute('data-signed-in', 'true');
  await page.goto('/#/settings');
  await page.getByTestId('sign-out').click();
  await expect(page.getByTestId('account')).toHaveText('Sign in');

  await fillAndSubmit(page, 'Sign in', EMAIL, 'wrong-password');
  await expect(page.getByTestId('auth-error')).toHaveText("That email and password don't match an account.");
});

test('asks you to confirm your email when the project requires it', async ({ page }) => {
  const cloud = fakeCloud();
  cloud.confirmEmails = true;
  await attachCloud(page, cloud);
  await fillAndSubmit(page, 'Create account');
  await expect(page.getByTestId('confirm-email')).toContainText(EMAIL);
});

test('a lesson asks you to sign in when the server needs it, instead of saying it is offline', async ({ page }) => {
  await fakeApi(page, { practiceNeedsSignIn: true });
  await page.goto(`/#/lesson/${LESSON.id}`);
  await expect(page.getByTestId('save-signin')).toHaveText('Sign in to save your progress');
  await expect(page.getByTestId('offline')).toHaveCount(0);
  await page.getByTestId('save-signin').click();
  await expect(page.getByTestId('page-signin')).toBeVisible();
});

/** A one-question lesson, so finishing it needs only a click. */
const SHORT: typeof LESSON = {
  ...LESSON,
  steps: [{ type: 'quiz', title: 'Quick check', items: [{ kind: 'name-it', id: 'q2', prompt: 'Which key is lit?', shownMidi: [62], choices: ['C', 'D', 'E'], answer: 'D' }] }],
};

async function signedInLesson(page: Page, { attemptsHang = false } = {}) {
  const api = await fakeApi(page, { practiceNeedsSignIn: true });
  await page.route(`**/api/curriculum/lessons/${LESSON.id}`, (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(SHORT) }));
  // A practice service stuck waiting on Redis never answers.
  if (attemptsHang) await page.route('**/api/practice/attempts', () => {});
  const cloud = fakeCloud();
  await attachCloud(page, cloud);
  await fillAndSubmit(page, 'Create account');
  await expect(page.getByTestId('account')).toHaveAttribute('data-signed-in', 'true');
  await page.goto(`/#/lesson/${LESSON.id}`);
  await page.getByTestId('choice-D').click();
  return api;
}

test('finishing a lesson while signed in saves it and shows the score', async ({ page }) => {
  const api = await signedInLesson(page);
  await page.getByTestId('finish').dblclick();
  await expect(page.getByTestId('summary')).toBeVisible();
  await expect(page.getByTestId('summary-signin')).toHaveCount(0);
  await expect(page.getByTestId('summary-offline')).toHaveCount(0);
  expect(api.attempts.map((a) => a.itemId)).toEqual(['q2']);
  // A double press ends the session once.
  expect(api.ended).toHaveLength(1);
});

test('finishing a lesson still shows the score when saving gets stuck', async ({ page }) => {
  const api = await signedInLesson(page, { attemptsHang: true });
  await page.getByTestId('finish').click();
  await expect(page.getByTestId('summary')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('summary-offline')).toBeVisible();
  expect(api.ended).toHaveLength(1);
});
