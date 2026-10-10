import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_API_URL, hostedConfig, parseApiUrl, publicConfig, resolveApiUrl } from '../src/remote.js';
import { createStaticServer } from '../src/static-server.js';

const servers: Server[] = [];

async function listen(server: Server): Promise<number> {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as AddressInfo).port;
}

async function closedPort(): Promise<number> {
  const s = createServer();
  const port = await listen(s);
  await new Promise<void>((resolve) => s.close(() => resolve()));
  return port;
}

interface Seen {
  method?: string;
  url?: string;
  headers: IncomingHttpHeaders;
  body: string;
}

let webDir: string;
let seen: Seen[];
let upstreamHandler: Parameters<typeof createServer>[1];

beforeEach(() => {
  webDir = mkdtempSync(join(tmpdir(), 'music-web-'));
  writeFileSync(join(webDir, 'index.html'), '<html><head><title>t</title></head><body>app</body></html>');
  seen = [];
  upstreamHandler = (_req, res) => res.end('{}');
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((resolve) => { s.closeAllConnections(); s.close(() => resolve()); })));
});

async function start(config = { supabaseUrl: 'https://p.supabase.co', supabaseAnonKey: 'anon' }, apiUrl?: URL): Promise<{ base: string; upstream: number }> {
  const upstream = await listen(
    createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        seen.push({ method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString() });
        upstreamHandler!(req, res);
      });
    }),
  );
  const desktop = await listen(createStaticServer({ webDir, apiUrl: apiUrl ?? new URL(`http://127.0.0.1:${upstream}`), config }));
  return { base: `http://127.0.0.1:${desktop}`, upstream };
}

