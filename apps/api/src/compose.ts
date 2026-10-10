import {
  ProgressSchema,
  ReviewQueueSchema,
  SERVICES,
  UnitListSchema,
  UnitSchema,
  LessonSchema,
  USER_ID_HEADER,
  type Lesson,
  type Progress,
  type ServiceName,
  type SkillScore,
  type Unit,
} from '@music/contracts';
import { InMemoryEventBus, type EventBus } from '@music/service-kit';
import type { FastifyInstance } from 'fastify';
import type { JWTVerifyGetKey } from 'jose';
import { buildApp as buildCurriculum } from '../../../services/curriculum/src/app.js';
import { buildApp as buildIdentity } from '../../../services/identity/src/app.js';
import { PostgresProfileStore } from '../../../services/identity/src/postgres-store.js';
import { InMemoryProfileStore } from '../../../services/identity/src/store.js';
import { bearerToken, supabaseJwks, verifySupabaseToken, DEV_USER_ID, type TokenKeys } from '../../../services/gateway/src/auth.js';
import { buildApp as buildPractice } from '../../../services/practice/src/app.js';
import type { CurriculumClient } from '../../../services/practice/src/curriculum-client.js';
import { PostgresPracticeRepository } from '../../../services/practice/src/postgres.js';
import type { ProgressClient } from '../../../services/practice/src/progress-client.js';
import { InMemoryPracticeRepository, type PracticeRepository } from '../../../services/practice/src/repository.js';
import { buildApp as buildProgress } from '../../../services/progress/src/app.js';
import type { Catalog } from '../../../services/progress/src/catalog.js';
import { PostgresProgressRepository } from '../../../services/progress/src/postgres.js';
import { InMemoryProgressRepository, type ProgressRepository } from '../../../services/progress/src/repository.js';
import type { CatalogUnit } from '../../../services/progress/src/unlocks.js';
import { buildApp as buildRecordings } from '../../../services/recordings/src/app.js';
import { PostgresRecordingStore } from '../../../services/recordings/src/postgres-store.js';
import { InMemoryRecordingStore } from '../../../services/recordings/src/store.js';
import { buildApp as buildTheory } from '../../../services/theory/src/app.js';

type Downstream = Exclude<ServiceName, 'gateway'>;

export interface ApiOptions {
  /** Postgres connection string (the Supabase pooler). Without it everything is kept in memory, for tests and local runs. */
  dbUrl?: string;
  /** Apply the services' SQL migrations on start. Off in production: run `npm run migrate -w @music/api` at deploy instead. */
  migrate?: boolean;
  /** Folder with the curriculum JSON; defaults to the one next to the curriculum service. */
  contentDir?: string;
  supabaseUrl?: string;
  jwtSecret?: string;
  /** Signing keys to use instead of fetching them from supabaseUrl (tests). */
  jwks?: JWTVerifyGetKey;
  /** Allow requests with no way to check logins (every request is the dev user). Only for tests and local runs. */
  devMode?: boolean;
  /** Public sign-in settings handed out by GET /api/config (the same values the web app is built with). */
  publicSupabaseUrl?: string;
  publicSupabaseAnonKey?: string;
  logger?: boolean;
}

export interface ApiRequest {
  method: string;
  /** Path and query, for example /api/practice/sessions?x=1 */
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body?: Buffer | string;
}

export interface ApiResponse {
  status: number;
  headers: Record<string, string | string[] | number | undefined>;
  body: Buffer;
}

