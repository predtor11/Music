import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Loads the repo's .env (the nearest one above the working directory) into
 * process.env, without overriding variables that are already set. Services
 * call this on import, so `npm run dev:all` picks up the Supabase settings.
 */
export function loadEnv(start = process.cwd()): string | null {
  if (process.env.NODE_ENV === 'test') return null;
  let dir = start;
  for (;;) {
    const file = join(dir, '.env');
    if (existsSync(file)) {
      const before = { ...process.env };
      process.loadEnvFile(file);
      // loadEnvFile overrides; keep anything set explicitly in the shell.
      for (const [k, v] of Object.entries(before)) process.env[k] = v;
      return file;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

loadEnv();
