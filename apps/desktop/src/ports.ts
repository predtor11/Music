/**
 * Fixed ports for the desktop app, away from `npm run dev:all` (4000-4005 and
 * 5173) so both can run on one computer. The window's address must stay the
 * same between launches, or the browser storage (sign-in, settings) is lost.
 */
export const WEB_PORT = 47800;

export const SERVICE_PORTS = {
  gateway: 47801,
  identity: 47802,
  curriculum: 47803,
  practice: 47804,
  progress: 47805,
  theory: 47806,
} as const;

export type DesktopService = keyof typeof SERVICE_PORTS;
