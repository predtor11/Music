import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify, type JWTVerifyGetKey } from 'jose';

/** Used for every request when no way to check tokens is configured, so the app runs locally without Supabase. */
export const DEV_USER_ID = '00000000-0000-4000-8000-000000000001';

export class AuthError extends Error {
  readonly statusCode = 401;
}

/**
 * How to check a Supabase access token. Projects on the legacy JWT secret
 * sign with HS256; projects on signing keys (the default for new projects)
 * sign with ES256 or RS256 and publish the public keys as a JWKS.
 */
export interface TokenKeys {
  /** The project's legacy JWT secret, for HS256 tokens. */
  secret?: Uint8Array;
  /** The project's public signing keys, for asymmetric tokens. */
  jwks?: JWTVerifyGetKey;
}

const ASYMMETRIC = ['ES256', 'RS256', 'EdDSA'];

/** The public signing keys of a Supabase project, fetched and cached by jose. */
export function supabaseJwks(supabaseUrl: string): JWTVerifyGetKey {
  return createRemoteJWKSet(new URL('/auth/v1/.well-known/jwks.json', supabaseUrl));
}

/** Checks a Supabase access token and returns the user id from its `sub` claim. */
export async function verifySupabaseToken(token: string, keys: TokenKeys): Promise<string> {
  try {
    const { alg } = decodeProtectedHeader(token);
    let payload;
    if (alg === 'HS256') {
      if (!keys.secret) throw new AuthError('HS256 tokens need SUPABASE_JWT_SECRET');
      ({ payload } = await jwtVerify(token, keys.secret, { algorithms: ['HS256'] }));
    } else {
      if (!keys.jwks) throw new AuthError('signing-key tokens need SUPABASE_URL');
      ({ payload } = await jwtVerify(token, keys.jwks, { algorithms: ASYMMETRIC }));
    }
    // The anon and service-role keys are signed the same way but carry no user.
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
