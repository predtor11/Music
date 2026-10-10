import { expect, N, test } from './fake-midi.js';

test.beforeEach(async ({ page, midi }) => {
  void midi; // installs the fake keyboard
  await page.goto('/');
  await page.getByTestId('midi-connect').click();
  await expect(page.getByTestId('midi-status')).toContainText('Test Keyboard');
});

const main = (page: import('@playwright/test').Page) => page.getByTestId('display-main');

test('names C major from C4 E4 G4', async ({ page, midi }) => {
  await midi.on(N.C4, N.E4, N.G4);
  await expect(main(page)).toHaveText('C');
  await expect(page.getByTestId('chord-full-name')).toHaveText('C major');
  await expect(page.getByTestId('roman')).toHaveText('I');
  await expect(page.getByTestId('nashville')).toHaveText('1');
  await expect(page.locator('[data-note="64"]')).toHaveAttribute('data-active', 'true');
});

test('names the first inversion C/E from E3 G3 C4', async ({ page, midi }) => {
  await midi.on(N.E3, N.G3, N.C4);
  await expect(main(page)).toHaveText('C/E');
  await expect(page.getByTestId('inversion')).toHaveText('1st inversion');
});

test('names Am7 from A3 C4 E4 G4', async ({ page, midi }) => {
  await midi.on(N.A3, N.C4, N.E4, N.G4);
  await expect(main(page)).toHaveText('Am7');
  // the previous chord's name can still be fading out beside the new one
  await expect(page.getByTestId('chord-full-name').last()).toHaveText('A minor 7th');
});

test('shows vi as the Roman numeral for A minor in C', async ({ page, midi }) => {
  await midi.on(N.A3, N.C4, N.E4);
  await expect(main(page)).toHaveText('Am');
  await expect(page.getByTestId('roman')).toHaveText('vi');
  await expect(page.getByTestId('nashville')).toHaveText('6m');
});

test('shows a single note and an interval', async ({ page, midi }) => {
  await midi.on(N.C4);
  await expect(page.getByTestId('display-kind')).toHaveText('Note');
  await expect(main(page)).toHaveText('C4');
  await midi.on(N.E4);
  await expect(page.getByTestId('display-kind')).toHaveText('Interval');
  await expect(main(page)).toHaveText('major 3rd');
  await midi.off(N.C4, N.E4);
  await expect(page.getByTestId('display-kind')).toHaveText('Waiting for you');
});

test('shows sargam Pa on G in C, and moves Sa with the key', async ({ page, midi }) => {
  await page.getByTestId('naming').getByRole('radio', { name: 'Sa Re Ga' }).click();
  await midi.on(N.G4);
  await expect(main(page)).toHaveText('Pa');
  await page.getByTestId('key-select').selectOption('G');
  await expect(main(page)).toHaveText('Sa');
});

test('remembers settings after a reload', async ({ page }) => {
  await page.getByTestId('key-select').selectOption('Eb');
  await page.getByTestId('size-select').selectOption('25');
  await page.reload();
  await expect(page.getByTestId('display-key')).toContainText('E♭ major');
  await expect(page.locator('[data-testid="piano"] button')).toHaveCount(25);
});

test('plays chords with clicks and computer keys when there is no MIDI', async ({ page }) => {
  await page.locator('[data-note="60"]').click();
  await page.locator('[data-note="64"]').click();
  await page.locator('[data-note="67"]').click();
  await expect(main(page)).toHaveText('C');
  await page.getByTestId('clear').click();
  await expect(page.getByTestId('display-kind')).toHaveText('Waiting for you');

  await page.keyboard.down('a');
  await page.keyboard.down('d');
  await page.keyboard.down('g');
  await expect(main(page)).toHaveText('C');
  await page.keyboard.up('a');
  await page.keyboard.up('d');
  await page.keyboard.up('g');
});

test('picks a device when a second keyboard is plugged in', async ({ page, midi }) => {
  await midi.plug('kbd-2', 'Second Keyboard');
  const picker = page.getByTestId('midi-device');
  await expect(picker).toBeVisible();
  await picker.selectOption('kbd-2');
  await midi.send([0x90, N.C4, 100], 'kbd-1');
  await expect(page.getByTestId('display-kind')).toHaveText('Waiting for you');
  await midi.send([0x90, N.C4, 100], 'kbd-2');
  await expect(main(page)).toHaveText('C4');
});

test.describe('without Web MIDI', () => {
  test('explains which browsers work', async ({ browser }) => {
    const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15' });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      localStorage.setItem('music.instrument.chosen.v1', '1');
      Object.defineProperty(navigator, 'requestMIDIAccess', { value: undefined, configurable: true });
    });
    await page.goto('/');
    await expect(page.getByTestId('midi-status')).toHaveText('MIDI not available');
    await expect(page.getByTestId('midi-help')).toContainText('Safari');
    await expect(page.getByTestId('midi-help')).toContainText('Chrome or Edge');
    await ctx.close();
  });
});