function json(status: number, body: unknown): ApiResponse {
  return { status, headers: { 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff' }, body: Buffer.from(JSON.stringify(body)) };
}

/** Serves the content of one in-process service like fetch() would, for the service-to-service clients. */
async function get(app: FastifyInstance, url: string, userId?: string): Promise<unknown> {
  const res = await app.inject({ method: 'GET', url, headers: userId ? { [USER_ID_HEADER]: userId } : {} });
  if (res.statusCode === 404) return null;
  if (res.statusCode >= 400) throw Object.assign(new Error(`service answered ${res.statusCode} for ${url}`), { statusCode: 502 });
  return res.json();
}

/**
 * The whole backend in one process: the gateway's login check, then every
 * service. A request to /api/<service>/... is handed to that service in
 * memory (no ports, no HTTP between services). Services call each other
 * directly, and events go over an in-process bus whose handlers finish
 * before the response is sent, so no Redis and no always-on process is
 * needed. Postgres holds everything that must last.
 */
export async function createApi(options: ApiOptions = {}) {
  const dbUrl = options.dbUrl;
  // On Vercel an in-memory fallback would silently lose every learner's progress.
  if (!dbUrl && process.env.VERCEL) throw new Error('Set SUPABASE_DB_URL (the Supabase transaction pooler string) in the Vercel project settings.');
  const migrate = options.migrate ?? false;
  const keys: TokenKeys = {
    secret: options.jwtSecret ? new TextEncoder().encode(options.jwtSecret) : undefined,
    jwks: options.jwks ?? (options.supabaseUrl ? supabaseJwks(options.supabaseUrl) : undefined),
  };
  const canCheckLogins = Boolean(keys.secret || keys.jwks);
  if (!canCheckLogins && !options.devMode) {
    throw new Error('Set SUPABASE_URL (or SUPABASE_JWT_SECRET) so logins can be checked.');
  }
  // A leftover API_DEV_MODE=1 must never turn a deployed site into one shared account.
  if (!canCheckLogins && process.env.VERCEL) throw new Error('API_DEV_MODE cannot be used on Vercel: set SUPABASE_URL so logins are checked.');
  const publicAnonKey = options.publicSupabaseAnonKey && !isPrivilegedKey(options.publicSupabaseAnonKey) ? options.publicSupabaseAnonKey : '';
  if (options.publicSupabaseAnonKey && !publicAnonKey) {
    console.error('[api] VITE_SUPABASE_ANON_KEY holds a service-role or secret key. Not serving it; replace it with the anon/publishable key and rotate the exposed key.');
  }
  const limiter = new RateLimiter();

  const bus: EventBus = new InMemoryEventBus();
  const pool = { max: 1, migrate };

  const curriculum = buildCurriculum({ logger: options.logger, contentDir: options.contentDir });
  const theory = buildTheory({ logger: options.logger });

  const profileStore = dbUrl ? await PostgresProfileStore.connect(dbUrl, pool) : new InMemoryProfileStore();
  const identity = buildIdentity({ logger: options.logger, store: profileStore, bus });

  const practiceRepo: PracticeRepository = dbUrl ? await PostgresPracticeRepository.connect(dbUrl, pool) : new InMemoryPracticeRepository();
  const progressRepo: ProgressRepository = dbUrl ? PostgresProgressRepository.connect(dbUrl, { max: 1 }) : new InMemoryProgressRepository();

  let unitList: CatalogUnit[] | null = null;
  const catalog: Catalog = {
    async units() {
      if (!unitList) {
        const units = UnitListSchema.parse(await get(curriculum, '/units'));
        unitList = units.map(({ id, instrument, order, lessonIds }) => ({ id, instrument, order, lessonIds }));
      }
      return unitList;
    },
  };
  const progress = await buildProgress({ logger: options.logger, repo: progressRepo, catalog, bus });

  const curriculumClient: CurriculumClient = {
    async getLesson(id): Promise<Lesson | null> {
      const body = await get(curriculum, `/lessons/${encodeURIComponent(id)}`);
      return body === null ? null : LessonSchema.parse(body);
    },
    async getUnit(id): Promise<Unit | null> {
      const body = await get(curriculum, `/units/${encodeURIComponent(id)}`);
      return body === null ? null : UnitSchema.parse(body);
    },
  };
  const progressClient: ProgressClient = {
    async getProgress(userId): Promise<Progress> {
      return ProgressSchema.parse(await get(progress, '/', userId));
    },
    async getReviewQueue(userId): Promise<SkillScore[]> {
      return ReviewQueueSchema.parse(await get(progress, '/review-queue', userId));
    },
  };
  const practice = buildPractice({ logger: options.logger, repo: practiceRepo, bus, curriculum: curriculumClient, progress: progressClient });

  const recordingStore = dbUrl ? await PostgresRecordingStore.connect(dbUrl, pool) : new InMemoryRecordingStore();
  const recordings = buildRecordings({ logger: options.logger, store: recordingStore });

  const services: Record<Downstream, FastifyInstance> = { identity, curriculum, practice, progress, theory, recordings };
  const prefixes = (Object.keys(services) as Downstream[]).map((name) => ({ name, prefix: SERVICES[name].prefix }));

  /** Handles one request exactly like the gateway plus the service would have. */
  async function handle(req: ApiRequest): Promise<ApiResponse> {
    const [path = ''] = req.url.split('?');
    if (path === SERVICES.gateway.prefix + '/health') {
      return json(200, { service: 'api', status: 'ok', services: Object.keys(services) });
    }
    if (path === SERVICES.gateway.prefix + '/config') {
      // The public sign-in settings (never a secret), so the desktop app needs no setup of its own.
      return json(200, { supabaseUrl: options.publicSupabaseUrl ?? '', supabaseAnonKey: publicAnonKey });
    }
    const target = prefixes.find(({ prefix }) => path === prefix || path.startsWith(`${prefix}/`));
    if (!target) return json(404, { error: 'not found' });

    const mutating = req.method !== 'GET' && req.method !== 'HEAD';
    const caller = clientAddress(req.headers);
    // Cheap guard first: a flood from one address is turned away before any token or database work.
    if (!limiter.take(`ip:${caller}`, 600)) return tooMany();

    let userId: string | undefined;
    if (!canCheckLogins) {
      userId = DEV_USER_ID;
    } else {
      try {
        const token = bearerToken(headerValue(req.headers.authorization));
        if (token) userId = await verifySupabaseToken(token, keys);
      } catch (error) {
        return json(401, { error: (error as Error).message });
      }
    }

    if (userId && !limiter.take(`user:${userId}`, mutating ? 120 : 600)) return tooMany();

    // Only the login check decides who the user is; a header from the browser is dropped.
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      const value = headerValue(v);
      const key = k.toLowerCase();
      if (value === undefined || key === USER_ID_HEADER || key === 'host' || key === 'content-length' || key === 'authorization') continue;
      headers[key] = value;
    }
    if (userId) headers[USER_ID_HEADER] = userId;

    const url = req.url.slice(target.prefix.length) || '/';
    const res = await services[target.name].inject({
      method: req.method as 'GET',
      url: url.startsWith('/') ? url : `/${url}`,
      headers,
      payload: req.body,
    });
    const out: ApiResponse['headers'] = {};
    for (const [k, v] of Object.entries(res.headers)) {
      if (k === 'content-length' || k === 'connection' || k === 'transfer-encoding') continue;
      out[k] = v as string | string[] | number | undefined;
    }
    out['x-content-type-options'] = 'nosniff';
    // Answers about one person must never be kept by a browser or shared cache; the curriculum and theory are public.
    if (target.name !== 'curriculum' && target.name !== 'theory') out['cache-control'] = 'private, no-store';
    return { status: res.statusCode, headers: out, body: res.rawPayload };
  }

  async function close(): Promise<void> {
    await Promise.all(Object.values(services).map((s) => s.close()));
    await bus.close();
  }

  return { handle, close, services };
}

const tooMany = (): ApiResponse => ({ ...json(429, { error: 'too_many_requests' }), headers: { 'content-type': 'application/json; charset=utf-8', 'retry-after': '30' } });

/** The address Vercel saw (it sets x-forwarded-for itself and drops any the client sent). */
function clientAddress(headers: ApiRequest['headers']): string {
  return (headerValue(headers['x-forwarded-for']) ?? 'local').split(',')[0]!.trim() || 'local';
}

/** True for a Supabase service-role / secret key, which must never reach a browser. */
export function isPrivilegedKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true;
  try {
    const payload = JSON.parse(Buffer.from(key.split('.')[1] ?? '', 'base64url').toString('utf8')) as { role?: string };
    return payload.role === 'service_role';
  } catch {
    return false;
  }
}

