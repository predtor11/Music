import { describe, expect, it } from 'vitest';
import { applyPublicDefaults, PUBLIC_SUPABASE_KEY, PUBLIC_SUPABASE_URL } from '../src/public-config.js';

describe('applyPublicDefaults', () => {
  it('turns sign-in on when the settings file is empty', () => {
    const env: NodeJS.ProcessEnv = {};
    applyPublicDefaults(env);
    expect(env.VITE_SUPABASE_URL).toBe(PUBLIC_SUPABASE_URL);
    expect(env.VITE_SUPABASE_ANON_KEY).toBe(PUBLIC_SUPABASE_KEY);
    expect(env.SUPABASE_URL).toBe(PUBLIC_SUPABASE_URL);
  });

  it('keeps values the user set', () => {
    const env: NodeJS.ProcessEnv = { VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: 'k', SUPABASE_URL: 'https://x.supabase.co' };
    applyPublicDefaults(env);
    expect(env.VITE_SUPABASE_URL).toBe('https://x.supabase.co');
    expect(env.VITE_SUPABASE_ANON_KEY).toBe('k');
  });

  it('stays signed out with MUSIC_LOCAL_ONLY=1', () => {
    const env: NodeJS.ProcessEnv = { MUSIC_LOCAL_ONLY: '1' };
    applyPublicDefaults(env);
    expect(env.VITE_SUPABASE_URL).toBeUndefined();
  });
});
