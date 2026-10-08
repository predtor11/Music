import proxy from '@fastify/http-proxy';
import { SERVICES, USER_ID_HEADER, type ServiceName } from '@music/contracts';
import { createService } from '@music/service-kit';
import type { JWTVerifyGetKey } from 'jose';
import { DEV_USER_ID, bearerToken, supabaseJwks, verifySupabaseToken, type TokenKeys } from './auth.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by the gateway after it checks the login; undefined for anonymous requests. */
    userId?: string;
  }
}

export type DownstreamName = Exclude<ServiceName, 'gateway'>;

export interface GatewayOptions {
  logger?: boolean;
  /** Supabase legacy JWT secret, for HS256 tokens. Defaults to SUPABASE_JWT_SECRET. */
  jwtSecret?: string;
  /** Supabase project URL, for the public signing keys (JWKS). Defaults to SUPABASE_URL. */
  supabaseUrl?: string;
  /** Signing keys to use instead of fetching them from supabaseUrl (tests). */
  jwks?: JWTVerifyGetKey;
  /** Base URL per service. Defaults to <NAME>_URL from the environment, then http://127.0.0.1:<port>. */
  upstreams?: Partial<Record<DownstreamName, string>>;
}

export const DOWNSTREAM: DownstreamName[] = (Object.keys(SERVICES) as ServiceName[]).filter(
  (name): name is DownstreamName => name !== 'gateway',
);

export function upstreamUrl(name: DownstreamName, overrides: GatewayOptions['upstreams'] = {}): string {
  return overrides[name] ?? process.env[`${name.toUpperCase()}_URL`] ?? `http://127.0.0.1:${SERVICES[name].port}`;
}

/**
 * The single entry point for the web app. Checks the Supabase login, sets
 * x-user-id, and forwards /api/<service>/* to that service without the prefix.
 *
 * A request with no token goes through anonymously (no x-user-id), so public
 * reads like the curriculum work; services that need a user reject it with
 * 401 via requireUserId(). A token that fails the check is a 401 here.
 */
export function buildApp(options: GatewayOptions = {}) {
  const app = createService({ name: 'gateway', logger: options.logger });
  const secretText = options.jwtSecret ?? process.env.SUPABASE_JWT_SECRET;
  const supabaseUrl = options.supabaseUrl ?? process.env.SUPABASE_URL;
  const keys: TokenKeys = {
    secret: secretText ? new TextEncoder().encode(secretText) : undefined,
    jwks: options.jwks ?? (supabaseUrl ? supabaseJwks(supabaseUrl) : undefined),
  };
  const devMode = !keys.secret && !keys.jwks;

  if (devMode) {
    console.warn(`[gateway] Neither SUPABASE_URL nor SUPABASE_JWT_SECRET is set: dev mode, every request is user ${DEV_USER_ID}. Never run like this in production.`);
  }

  app.addHook('onRequest', async (req) => {
    if (!req.url.startsWith(`${SERVICES.gateway.prefix}/`)) return;
    if (devMode) {
      req.userId = DEV_USER_ID;
      return;
    }
    const token = bearerToken(req.headers.authorization);
    if (token) req.userId = await verifySupabaseToken(token, keys);
  });

  for (const name of DOWNSTREAM) {
    app.register(proxy, {
      upstream: upstreamUrl(name, options.upstreams),
      prefix: SERVICES[name].prefix,
      rewritePrefix: '',
      replyOptions: {
        rewriteRequestHeaders: (req, headers) => {
          // Only the gateway decides who the user is; never pass one through from the browser.
          const { [USER_ID_HEADER]: _ignored, ...rest } = headers;
          return req.userId ? { ...rest, [USER_ID_HEADER]: req.userId } : rest;
        },
      },
    });
  }

  return app;
}
