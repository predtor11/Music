/**
 * The project's public Supabase settings. The URL and the publishable key are
 * meant to be shipped in client apps (they only allow Supabase Auth calls;
 * data access is guarded by RLS and the gateway), so the installer carries them
 * and sign-in works out of the box. Secrets (service role, JWT secret, DB URL)
 * are never bundled.
 */
export const PUBLIC_SUPABASE_URL = 'https://iecxugzgkupflnayweyx.supabase.co';
export const PUBLIC_SUPABASE_KEY = 'sb_publishable_PdLncFUDZ94iiUy0bflorA_Bp0CYehi';

/**
 * Fills in the public sign-in settings the settings file left empty.
 * MUSIC_LOCAL_ONLY=1 keeps the app signed out (one local user).
 */
export function applyPublicDefaults(env: NodeJS.ProcessEnv): void {
  if (env.MUSIC_LOCAL_ONLY === '1') return;
  env.VITE_SUPABASE_URL ||= PUBLIC_SUPABASE_URL;
  env.VITE_SUPABASE_ANON_KEY ||= PUBLIC_SUPABASE_KEY;
  // The gateway checks sign-in tokens against the project's public signing keys.
  env.SUPABASE_URL ||= env.VITE_SUPABASE_URL;
}
