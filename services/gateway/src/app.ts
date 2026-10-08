import proxy from '@fastify/http-proxy';
import { SERVICES, USER_ID_HEADER, type ServiceName } from '@music/contracts';
import { createService } from '@music/service-kit';
import { DEV_USER_ID, bearerToken, verifySupabaseToken } from './auth.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by the gateway after it checks the login; undefined for anonymous requests. */
    userId?: string;
  }
}

export type DownstreamName = Exclude<ServiceName, 'gateway'>;

export interface GatewayOptions {
  logger?: boolean;
  /** Supabase JWT secret. Defaults to SUPABASE_JWT_SECRET; when unset, every request is the dev user. */
  jwtSecret?: string;
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
  const secret = secretText ? new TextEncoder().encode(secretText) : undefined;

  if (!secret) {
    console.warn(`[gateway] SUPABASE_JWT_SECRET is not set: dev mode, every request is user ${DEV_USER_ID}. Never run like this in production.`);
  }

  app.addHook('onRequest', async (req) => {
    if (!req.url.startsWith(`${SERVICES.gateway.prefix}/`)) return;
    if (!secret) {
      req.userId = DEV_USER_ID;
      return;
    }
    const token = bearerToken(req.headers.authorization);
    if (token) req.userId = await verifySupabaseToken(token, secret);
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
