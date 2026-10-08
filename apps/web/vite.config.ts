import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
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
