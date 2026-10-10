// Starts the built function (.vercel/output) the way Vercel would and checks a few routes.
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.env.API_DEV_MODE = '1';
const bundle = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.vercel', 'output', 'functions', 'api.func', 'index.mjs');
const { default: handler } = await import(pathToFileURL(bundle).href);
const server = createServer(handler);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
try {
  for (const [path, check] of [
    ['/api/health', (b) => b.status === 'ok'],
    ['/api/curriculum/units', (b) => Array.isArray(b) && b.length > 0],
    ['/api/identity/me', (b) => b.displayName],
    ['/api/theory/health', (b) => b.status === 'ok'],
  ]) {
    const res = await fetch(base + path);
    const body = await res.json();
    if (!res.ok || !check(body)) throw new Error(`${path} gave ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
    console.log('ok', path);
  }
} finally {
  server.close();
}