describe('online mode proxy', () => {
  it('forwards method, path, query and body, and returns status, headers and body', async () => {
    const { base } = await start();
    upstreamHandler = (_req, res) => {
      res.writeHead(201, { 'content-type': 'application/json', 'x-thing': 'yes' });
      res.end('{"ok":true}');
    };
    const res = await fetch(`${base}/api/progress/attempts?unit=3`, { method: 'POST', body: '{"a":1}', headers: { 'content-type': 'application/json' } });
    expect(res.status).toBe(201);
    expect(res.headers.get('x-thing')).toBe('yes');
    expect(await res.json()).toEqual({ ok: true });
    expect(seen[0]).toMatchObject({ method: 'POST', url: '/api/progress/attempts?unit=3', body: '{"a":1}' });
    expect(seen[0]!.headers['content-type']).toBe('application/json');
  });

  it('passes the Authorization header through unchanged', async () => {
    const { base } = await start();
    await fetch(`${base}/api/identity/me`, { headers: { authorization: 'Bearer abc.def.ghi' } });
    expect(seen[0]!.headers.authorization).toBe('Bearer abc.def.ghi');
  });

  it('sets Host to the hosted site, rewrites Origin, and drops cookies and Referer', async () => {
    const { base, upstream } = await start();
    await fetch(`${base}/api/x`, { headers: { origin: base, referer: `${base}/page`, cookie: 'a=b' } });
    const h = seen[0]!.headers;
    expect(h.host).toBe(`127.0.0.1:${upstream}`);
    expect(h.origin).toBe(`http://127.0.0.1:${upstream}`);
    expect(h.referer).toBeUndefined();
    expect(h.cookie).toBeUndefined();
  });

  it('passes upstream error statuses through untouched (a 401 stays a 401)', async () => {
    const { base } = await start();
    upstreamHandler = (_req, res) => {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end('{"error":"unauthorized"}');
    };
    const res = await fetch(`${base}/api/identity/me`);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });

  it('streams: the first chunk arrives before the upstream finishes', async () => {
    const { base } = await start();
    let finish!: () => void;
    upstreamHandler = (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write('first\n');
      finish = () => res.end('last\n');
    };
    const res = await fetch(`${base}/api/stream`);
    const reader = res.body!.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toBe('first\n');
    finish();
    let rest = '';
    for (let r = await reader.read(); !r.done; r = await reader.read()) rest += new TextDecoder().decode(r.value);
    expect(rest).toBe('last\n');
  });

  it('answers 502 JSON when the hosted API is unreachable', async () => {
    const { base } = await start(undefined, new URL(`http://127.0.0.1:${await closedPort()}`));
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(502);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(((await res.json()) as { error: string }).error).toBe('api_unreachable');
  });

  it('keeps serving the web app when the API is down (so offline mode can run)', async () => {
    const { base } = await start(undefined, new URL(`http://127.0.0.1:${await closedPort()}`));
    const res = await fetch(`${base}/units/3`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('app');
  });

  it('only forwards /api, never other paths, and refuses non-GET on pages', async () => {
    const { base } = await start();
    expect((await fetch(`${base}/`, { method: 'POST' })).status).toBe(405);
    await fetch(`${base}/`);
    await fetch(`${base}/apis`);
    expect(seen).toHaveLength(0);
  });
});

describe('config injection', () => {
  it('puts the public Supabase settings into the served index.html', async () => {
    const { base } = await start({ supabaseUrl: 'https://p.supabase.co', supabaseAnonKey: 'anon-key' });
    const html = await (await fetch(`${base}/`)).text();
    expect(html).toContain('window.__MUSIC_CONFIG__ = {"supabaseUrl":"https://p.supabase.co","supabaseAnonKey":"anon-key"};');
    // Client-side routes get the same page.
    expect(await (await fetch(`${base}/practice/daily`)).text()).toContain('anon-key');
  });

  it('injects empty settings when none are given, so the web app falls back to signed-out', async () => {
    const { base } = await start({ supabaseUrl: '', supabaseAnonKey: '' });
    expect(await (await fetch(`${base}/`)).text()).toContain('{"supabaseUrl":"","supabaseAnonKey":""}');
  });
});

describe('local mode is unchanged', () => {
  it('forwards /api to the local gateway port when no apiUrl is given', async () => {
    const gateway = await listen(
      createServer((req, res) => {
        seen.push({ method: req.method, url: req.url, headers: req.headers, body: '' });
        res.end('{"gateway":true}');
      }),
    );
    const desktop = await listen(createStaticServer({ webDir, gatewayPort: gateway, config: { supabaseUrl: '', supabaseAnonKey: '' } }));
    const res = await fetch(`http://127.0.0.1:${desktop}/api/health`);
    expect(await res.json()).toEqual({ gateway: true });
    expect(seen[0]!.url).toBe('/api/health');
  });
});

describe('parseApiUrl', () => {
  it('treats empty as local mode', () => {
    expect(parseApiUrl(undefined)).toBeNull();
    expect(parseApiUrl('   ')).toBeNull();
  });
  it('keeps only the origin', () => {
    expect(parseApiUrl(' https://xyz.vercel.app/some/path/?q=1 ')!.href).toBe('https://xyz.vercel.app/');
  });
  it('rejects things that are not web addresses', () => {
    expect(() => parseApiUrl('xyz.vercel.app')).toThrow(/MUSIC_API_URL/);
    expect(() => parseApiUrl('ftp://xyz.app')).toThrow(/https/);
    expect(() => parseApiUrl('https://u:p@xyz.app')).toThrow(/user name/);
  });
});

describe('publicConfig', () => {
  it('prefers the VITE_ values and falls back to the plain public ones', () => {
    expect(publicConfig({ VITE_SUPABASE_URL: 'https://a', VITE_SUPABASE_ANON_KEY: 'k1', SUPABASE_URL: 'https://b' })).toEqual({ supabaseUrl: 'https://a', supabaseAnonKey: 'k1' });
    expect(publicConfig({ SUPABASE_URL: 'https://b', SUPABASE_ANON_KEY: 'k2' })).toEqual({ supabaseUrl: 'https://b', supabaseAnonKey: 'k2' });
    expect(publicConfig({})).toEqual({ supabaseUrl: '', supabaseAnonKey: '' });
  });
  it('never exposes the service-role key or JWT secret', () => {
    const cfg = publicConfig({ SUPABASE_SERVICE_ROLE_KEY: 'secret', SUPABASE_JWT_SECRET: 'secret2', SUPABASE_DB_URL: 'postgres://x' });
    expect(JSON.stringify(cfg)).not.toContain('secret');
    expect(JSON.stringify(cfg)).not.toContain('postgres');
  });
});

describe('resolveApiUrl and hostedConfig', () => {
  it('defaults to the hosted site, and "local" opts out', () => {
    expect(resolveApiUrl('')!.href).toBe(new URL(DEFAULT_API_URL).href);
    expect(resolveApiUrl(undefined)!.href).toBe(new URL(DEFAULT_API_URL).href);
    expect(resolveApiUrl('LOCAL')).toBeNull();
    expect(resolveApiUrl('https://other.app')!.href).toBe('https://other.app/');
  });

  const site = new URL('https://x.app');
  const okFetch = (async () => new Response(JSON.stringify({ supabaseUrl: 'https://s', supabaseAnonKey: 'pub' }))) as typeof fetch;

  it('takes the sign-in settings from the site when the settings file has none', async () => {
    expect(await hostedConfig(site, {}, okFetch)).toEqual({ supabaseUrl: 'https://s', supabaseAnonKey: 'pub' });
  });

  it('prefers values in the settings file', async () => {
    const cfg = await hostedConfig(site, { VITE_SUPABASE_URL: 'https://mine', VITE_SUPABASE_ANON_KEY: 'k' }, okFetch);
    expect(cfg).toEqual({ supabaseUrl: 'https://mine', supabaseAnonKey: 'k' });
  });

  it('still starts when the site cannot be reached', async () => {
    const down = (async () => {
      throw new Error('offline');
    }) as typeof fetch;
    expect(await hostedConfig(site, {}, down)).toEqual({ supabaseUrl: '', supabaseAnonKey: '' });
  });
});
