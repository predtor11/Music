import { createService } from '@music/service-kit';

/**
 * The practice service. Stub: only GET /health so far.
 * See docs/ARCHITECTURE.md for what this service owns and its endpoints.
 */
export function buildApp(options: { logger?: boolean } = {}) {
  const app = createService({ name: 'practice', ...options });
  return app;
}
