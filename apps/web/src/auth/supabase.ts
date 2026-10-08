/**
 * The Supabase client for sign-in. It only ever uses the public anon key and
 * only talks to Supabase Auth; data goes through the gateway at /api.
 *
 * Null when VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing, so the app
 * still runs signed out (settings stay in this browser).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// The desktop app sets these at run time from its settings file, so one
// installer works with or without a Supabase project.
const runtime = (globalThis as { __MUSIC_CONFIG__?: { supabaseUrl?: string; supabaseAnonKey?: string } }).__MUSIC_CONFIG__;
const url = runtime ? runtime.supabaseUrl : (import.meta.env.VITE_SUPABASE_URL as string | undefined);
const anonKey = runtime ? runtime.supabaseAnonKey : (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined);

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'music.auth' },
      })
    : null;
