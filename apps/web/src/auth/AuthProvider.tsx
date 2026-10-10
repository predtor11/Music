/**
 * Who is signed in. Wraps Supabase Auth (email and password), keeps the
 * session across reloads, and hands the access token to the API client so
 * every /api call carries it.
 */

import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { setTokenSource } from '../api/client.js';
import { setIdentity } from '../offline/runtime.js';
import { friendlyAuthError } from './messages.js';
import { supabase } from './supabase.js';

/** off: sign-in isn't configured on this computer (no Supabase env). */
export type AuthStatus = 'off' | 'loading' | 'signed-out' | 'signed-in';

export interface AuthUser {
  id: string;
  email: string | null;
}

export type SignUpResult = { signedIn: true } | { signedIn: false; confirmEmail: string };

export interface AuthValue {
  status: AuthStatus;
  user: AuthUser | null;
  /** Throws an Error with a friendly message. */
  signIn(email: string, password: string): Promise<void>;
  /** Throws an Error with a friendly message. When Supabase asks for email confirmation, there is no session yet. */
  signUp(email: string, password: string): Promise<SignUpResult>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

function toUser(session: Session | null): AuthUser | null {
  return session ? { id: session.user.id, email: session.user.email ?? null } : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!supabase);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    // getSession refreshes an expired token first, so calls never go out with a stale one.
    setTokenSource(async () => (await client.auth.getSession()).data.session?.access_token ?? null);
    let live = true;
    void client.auth.getSession().then(({ data }) => {
      if (!live) return;
      setSession(data.session);
      setReady(true);
    });
    const { data } = client.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setReady(true);
    });
    return () => {
      live = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error("Sign-in isn't set up on this computer yet.");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error(friendlyAuthError(error));
  }, []);

  const signUp = useCallback(async (email: string, password: string): Promise<SignUpResult> => {
    if (!supabase) throw new Error("Sign-in isn't set up on this computer yet.");
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: `${location.origin}${location.pathname}` },
    });
    if (error) throw new Error(friendlyAuthError(error));
    // Supabase hides whether an address is taken: a repeat sign-up returns a user with no identities.
    if (data.user && data.user.identities?.length === 0) throw new Error(friendlyAuthError({ code: 'user_already_exists' }));
    return data.session ? { signedIn: true } : { signedIn: false, confirmEmail: email.trim() };
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    // Local scope: signing out here doesn't sign out other browsers.
    await supabase.auth.signOut({ scope: 'local' });
    setSession(null);
  }, []);

  // Tell the offline outbox who is here: practice saved while signed out is sent once someone signs in.
  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (supabase && !ready) return;
    setIdentity(!supabase ? { userId: 'local', canSync: true } : userId ? { userId, canSync: true } : { userId: null, canSync: false });
  }, [ready, userId]);

  const value = useMemo<AuthValue>(
    () => ({
      status: !supabase ? 'off' : !ready ? 'loading' : session ? 'signed-in' : 'signed-out',
      user: toUser(session),
      signIn,
      signUp,
      signOut,
    }),
    [ready, session, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
