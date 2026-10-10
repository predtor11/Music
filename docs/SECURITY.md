# Security notes

Review of the deployed app (2026-10-10): what is protected, what was fixed, what stays open.

## How it is protected

- **Login.** Every `/api` request is checked in `apps/api` (`compose.ts`) against Supabase's signing keys. A bad token is a 401; the user id comes only from the token, a browser-sent `x-user-id` is dropped. Services use `requireUserId`; public reads (curriculum, theory) need no login.
- **Other people's data.** Sessions, attempts, progress and recordings are looked up by the caller's id; someone else's id answers 404. A client-chosen id that already belongs to another user answers 409.
- **Database.** Only the API talks to Postgres. Every table has row level security on with no policies, and `anon`/`authenticated` have no access to the service schemas, so the Supabase public API sees nothing (the Supabase security advisor reports only that "RLS has no policy", which is the intent). The browser holds only the public anon key, used for sign-in.
- **Offline sync.** The outbox sends operations through the same API with the user's own token, so it cannot write to another account. Repeats are no-ops (ids chosen by the client, stored once).
- **Service worker.** Only public curriculum answers are cached; anything with a login is never stored.
- **Desktop app.** Sandboxed renderer with context isolation and no Node integration; external links open in the browser; the local server serves only the built files and forwards `/api`.
- **Headers.** CSP, HSTS, nosniff, frame and permissions policy on every response (`apps/api/build.mjs`); personal API answers are `private, no-store`.
- **Limits.** Bodies over 5 MB get 413; contracts bound attempt and settings fields; per-caller rate limit (below).

## Open items for the project owner

1. **Vercel firewall rate limit.** The in-app limiter counts per function instance. Add a rate-limit rule on `/api/*` (Vercel dashboard, Firewall, Rules) for a hard ceiling.
2. **Supabase leaked password protection** is off (Auth, Providers or Sign In / Up, password strength). It may need the Pro plan.
3. **Check `VITE_SUPABASE_ANON_KEY` on Vercel is the anon/publishable key**, never the service-role key. `/api/config` now refuses to serve a service-role key, but the build would still embed it in the web bundle.
4. Dev-only advisories remain in `npm audit` (vitest's `tinypool` and `concurrently`'s `shell-quote`); they are not in the deployed code and need a major vitest upgrade or an upstream fix. Dependabot is on to pick them up.
