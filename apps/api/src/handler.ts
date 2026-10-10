import { existsSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createApi, optionsFromEnv, type ApiOptions } from './compose.js';

type Api = Awaited<ReturnType<typeof createApi>>;

let cached: Promise<Api> | null = null;

/** One backend per warm function instance; a failed start is retried on the next request. */
function api(options?: ApiOptions): Promise<Api> {
  if (!cached) {
    // In the deployed bundle the curriculum JSON sits next to index.mjs.
    const bundled = fileURLToPath(new URL('./content', import.meta.url));
    const defaults = optionsFromEnv();
    if (!defaults.contentDir && existsSync(bundled)) defaults.contentDir = bundled;
    cached = createApi(options ?? defaults).catch((error: unknown) => {
      cached = null;
      throw error;
    });
  }
  return cached;
}

/** Vercel refuses bodies over 4.5 MB itself; this keeps the same ceiling anywhere else the handler runs. */
export const MAX_BODY_BYTES = 5 * 1024 * 1024;

class BodyTooLarge extends Error {}

async function readBody(req: IncomingMessage): Promise<Buffer | undefined> {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new BodyTooLarge();
    chunks.push(chunk as Buffer);
  }
  return chunks.length > 0 ? Buffer.concat(chunks) : undefined;
}

/** The Node request handler Vercel (and the local server) calls. */
export function createHandler(options?: ApiOptions) {
  return async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const declared = Number(req.headers['content-length'] ?? 0);
      if (declared > MAX_BODY_BYTES) throw new BodyTooLarge();
      const backend = await api(options);
      const out = await backend.handle({
        method: req.method ?? 'GET',
        url: req.url ?? '/',
        headers: req.headers,
        body: await readBody(req),
      });
      for (const [k, v] of Object.entries(out.headers)) if (v !== undefined) res.setHeader(k, v);
      res.statusCode = out.status;
      res.end(out.body);
    } catch (error) {
      if (error instanceof BodyTooLarge) {
        res.statusCode = 413;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ error: 'payload_too_large' }));
        return;
      }
      console.error('[api] start-up or request failed', error);
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'internal_error' }));
    }
  };
}

export default createHandler();
