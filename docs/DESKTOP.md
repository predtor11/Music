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

Settings live in `%APPDATA%\Music Theory Trainer\.env` (File > Open Settings File).

- **Sign-in works out of the box.** The installer carries the project's public Supabase URL and publishable key (they are meant for client apps and only allow sign-in calls), so the sign-in screen appears the same as in the browser. No secrets are bundled. Progress is saved as an event log (`events.jsonl` in the same folder) and replayed at start-up.
- **`MUSIC_LOCAL_ONLY=1`** turns sign-in off: the app is one local user with no account.
- **Filled in with the same values as the repo's `.env`** (service role, JWT secret, `SUPABASE_DB_URL`): progress is kept in the Supabase project, the same as the web version. Restart the app after editing.

Logs: Help > Open Service Log.
