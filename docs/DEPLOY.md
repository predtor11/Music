# Putting it online (Vercel + Supabase)

The whole backend is one serverless function (`apps/api`) and the web app is static files, both served by one Vercel project. The database and sign-in stay on the existing Supabase project. No Redis, no always-on servers. The local `npm run dev:all` setup is unchanged.

## How it fits together

- `apps/api` loads the gateway's login check and every service (identity, curriculum, practice, progress, theory, recordings) into one process. A request to `/api/<service>/...` is handed to that service in memory. Services call each other directly and events go over an in-process bus that finishes before the response is sent, so nothing needs Redis.
- `npm run build:vercel` writes `.vercel/output` (Vercel's Build Output format): the web app as static files, the backend as `functions/api.func`, and a route table sending `/api/*` to the function and every other path to `index.html`.
- Sessions and attempts carry ids chosen by the app, and the server stores a repeated id once. That makes retries and offline sync safe.
- Limits: a request body can be at most about 4.5 MB on Vercel, so a very long recording take may not save (the local setup allows 8 MB). The function allows 30 s per request.

## One-time setup (Jayesh)

1. **Vercel**: sign up at vercel.com with GitHub, choose *Add New > Project*, import `predtor11/Music`. Leave the framework preset on *Other*; `vercel.json` already sets the install and build commands.
2. **Environment variables** (Project > Settings > Environment Variables, Production and Preview):

   | Name | Value | Secret? |
   | --- | --- | --- |
   | `SUPABASE_URL` | `https://iecxugzgkupflnayweyx.supabase.co` | no |
   | `SUPABASE_DB_URL` | the **transaction pooler** connection string (Supabase > Connect > Transaction pooler, port 6543) | **yes** |
   | `SUPABASE_JWT_SECRET` | only if the project still uses the legacy JWT secret; new projects need only `SUPABASE_URL` | **yes** |
   | `VITE_SUPABASE_URL` | same as `SUPABASE_URL` | no |
   | `VITE_SUPABASE_ANON_KEY` | the publishable (anon) key | no (public) |

   Set `SUPABASE_DB_URL` and `SUPABASE_JWT_SECRET` as *Sensitive* in Vercel. Never put them in the repo, the chat or the desktop installer.
3. **Database migrations**: the function does not migrate on start. The hosted project already has every migration applied. After a future change that adds a migration, run once with the same URL: `SUPABASE_DB_URL=... npm run migrate`.
4. **Supabase sign-in**: Authentication > URL Configuration: set *Site URL* to the Vercel address and add it (and `http://127.0.0.1:47800` for the desktop app) to *Redirect URLs*.
5. Deploy. Check `https://<your-site>/api/health` returns `{"status":"ok",...}`, then sign in and finish a lesson.

## Trying it before deploying

```bash
npm run build:vercel                                  # builds .vercel/output
API_DEV_MODE=1 npm run api                            # same backend as a plain server on :4100, in memory, no sign-in
SUPABASE_URL=... SUPABASE_DB_URL=... npm run api      # same, against the real database
```

Without `SUPABASE_URL` or `SUPABASE_JWT_SECRET` the function refuses to start (it will not fall back to a shared dev user in production). `API_DEV_MODE=1` allows that, for local use only.

## Fallback

If the serverless limits ever hurt, the same `apps/api` handler can run as a normal Node server on Railway (`npm run api`, with `SUPABASE_DB_URL` set) at roughly $5-15 a month; nothing else changes.
