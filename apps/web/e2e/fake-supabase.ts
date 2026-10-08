import type { UserSettings } from '@music/contracts';
import type { BrowserContext, Page, Route } from '@playwright/test';

/**
 * A stand-in for Supabase Auth (at /fake-supabase, see playwright.config.ts)
 * plus the identity service behind /api/identity. One instance is one
 * "cloud": attach it to several browser contexts to act as different browsers.
 */
export interface FakeCloud {
  /** Accounts by email. */
  users: Map<string, { id: string; password: string; confirmed: boolean }>;
  /** Saved settings by user id, as the identity service stores them. */
  settings: Map<string, Partial<UserSettings>>;
  /** Authorization header of every /api call, in order. */
  apiAuth: Array<string | null>;
  /** Bodies of PATCH /api/identity/me/settings. */
  patches: Array<Partial<UserSettings>>;
  /** Make sign-up ask for email confirmation, like a default Supabase project. */
  confirmEmails: boolean;
}

export function fakeCloud(): FakeCloud {
  return { users: new Map(), settings: new Map(), apiAuth: [], patches: [], confirmEmails: false };
}

const DEFAULTS: UserSettings = { noteNaming: 'western', keyboardSize: 61, lowestNote: 36, currentKey: 'C', midiInputId: null, theme: 'dark' };

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const tokenFor = (id: string) => `${b64({ alg: 'ES256', typ: 'JWT' })}.${b64({ sub: id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
const tokenUser = (header: string | undefined) => {
  const m = /^Bearer (.+)$/.exec(header ?? '');
  if (!m) return null;
  try {
    return (JSON.parse(Buffer.from(m[1]!.split('.')[1]!, 'base64url').toString()) as { sub: string }).sub;
  } catch {
    return null;
  }
};

function userJson(id: string, email: string) {
  return {
    id,
    aud: 'authenticated',
    role: 'authenticated',
    email,
    email_confirmed_at: new Date().toISOString(),
    app_metadata: { provider: 'email' },
    user_metadata: {},
    identities: [{ id, user_id: id, identity_id: id, provider: 'email', identity_data: { sub: id, email }, created_at: new Date().toISOString() }],
    created_at: new Date().toISOString(),
  };
}

function session(id: string, email: string) {
  return {
    access_token: tokenFor(id),
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: `refresh-${id}`,
    user: userJson(id, email),
  };
}

const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/** Answers Supabase Auth and /api/identity for this page or context. */
export async function attachCloud(target: Page | BrowserContext, cloud: FakeCloud): Promise<void> {
  await target.route(
    (url) => url.pathname.startsWith('/fake-supabase/auth/v1/'),
    async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const path = url.pathname.replace('/fake-supabase/auth/v1', '');
      const body = (req.postDataJSON() ?? {}) as { email?: string; password?: string };

      if (path === '/signup') {
        const email = body.email!;
        if (cloud.users.has(email)) return json(route, { code: 'user_already_exists', message: 'User already registered' }, 422);
        const id = crypto.randomUUID();
        cloud.users.set(email, { id, password: body.password!, confirmed: !cloud.confirmEmails });
        return json(route, cloud.confirmEmails ? { ...userJson(id, email), email_confirmed_at: null } : session(id, email));
      }
      if (path === '/token' && url.searchParams.get('grant_type') === 'password') {
        const user = cloud.users.get(body.email!);
        if (!user || user.password !== body.password) return json(route, { code: 'invalid_credentials', message: 'Invalid login credentials' }, 400);
        if (!user.confirmed) return json(route, { code: 'email_not_confirmed', message: 'Email not confirmed' }, 400);
        return json(route, session(user.id, body.email!));
      }
      if (path === '/logout') return route.fulfill({ status: 204 });
      if (path === '/user') {
        const id = tokenUser(req.headers().authorization);
        const email = [...cloud.users].find(([, u]) => u.id === id)?.[0];
        return id && email ? json(route, userJson(id, email)) : json(route, { message: 'invalid token' }, 401);
      }
      return json(route, { message: `no fake for ${path}` }, 404);
    },
  );

  await target.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const req = route.request();
      const path = new URL(req.url()).pathname.replace(/^\/api/, '');
      const auth = req.headers().authorization ?? null;
      cloud.apiAuth.push(auth);
      if (!path.startsWith('/identity/')) return route.fallback();
      const id = tokenUser(auth ?? undefined);
      if (!id) return json(route, { message: 'sign in required' }, 401);
      const me = () => ({ id, displayName: 'Pianist', createdAt: new Date().toISOString(), settings: { ...DEFAULTS, ...cloud.settings.get(id) } });
      if (path === '/identity/me') return json(route, me());
      if (path === '/identity/me/settings' && req.method() === 'PATCH') {
        const patch = req.postDataJSON() as Partial<UserSettings>;
        cloud.patches.push(patch);
        cloud.settings.set(id, { ...cloud.settings.get(id), ...patch });
        return json(route, me());
      }
      return json(route, { message: `no fake for ${path}` }, 404);
    },
  );
}
