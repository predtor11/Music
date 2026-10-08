import { defineConfig, devices } from '@playwright/test';

// Set PW_CHROMIUM_PATH to use a Chromium that doesn't match this Playwright
// version (for example /opt/pw-browsers/chromium on the cloud dev boxes).
const executablePath = process.env.PW_CHROMIUM_PATH;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5179',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], ...(executablePath ? { launchOptions: { executablePath } } : {}) } }],
  webServer: {
    command: 'npx vite --port 5179 --strictPort',
    // Sign-in talks to a fake Supabase on the same origin (see e2e/fake-supabase.ts).
    env: { VITE_SUPABASE_URL: 'http://localhost:5179/fake-supabase', VITE_SUPABASE_ANON_KEY: 'test-anon-key' },
    url: 'http://localhost:5179',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
