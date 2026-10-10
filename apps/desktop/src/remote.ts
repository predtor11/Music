/**
 * Online mode: MUSIC_API_URL names the hosted site (for example
 * https://xyz.vercel.app). The desktop app then runs no services of its own
 * and forwards /api to that site's serverless API. Nothing secret is involved:
 * the database key stays on the server, and the app only holds the public
 * Supabase URL and anon key plus the signed-in user's own access token.
 */
import { request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http';
import { request as httpsRequest } from 'node:https';

export interface RuntimeConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

/** Parses MUSIC_API_URL into a bare origin. Empty means local mode (null). Throws a readable message when invalid. */
export function parseApiUrl(raw: string | undefined): URL | null {
  const text = (raw ?? '').trim();
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`MUSIC_API_URL is not a web address: "${text}". Use the hosted site's address, for example https://your-site.vercel.app`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`MUSIC_API_URL must start with https:// (got "${text}").`);
  }
  if (url.username || url.password) throw new Error('MUSIC_API_URL must not contain a user name or password.');
  // Only the site's origin matters: /api/... is appended to it.
  return new URL(url.origin);
}

/** The hosted site the app uses when MUSIC_API_URL is empty. A public address, not a secret. */
export const DEFAULT_API_URL = 'https://music-pi-wheat.vercel.app';

/** MUSIC_API_URL=local keeps everything on this computer; empty means the hosted site; anything else is the site's address. */
export function resolveApiUrl(raw: string | undefined): URL | null {
  const text = (raw ?? '').trim();
  if (text.toLowerCase() === 'local') return null;
  return parseApiUrl(text || DEFAULT_API_URL);
}

/**
 * The sign-in settings for the web app: values in the settings file win,
 * otherwise the hosted site's own public GET /api/config. If the site can't be
 * reached the app still starts (the web app runs signed out / offline).
 */
export async function hostedConfig(apiUrl: URL, env: Record<string, string | undefined>, fetchFn: typeof fetch = fetch): Promise<RuntimeConfig> {
  const local = publicConfig(env);
  if (local.supabaseUrl && local.supabaseAnonKey) return local;
  try {
    const res = await fetchFn(new URL('/api/config', apiUrl), { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return local;
    const body = (await res.json()) as Partial<RuntimeConfig>;
    return {
      supabaseUrl: local.supabaseUrl || String(body.supabaseUrl ?? ''),
      supabaseAnonKey: local.supabaseAnonKey || String(body.supabaseAnonKey ?? ''),
    };
  } catch {
    return local;
  }
}

/** The public Supabase settings for the web app's sign-in, from the settings file's environment. */
export function publicConfig(env: Record<string, string | undefined>): RuntimeConfig {
  return {
    supabaseUrl: (env.VITE_SUPABASE_URL || env.SUPABASE_URL || '').trim(),
    supabaseAnonKey: (env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || '').trim(),
  };
}

// Headers that describe one connection rather than the message, plus ones that
// must not leave this computer or would confuse the hosted site.
const DROPPED = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'host', 'origin', 'referer', 'cookie']);

export function forwardHeaders(incoming: IncomingMessage['headers'], target: URL): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  const named = new Set(
    String(incoming.connection ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  for (const [name, value] of Object.entries(incoming)) {
    if (value === undefined || DROPPED.has(name) || named.has(name)) continue;
    out[name] = value;
  }
  out.host = target.host;
  // The API sees a request from its own site, not from 127.0.0.1.
  if (incoming.origin !== undefined) out.origin = target.origin;
  return out;
}

export interface ProxyOptions {
  /** How long to wait for the hosted API to answer before giving up. */
  timeoutMs?: number;
}

/** A request handler that streams /api requests to the hosted API and the answers back. */
export function createApiProxy(target: URL, options: ProxyOptions = {}): (req: IncomingMessage, res: ServerResponse) => void {
  const send = target.protocol === 'https:' ? httpsRequest : httpRequest;
  const timeoutMs = options.timeoutMs ?? 30_000;

  return (req, res) => {
    const fail = (): void => {
      if (res.headersSent) return void res.destroy();
      res.writeHead(502, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ error: 'api_unreachable', message: 'The online service could not be reached.' }));
    };

    const upstream = send(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || undefined,
        method: req.method,
        path: req.url,
        headers: forwardHeaders(req.headers, target),
        timeout: timeoutMs,
      },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.on('error', () => res.destroy());
        up.pipe(res);
      },
    );
    upstream.on('timeout', () => upstream.destroy(new Error('timeout')));
    upstream.on('error', fail);
    // The window went away (or a navigation was cancelled): stop the upstream call too.
    res.on('close', () => {
      if (!res.writableEnded) upstream.destroy();
    });
    req.on('error', () => upstream.destroy());
    req.pipe(upstream);
  };
}
