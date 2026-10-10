/**
 * Runs inside the desktop app, in a background Node process: every service,
 * then a small server for the web app on WEB_PORT. Reports
 * `{ type: 'ready' }` or `{ type: 'error' }` to the window process.
 *
 * Settings come from the .env in the app's data folder (the working directory).
 * Without SUPABASE_DB_URL the services keep data in memory and the event
 * journal brings progress back after a restart. Sign-in uses the project's
 * public Supabase settings (public-config.ts) unless MUSIC_LOCAL_ONLY=1.
 */
import { join } from 'node:path';
import { setDefaultEventBus } from '@music/service-kit';
import { JournalEventBus } from './journal-bus.js';
import { SERVICE_PORTS, WEB_PORT, type DesktopService } from './ports.js';
import { applyPublicDefaults } from './public-config.js';
import { createStaticServer } from './static-server.js';

type Message = { type: 'ready'; url: string; journalled: number } | { type: 'error'; message: string };

function send(message: Message): void {
  const port = (process as unknown as { parentPort?: { postMessage(m: Message): void } }).parentPort;
  if (port) port.postMessage(message);
  else console.log(JSON.stringify(message));
}

// Curriculum first: the progress service reads its catalogue at start-up.
const SERVICES: Array<[DesktopService, () => Promise<unknown>]> = [
  ['curriculum', () => import('../../../services/curriculum/src/main.js')],
  ['theory', () => import('../../../services/theory/src/main.js')],
  ['identity', () => import('../../../services/identity/src/main.js')],
  ['progress', () => import('../../../services/progress/src/main.js')],
  ['practice', () => import('../../../services/practice/src/main.js')],
  ['gateway', () => import('../../../services/gateway/src/main.js')],
];

async function main(): Promise<void> {
  const dataDir = process.env.MUSIC_DATA_DIR ?? process.cwd();
  const webDir = process.env.MUSIC_WEB_DIR;
  if (!webDir) throw new Error('MUSIC_WEB_DIR is not set');

  applyPublicDefaults(process.env);
  process.env.HOST = '127.0.0.1';
  for (const [name, port] of Object.entries(SERVICE_PORTS)) process.env[`${name.toUpperCase()}_URL`] = `http://127.0.0.1:${port}`;
  // One process, one shared bus: Redis is never needed here.
  delete process.env.REDIS_URL;

  const bus = new JournalEventBus(process.env.SUPABASE_DB_URL ? null : join(dataDir, 'events.jsonl'));
  setDefaultEventBus(bus);

  for (const [name, load] of SERVICES) {
    // startService() reads PORT when the service's main module runs.
    process.env.PORT = String(SERVICE_PORTS[name]);
    await load();
  }
  delete process.env.PORT;

  const journalled = await bus.replay();

  const server = createStaticServer({
    webDir,
    gatewayPort: SERVICE_PORTS.gateway,
    config: {
      supabaseUrl: process.env.VITE_SUPABASE_URL ?? '',
      supabaseAnonKey: process.env.VITE_SUPABASE_ANON_KEY ?? '',
    },
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(WEB_PORT, '127.0.0.1', resolve);
  });
  send({ type: 'ready', url: `http://127.0.0.1:${WEB_PORT}`, journalled });
}

main().catch((error: unknown) => {
  const err = error as NodeJS.ErrnoException;
  const message =
    err?.code === 'EADDRINUSE'
      ? `A port the app needs is already in use (${err.message}). Is another copy of Music Theory Trainer running?`
      : String(err?.stack ?? err);
  console.error(message);
  send({ type: 'error', message });
  setTimeout(() => process.exit(1), 100);
});
