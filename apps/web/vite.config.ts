import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vitest/config';

/**
 * Writes dist/sw.js: sw/sw.js with the list of built files to keep for offline
 * use and an id for this build (so an old build's cache is cleared). The list
 * comes from the bundle itself, so it can't go out of date.
 */
function serviceWorker(): Plugin {
  const source = fileURLToPath(new URL('./sw/sw.js', import.meta.url));
  return {
    name: 'music-service-worker',
    apply: 'build',
    enforce: 'post',
    writeBundle(options, bundle) {
      const outDir = resolve(options.dir ?? 'dist');
      const built = Object.keys(bundle)
        .filter((name) => !name.endsWith('.map') && name !== 'index.html')
        .map((name) => `/${name}`);
      const precache = ['/index.html', '/manifest.webmanifest', '/icon.svg', ...built].sort();
      const id = createHash('sha256').update(precache.join('\n')).update(readFileSync(join(outDir, 'index.html'))).digest('hex').slice(0, 12);
      const code = readFileSync(source, 'utf8').replace('/*__PRECACHE__*/ []', JSON.stringify(precache)).replace('__BUILD_ID__', id);
      writeFileSync(join(outDir, 'sw.js'), code);
    },
  };
}

export default defineConfig({
  plugins: [react(), serviceWorker()],
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
