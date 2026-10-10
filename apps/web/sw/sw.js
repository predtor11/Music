/*
 * Service worker: keeps the app and the course available with no internet
 * after one online visit. Hand-written; the build (swPlugin in vite.config.ts)
 * fills in BUILD and PRECACHE and writes it to dist/sw.js. See docs/OFFLINE.md.
 *
 *  - App shell and built files: saved at install, served from the cache.
 *  - Pages (navigations): the network first, so a new version arrives as soon
 *    as there is one; the saved copy when the network fails.
 *  - GET /api/curriculum/*: stale-while-revalidate. Answered from the saved
 *    copy at once and refreshed in the background.
 *  - Nothing else under /api is ever stored: sessions, progress, settings and
 *    recordings belong to one person. A request that carries a login (an
 *    Authorization header or cookies) is never stored either, whatever its path.
 */

const BUILD = '__BUILD_ID__';
const PRECACHE = /*__PRECACHE__*/ [];

const SHELL_CACHE = `music-shell-${BUILD}`;
const CURRICULUM_CACHE = 'music-curriculum-v1';
const SHELL_PAGE = '/index.html';
const NAVIGATION_TIMEOUT_MS = 4000;

const isCurriculum = (url) => url.pathname.startsWith('/api/curriculum/');
const isStatic = (url) => url.pathname.startsWith('/assets/') || PRECACHE.includes(url.pathname);

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // All or nothing: a half-saved app would be worse than none.
      await Promise.all(
        PRECACHE.map(async (path) => {
          const response = await fetch(new Request(path, { cache: 'reload' }));
          if (!response.ok) throw new Error(`precache: ${path} answered ${response.status}`);
          await cache.put(path, response);
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith('music-shell-') && name !== SHELL_CACHE) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    if (isCurriculum(url) && !carriesLogin(request)) event.respondWith(staleWhileRevalidate(event, request, url));
    return; // everything else under /api goes straight to the network
  }
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstPage(request));
    return;
  }
  if (isStatic(url)) event.respondWith(cacheFirst(request, url));
});

/** True when the request is made as a particular person, so its answer may be theirs alone. */
function carriesLogin(request) {
  return request.headers.has('authorization') || request.headers.has('cookie');
}

/** True when the answer may be stored and shown to anyone. */
function shareable(response) {
  if (!response || response.status !== 200 || response.type !== 'basic') return false;
  if (response.headers.has('set-cookie')) return false;
  if (/\b(private|no-store)\b/i.test(response.headers.get('cache-control') ?? '')) return false;
  if (/\b(authorization|cookie|\*)\b/i.test(response.headers.get('vary') ?? '')) return false;
  return true;
}

async function staleWhileRevalidate(event, request, url) {
  const cache = await caches.open(CURRICULUM_CACHE);
  const key = new Request(url.origin + url.pathname + url.search);
  const cached = await cache.match(key);
  const refresh = fetch(request).then(async (response) => {
    if (shareable(response)) await cache.put(key, response.clone());
    return response;
  });
  if (cached) {
    event.waitUntil(refresh.catch(() => undefined));
    return cached;
  }
  return refresh;
}

async function networkFirstPage(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await withTimeout(fetch(request), NAVIGATION_TIMEOUT_MS);
    // Keep the newest page for next time (the desktop app puts its settings in it).
    if (response.ok && response.type === 'basic' && (response.headers.get('content-type') ?? '').includes('text/html')) {
      await cache.put(SHELL_PAGE, response.clone());
    }
    return response;
  } catch (error) {
    const saved = await cache.match(SHELL_PAGE);
    if (saved) return saved;
    throw error;
  }
}

async function cacheFirst(request, url) {
  const cache = await caches.open(SHELL_CACHE);
  const saved = (await cache.match(url.pathname)) ?? (await cache.match(request));
  if (saved) return saved;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
  return response;
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
