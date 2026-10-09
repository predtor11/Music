/**
 * Every service, its local port and the path prefix the gateway forwards to
 * it. The gateway is the only address the web app calls.
 */

export const SERVICES = {
  gateway: { port: 4000, prefix: '/api' },
  identity: { port: 4001, prefix: '/api/identity' },
  curriculum: { port: 4002, prefix: '/api/curriculum' },
  practice: { port: 4003, prefix: '/api/practice' },
  progress: { port: 4004, prefix: '/api/progress' },
  theory: { port: 4005, prefix: '/api/theory' },
  recordings: { port: 4006, prefix: '/api/recordings' },
} as const;

export type ServiceName = keyof typeof SERVICES;

/** Each service answers GET /health with this. */
export interface HealthResponse {
  service: ServiceName;
  status: 'ok';
  version: string;
}

/** Header the gateway sets after checking the login, read by downstream services. */
export const USER_ID_HEADER = 'x-user-id';
