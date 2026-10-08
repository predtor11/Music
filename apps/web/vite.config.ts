import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // Read VITE_* from the repo-root .env that the services share. Only VITE_*
  // values reach the browser, so the service-role key and DB URL stay server-side.
  envDir: fileURLToPath(new URL('../..', import.meta.url)),
  server: {
    port: 5173,
    // The web app only ever calls the gateway.
    proxy: { '/api': 'http://localhost:4000' },
  },
  test: {
    // Unit tests only; Playwright runs e2e/ separately.
    include: ['test/**/*.test.ts'],
  },
});
