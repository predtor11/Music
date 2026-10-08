import { jwtVerify } from 'jose';

/** Used for every request when SUPABASE_JWT_SECRET is unset, so the app runs locally without Supabase. */
export const DEV_USER_ID = '00000000-0000-4000-8000-000000000001';

export class AuthError extends Error {
  readonly statusCode = 401;
}

/**
 * Checks a Supabase access token (HS256, signed with the project's JWT
 * secret) and returns the user id from its `sub` claim.
 */
export async function verifySupabaseToken(token: string, secret: Uint8Array): Promise<string> {
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'] });
    // The anon and service-role keys are signed with the same secret but carry no user.
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) throw new AuthError('token has no user');
    return payload.sub;
  } catch (error) {
    if (error instanceof AuthError) throw error;
    throw new AuthError('invalid token');
  }
}

/** The token from `Authorization: Bearer <token>`, undefined when there is no header. */
export function bearerToken(header: string | undefined): string | undefined {
  if (header === undefined) return undefined;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match?.[1]) throw new AuthError('malformed authorization header');
  return match[1];
}
