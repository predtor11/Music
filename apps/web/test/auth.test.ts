import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, getMe, setTokenSource } from '../src/api/client.js';
import { friendlyAuthError } from '../src/auth/messages.js';
import { saveFailure } from '../src/lesson/usePractice.js';

const ME = { id: '6f1c5f5e-6a43-4b3b-9d3c-0d6c2f8f2f12', displayName: 'Pianist', createdAt: '2026-10-08T07:00:00.000Z', settings: {} };

describe('api client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setTokenSource(async () => null);
  });

  it('puts the access token on every call as a Bearer header', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(ME), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    setTokenSource(async () => 'tok-123');
    await getMe();
    expect(fetch).toHaveBeenCalledWith('/api/identity/me', expect.objectContaining({ headers: expect.objectContaining({ authorization: 'Bearer tok-123' }) }));
  });

  it('sends no Authorization header when signed out', async () => {
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify(ME), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    await getMe();
    expect(fetch.mock.calls[0]![1].headers).not.toHaveProperty('authorization');
  });
});

describe('why saving stopped', () => {
  it('asks you to sign in on a 401', () => {
    expect(saveFailure(new ApiError('sign in required', 401))).toBe('signed-out');
  });
  it('says the server is unreachable only for real failures', () => {
    expect(saveFailure(new ApiError("Can't reach the app server.", 0))).toBe('offline');
    expect(saveFailure(new ApiError('boom', 502))).toBe('offline');
  });
});

describe('sign-in errors', () => {
  it('turns Supabase errors into plain words', () => {
    expect(friendlyAuthError({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe("That email and password don't match an account.");
    expect(friendlyAuthError({ message: 'Email not confirmed' })).toMatch(/Confirm your email/);
    expect(friendlyAuthError({ code: 'user_already_exists' })).toMatch(/already an account/);
    expect(friendlyAuthError({ message: 'Something odd' })).toBe('Something odd');
  });
});
