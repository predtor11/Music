import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { SERVICES, USER_ID_HEADER, type HealthResponse, type ServiceName } from '@music/contracts';

export interface ServiceOptions {
  name: ServiceName;
  version?: string;
  /** Pino logging; off in tests. */
  logger?: boolean;
}

/** A Fastify app with GET /health and JSON errors, ready for a service's routes. */
export function createService(options: ServiceOptions): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? process.env.NODE_ENV !== 'test' });
  const health: HealthResponse = { service: options.name, status: 'ok', version: options.version ?? '0.1.0' };
  app.get('/health', async () => health);
  app.setErrorHandler((error: Error & { statusCode?: number; issues?: unknown }, _req, reply) => {
    // zod errors carry `issues`; report them as 400s.
    if (error.issues) return reply.status(400).send({ error: 'invalid_request', issues: error.issues });
    const status = error.statusCode ?? 500;
    if (status >= 500) app.log.error(error);
    return reply.status(status).send({ error: status >= 500 ? 'internal_error' : error.message });
  });
  return app;
}

/** Port from PORT, or the service's default from @music/contracts. */
export function servicePort(name: ServiceName): number {
  return Number(process.env.PORT ?? SERVICES[name].port);
}

export async function startService(app: FastifyInstance, name: ServiceName): Promise<void> {
  await app.listen({ port: servicePort(name), host: process.env.HOST ?? '0.0.0.0' });
}

/** The signed-in user's id, set by the gateway after it checks the login. */
export function requireUserId(req: FastifyRequest): string {
  const id = req.headers[USER_ID_HEADER];
  if (typeof id !== 'string' || id.length === 0) {
    throw Object.assign(new Error('not signed in'), { statusCode: 401 });
  }
  return id;
}

/** Reads a required environment variable or fails at start-up with a clear message. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}. See .env.example.`);
  return value;
}