/**
 * Requests per minute per key, counted in this function instance. Instances do
 * not share counts, so this slows a runaway loop or a script but is not a
 * substitute for a Vercel firewall rule (docs/SECURITY.md).
 */
export class RateLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();
  constructor(private readonly now: () => number = Date.now) {}
  take(key: string, limitPerMinute: number): boolean {
    const t = this.now();
    if (this.windows.size > 5000) for (const [k, w] of this.windows) if (t - w.start >= 60_000) this.windows.delete(k);
    const w = this.windows.get(key);
    if (!w || t - w.start >= 60_000) {
      this.windows.set(key, { start: t, count: 1 });
      return true;
    }
    w.count += 1;
    return w.count <= limitPerMinute;
  }
}

function headerValue(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** The options a deployment reads from its environment (Vercel project settings). */
export function optionsFromEnv(env: NodeJS.ProcessEnv = process.env): ApiOptions {
  return {
    dbUrl: env.SUPABASE_DB_URL || undefined,
    migrate: env.MIGRATE_ON_START === '1',
    contentDir: env.CURRICULUM_CONTENT_DIR || undefined,
    supabaseUrl: env.SUPABASE_URL || undefined,
    jwtSecret: env.SUPABASE_JWT_SECRET || undefined,
    devMode: env.API_DEV_MODE === '1',
    publicSupabaseUrl: env.VITE_SUPABASE_URL || env.SUPABASE_URL || undefined,
    publicSupabaseAnonKey: env.VITE_SUPABASE_ANON_KEY || undefined,
    logger: false,
  };
}

