import { existsSync, writeFileSync } from 'node:fs';

/** Written to the app's data folder on first launch. Everything is optional. */
export const SETTINGS_TEMPLATE = `# Music Theory Trainer settings. Everything here is optional.
#
# Sign-in works out of the box: the app has the project's public sign-in
# settings built in, and your progress is saved in this folder.
#
# MUSIC_LOCAL_ONLY=1 turns sign-in off (one local user, no account).
#
# To keep progress in the Supabase project itself (the same as the web
# version), fill these in with the values from the repo's .env and restart:
#
# SUPABASE_URL=
# SUPABASE_ANON_KEY=
# SUPABASE_SERVICE_ROLE_KEY=
# SUPABASE_JWT_SECRET=
# VITE_SUPABASE_URL=
# VITE_SUPABASE_ANON_KEY=
# SUPABASE_DB_URL=
`;

/** Creates the settings file when it is missing. Returns true when it was created. */
export function ensureSettingsFile(path: string): boolean {
  if (existsSync(path)) return false;
  writeFileSync(path, SETTINGS_TEMPLATE, 'utf8');
  return true;
}
