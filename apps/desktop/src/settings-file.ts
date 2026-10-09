import { existsSync, writeFileSync } from 'node:fs';

/** Written to the app's data folder on first launch. Everything is optional. */
export const SETTINGS_TEMPLATE = `# Music Theory Trainer settings. Everything here is optional.
#
# Left empty, the app works on its own on this computer: no account, and your
# progress is saved in this folder.
#
# To sign in and keep progress in a Supabase project instead (the same as the
# web version), fill these in and restart the app:
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
