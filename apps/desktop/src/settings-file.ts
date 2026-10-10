import { existsSync, writeFileSync } from 'node:fs';

/** Written to the app's data folder on first launch. Everything is optional. */
export const SETTINGS_TEMPLATE = `# Music Theory Trainer settings. Everything here is optional.
#
# Left empty, the app works on its own on this computer: no account, and your
# progress is saved in this folder.
#
# ONLINE ACCOUNT (recommended): to sign in and share progress with the web
# version, set MUSIC_API_URL to the address of the hosted site and fill in the
# two PUBLIC sign-in values (the same ones the web version uses), then restart
# the app (File > Restart). The app then runs no services of its own and sends
# its requests to the hosted site. No secret key is ever needed here.
#
# MUSIC_API_URL=https://your-site.vercel.app
# VITE_SUPABASE_URL=https://your-project.supabase.co
# VITE_SUPABASE_ANON_KEY=
#
# In Supabase (Authentication > URL Configuration > Redirect URLs) add
# http://127.0.0.1:47800 so the confirmation email link works.
#
# LOCAL SUPABASE (advanced; leave MUSIC_API_URL empty): run every service on
# this computer against your own Supabase project instead.
#
# SUPABASE_URL=
# SUPABASE_ANON_KEY=
# SUPABASE_SERVICE_ROLE_KEY=
# SUPABASE_JWT_SECRET=
# SUPABASE_DB_URL=
`;

/** Creates the settings file when it is missing. Returns true when it was created. */
export function ensureSettingsFile(path: string): boolean {
  if (existsSync(path)) return false;
  writeFileSync(path, SETTINGS_TEMPLATE, 'utf8');
  return true;
}
