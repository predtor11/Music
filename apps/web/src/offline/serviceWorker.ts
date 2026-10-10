/**
 * Registers the service worker that keeps the app shell and the curriculum
 * available offline (see public/sw.js and docs/OFFLINE.md). Production builds
 * only: in development a worker would serve stale files and fight hot reload.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  // Worker needs http(s); the desktop app serves the same build from localhost.
  if (!location.protocol.startsWith('http')) return;
  const register = () => {
    navigator.serviceWorker.register('/sw.js').catch((error: unknown) => console.warn('offline: service worker not registered', error));
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
