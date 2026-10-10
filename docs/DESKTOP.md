# Desktop app (Windows)

`apps/desktop` wraps the web app and every service in one Electron app. Installing it needs no Node, npm, Docker or Redis.

## Get the installer

GitHub Actions > **Desktop installer** > the latest run > Artifacts > `Music-Theory-Trainer-Windows`. It holds `Music-Theory-Trainer-Setup-<version>.exe`. The workflow runs on every push to main that touches the app, and by hand from the Actions tab.

To build it yourself on Windows: `npm ci`, then `npm run dist -w @music/desktop`. The installer lands in `apps/desktop/release/`. `npm run start -w @music/desktop` opens the app without installing it.

The installer is not code-signed, so Windows SmartScreen says "Windows protected your PC". Click **More info**, then **Run anyway**.

## How it works

- The window loads `http://127.0.0.1:47800`. A background Node process (`src/server.ts`) runs all six services on 47801-47806 and serves the built web app, forwarding `/api` to the gateway. These ports stay clear of `npm run dev:all` (4000-4005, 5173), so both can run at once.
- The services share one in-memory event bus, so Redis is never needed.
- MIDI is allowed for the app's own page only.

## Settings and data

Settings live in `%APPDATA%\Music Theory Trainer\.env` (File > Open Settings File). The installer carries no settings or keys.

- **Left empty (anyone who installs it):** no account; the app is one local user. Progress is saved as an event log (`events.jsonl` in the same folder) and replayed at start-up. Settings such as note names stay in the app's browser storage.
- **Online account (recommended): `MUSIC_API_URL` set.** See below.
- **Filled in with the same values as the repo's `.env` (advanced):** the app still runs every service itself, but with sign-in and progress in your own Supabase project. This needs the server-side secrets on your computer, so prefer the online account. Restart the app after editing.

Logs: Help > Open Service Log.

## Using your online account

The backend is one serverless API on Vercel (`apps/api`, see `docs/DEPLOY.md`) at the same address as the web app. The desktop app can use it, so the same account and progress show up on the web and on the desktop. Nothing secret is involved: the database key stays on the server, the installer carries no addresses or keys, and the app only ever holds the public Supabase URL and anon key plus your own sign-in token.

1. File > **Use Online Account...** (shown automatically on first launch) opens the settings file. Set:

   ```
   MUSIC_API_URL=https://your-site.vercel.app
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=<the public anon key>
   ```

   `MUSIC_API_URL` is the hosted site's address (the path is ignored). The two `VITE_` values are the same public ones the web build uses (plain `SUPABASE_URL` / `SUPABASE_ANON_KEY` also work as a fallback). Never put the service-role key, JWT secret or database URL here.
2. File > **Restart**.

With `MUSIC_API_URL` set, the background process starts none of the six services and keeps no journal. It serves the built web app on `127.0.0.1:47800` and forwards `/api/*` to `MUSIC_API_URL/api/*`: the request body and the `Authorization: Bearer` header go through, the response is streamed back, `Host` is the hosted site's, `Origin` is rewritten to it, and cookies are not forwarded. If the hosted API cannot be reached the app answers `502 {"error":"api_unreachable"}`; the web app keeps loading from the installed files and falls back to its offline mode. Leave `MUSIC_API_URL` empty for the original all-local behaviour.

### Signing in

The web app signs in with email and password (Supabase Auth, `signInWithPassword` / `signUp`) from the window itself; there is no OAuth or magic-link redirect, so signing in needs no redirect at all. The only redirect is the confirmation link in the sign-up email: the app asks Supabase to send it to `http://127.0.0.1:47800/`, the window's own address.

**Jayesh must add `http://127.0.0.1:47800` to Supabase > Authentication > URL Configuration > Redirect URLs** (already listed in `docs/DEPLOY.md`). Without it Supabase falls back to the Site URL (the Vercel address) for the confirmation link. Confirming the address works either way, because the link only confirms the email: open it, then sign in in the app. (The link opens in the default browser, not the app window, and the app must be running for the `127.0.0.1` address to load.) If email confirmation is switched off in Supabase, sign-up signs in immediately and no link is involved.
