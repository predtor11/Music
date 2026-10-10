import { existsSync, writeFileSync } from 'node:fs';

/** Written to the app's data folder on first launch. Everything is optional. */
export const SETTINGS_TEMPLATE = `# Music Theory Trainer settings. Everything here is optional.
#
# Left empty, the app uses the hosted site: you sign in with the same account
# as the web version and your progress is shared. Nothing needs filling in; the
# sign-in settings are fetched from the site. No secret key is ever needed here.
#
# To use a different hosted site, set its address:
# MUSIC_API_URL=https://your-site.vercel.app
#
# To keep everything on this computer instead (no account, progress saved in
# this folder), set:
# MUSIC_API_URL=local
#
# In Supabase (Authentication > URL Configuration > Redirect URLs) add
# http://127.0.0.1:47800 so the confirmation email link works.
#
# LOCAL SUPABASE (advanced; needs MUSIC_API_URL=local): run every service on
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
