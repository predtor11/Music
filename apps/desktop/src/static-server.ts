import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, request, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { createApiProxy, type RuntimeConfig } from './remote.js';

export type { RuntimeConfig };

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.webmanifest': 'application/manifest+json',
};

/** index.html with the run-time settings the web app reads (window.__MUSIC_CONFIG__). */
export function injectConfig(html: string, config: RuntimeConfig): string {
  // `<` is escaped so a value can never close the script tag.
  const json = JSON.stringify(config).replace(/</g, '\\u003c');
  return html.replace('<head>', `<head>\n    <script>window.__MUSIC_CONFIG__ = ${json};</script>`);
}

/** The file under `root` for a URL path, or null when it would leave `root`. */
export function resolveStatic(root: string, urlPath: string): string | null {
  let path: string;
  try {
    path = decodeURIComponent(urlPath.split('?')[0]!);
  } catch {
    return null;
  }
  const file = normalize(join(root, path));
  if (file !== root && !file.startsWith(root.endsWith(sep) ? root : root + sep)) return null;
  return file;
}

function proxy(req: IncomingMessage, res: ServerResponse, port: number): void {
  const upstream = request(
    { host: '127.0.0.1', port, method: req.method, path: req.url, headers: req.headers },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'service_unavailable' }));
  });
  req.pipe(upstream);
}

/**
 * Serves the built web app and forwards /api to the local gateway (like Vite's
 * dev server does in `npm run dev:all`) or, with `apiUrl`, to the hosted API.
 * Unknown paths get index.html (client-side routes).
 */
export function createStaticServer(options: { webDir: string; gatewayPort?: number; apiUrl?: URL; config: RuntimeConfig }): Server {
  const root = normalize(options.webDir);
  const index = injectConfig(readFileSync(join(root, 'index.html'), 'utf8'), options.config);
  const forward = options.apiUrl
    ? createApiProxy(options.apiUrl)
    : (req: IncomingMessage, res: ServerResponse) => proxy(req, res, options.gatewayPort ?? 0);

  return createServer((req, res) => {
    const url = req.url ?? '/';
    if (url === '/api' || url.startsWith('/api/') || url.startsWith('/api?')) return forward(req, res);
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }
    const file = resolveStatic(root, url);
    if (!file) {
      res.writeHead(404).end();
      return;
    }
    if (existsSync(file) && statSync(file).isFile() && !file.endsWith(`${sep}index.html`)) {
      const hashed = file.includes(`${sep}assets${sep}`);
      res.writeHead(200, {
        'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
        'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
      });
      if (req.method === 'HEAD') return void res.end();
      createReadStream(file).pipe(res);
      return;
    }
    if (extname(file) && !file.endsWith('.html')) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': TYPES['.html']!, 'cache-control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : index);
  });
}
