import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import Fastify, { type FastifyInstance } from 'fastify';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { DEV_USER_ID } from '../src/auth.js';
import { buildApp } from '../src/app.js';

const SECRET = 'test-secret-at-least-32-characters-long!';
const USER = '6f1c5f5e-6a43-4b3b-9d3c-0d6c2f8f2f12';

/** A stand-in service that echoes what it received. */
async function echoService(name: string): Promise<FastifyInstance> {
  const app = Fastify();
  app.all('/*', async (req) => ({ service: name, method: req.method, url: req.url, userId: req.headers['x-user-id'] ?? null, body: req.body ?? null }));
  await app.listen({ port: 0, host: '127.0.0.1' });
  return app;
}

function urlOf(app: FastifyInstance) {
  return `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
}

function token(claims: Record<string, unknown>, secret = SECRET, expiresIn = '1h') {
  return new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(expiresIn).sign(new TextEncoder().encode(secret));
}

describe('gateway', () => {
  let theory: FastifyInstance;
  let practice: FastifyInstance;
  let gateway: FastifyInstance;

  beforeAll(async () => {
    theory = await echoService('theory');
    practice = await echoService('practice');
    gateway = buildApp({ logger: false, jwtSecret: SECRET, upstreams: { theory: urlOf(theory), practice: urlOf(practice), identity: 'http://127.0.0.1:1' } });
  });

  afterAll(async () => {
    await Promise.all([gateway.close(), theory.close(), practice.close()]);
  });

  it('answers its own /health', async () => {
    const res = await gateway.inject({ url: '/health' });
    expect(res.json()).toMatchObject({ service: 'gateway', status: 'ok' });
  });

  it('forwards /api/<service>/* to that service without the prefix', async () => {
    const res = await gateway.inject({ url: '/api/theory/chords/identify?notes=60,64,67' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ service: 'theory', method: 'GET', url: '/chords/identify?notes=60,64,67' });
  });

  it('forwards bodies and picks the right service', async () => {
    const res = await gateway.inject({ method: 'POST', url: '/api/practice/sessions', payload: { kind: 'lesson' } });
    expect(res.json()).toMatchObject({ service: 'practice', method: 'POST', url: '/sessions', body: { kind: 'lesson' } });
  });

  it('sets x-user-id from a valid Supabase token', async () => {
    const res = await gateway.inject({ url: '/api/practice/me', headers: { authorization: `Bearer ${await token({ sub: USER, role: 'authenticated' })}` } });
    expect(res.statusCode).toBe(200);
    expect(res.json().userId).toBe(USER);
  });

  it('sends anonymous requests on without a user, and drops a spoofed x-user-id', async () => {
    const res = await gateway.inject({ url: '/api/theory/scales', headers: { 'x-user-id': 'someone-else' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().userId).toBeNull();
  });

  it('replaces a spoofed x-user-id with the token user', async () => {
    const res = await gateway.inject({ url: '/api/practice/me', headers: { authorization: `Bearer ${await token({ sub: USER })}`, 'x-user-id': 'someone-else' } });
    expect(res.json().userId).toBe(USER);
  });

  it.each([
    ['a token signed with another secret', async () => `Bearer ${await token({ sub: USER }, 'wrong-secret-also-32-characters-long!!')}`],
    ['an expired token', async () => `Bearer ${await token({ sub: USER }, SECRET, '-1m')}`],
    ['a token with no user (anon key)', async () => `Bearer ${await token({ role: 'anon' })}`],
    ['garbage', async () => 'Bearer not.a.jwt'],
    ['a non-bearer header', async () => 'Basic dXNlcjpwYXNz'],
  ])('returns 401 for %s', async (_label, header) => {
    const res = await gateway.inject({ url: '/api/practice/me', headers: { authorization: await header() } });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 for an unknown service', async () => {
    expect((await gateway.inject({ url: '/api/nope/x' })).statusCode).toBe(404);
  });

  it('returns a 5xx when a service is down', async () => {
    const res = await gateway.inject({ url: '/api/identity/me' });
    expect(res.statusCode).toBeGreaterThanOrEqual(500);
  });
});

describe('gateway with Supabase signing keys (ES256, JWKS)', () => {
  let practice: FastifyInstance;
  let gateway: FastifyInstance;
  let privateKey: CryptoKey;
  let otherKey: CryptoKey;

  beforeAll(async () => {
    const pair = await generateKeyPair('ES256', { extractable: true });
    privateKey = pair.privateKey;
    otherKey = (await generateKeyPair('ES256')).privateKey;
    const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'ES256' };
    practice = await echoService('practice');
    // No HS256 secret: a project that only uses signing keys.
    gateway = buildApp({ logger: false, jwtSecret: '', jwks: createLocalJWKSet({ keys: [jwk] }), upstreams: { practice: urlOf(practice) } });
  });

  afterAll(async () => {
    await Promise.all([gateway.close(), practice.close()]);
  });

  const es256 = (claims: Record<string, unknown>, key: CryptoKey) =>
    new SignJWT(claims).setProtectedHeader({ alg: 'ES256', kid: 'k1' }).setIssuedAt().setExpirationTime('1h').sign(key);

  it('sets x-user-id from a token signed with the project key', async () => {
    const res = await gateway.inject({ url: '/api/practice/me', headers: { authorization: `Bearer ${await es256({ sub: USER }, privateKey)}` } });
    expect(res.statusCode).toBe(200);
    expect(res.json().userId).toBe(USER);
  });

  it.each([
    ['a token signed with another key', async () => `Bearer ${await es256({ sub: USER }, otherKey)}`],
    ['an HS256 token when there is no secret', async () => `Bearer ${await token({ sub: USER })}`],
  ])('returns 401 for %s', async (_label, header) => {
    const res = await gateway.inject({ url: '/api/practice/me', headers: { authorization: await header() } });
    expect(res.statusCode).toBe(401);
  });
});

describe('gateway in dev mode (no Supabase URL or JWT secret)', () => {
  let theory: FastifyInstance;
  let gateway: FastifyInstance;
  const saved = { secret: process.env.SUPABASE_JWT_SECRET, url: process.env.SUPABASE_URL };

  beforeAll(async () => {
    delete process.env.SUPABASE_JWT_SECRET;
    delete process.env.SUPABASE_URL;
    theory = await echoService('theory');
  });

  afterAll(async () => {
    if (saved.secret !== undefined) process.env.SUPABASE_JWT_SECRET = saved.secret;
    if (saved.url !== undefined) process.env.SUPABASE_URL = saved.url;
    await Promise.all([gateway?.close(), theory.close()]);
  });

  it('warns and uses the fixed dev user for every request', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    gateway = buildApp({ logger: false, upstreams: { theory: urlOf(theory) } });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('dev mode'));
    warn.mockRestore();
    const res = await gateway.inject({ url: '/api/theory/scales', headers: { authorization: 'Bearer anything' } });
    expect(res.json().userId).toBe(DEV_USER_ID);
  });
});
