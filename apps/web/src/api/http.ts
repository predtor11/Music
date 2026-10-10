/**
 * The one place that talks HTTP to /api: adds the sign-in token, times out
 * stuck calls, and turns failures into ApiError (status 0 means the server
 * could not be reached at all).
 */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Gives the current Supabase access token, or null when signed out. */
export type TokenSource = () => Promise<string | null>;

let tokenSource: TokenSource = async () => null;

/** Called once by the auth provider; every later call carries the token as a Bearer header. */
export function setTokenSource(source: TokenSource): void {
  tokenSource = source;
}

/** How long a call waits for an answer before giving up, so a stuck server never leaves a screen loading. */
const TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS) || 15_000;

export async function call(path: string, init?: RequestInit): Promise<unknown> {
  let res: Response;
  try {
    // The course is the same for everyone, so it goes out without the token. That is what lets the
    // service worker keep a copy for offline use without ever storing something personal.
    const token = path.startsWith('/curriculum/') ? null : await tokenSource().catch(() => null);
    res = await fetch(`/api${path}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError("Can't reach the app server.", 0);
  }
  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const message = (body as { message?: string } | null)?.message ?? `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }
  return body;
}
