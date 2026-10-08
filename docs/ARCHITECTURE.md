# Architecture and conventions

Read this before changing code. The full plan lives in the Claude Doc
"Music Theory Trainer: Plan".

## Layout

| Path | What | Owner of changes |
| --- | --- | --- |
| `packages/theory` | Theory engine: notes, scales, chords, Roman numerals, sargam, graders. Pure functions, no I/O. | theory work |
| `packages/midi` | MIDI parsing, held notes, chord grouping, `MidiSource` (Web MIDI today, native later) | MIDI work |
| `packages/contracts` | zod schemas + types for every API body and event. The single source of truth between app and services. | integrator (change by PR comment, not silently) |
| `packages/service-kit` | `createService()` (Fastify + `/health` + JSON errors), `requireUserId()`, `EventBus` + `InMemoryEventBus` | platform work |
| `packages/ui` | Design system: tokens, dark and light themes, motion presets, base components. See `docs/UI.md`. | integrator |
| `apps/web` | React app (Vite), built on `@music/ui`. Grades MIDI in the browser, calls only the gateway at `/api`. | web work |
| `services/gateway` | Single entry point on port 4000. Checks the Supabase login, sets `x-user-id`, proxies `/api/<service>/*`. | platform work |
| `services/identity` | Users and settings. Port 4001. Emits `user.created`. | identity work |
| `services/curriculum` | Units, lessons, test items as JSON content. Port 4002. Read-only API. | curriculum work |
| `services/practice` | Sessions and attempts. Port 4003. Emits `attempt.recorded`, `session.ended`. | practice work |
| `services/progress` | Unlocks, skill scores, review queue, progress report. Port 4004. Listens to `attempt.recorded`, `session.ended`. | progress work |
| `services/theory` | HTTP wrapper over `@music/theory` (chord and scale lookups). Port 4005. Stores nothing. | theory work |

Ports and route prefixes are in `packages/contracts/src/services.ts`.

## Rules

- **MIDI is graded in the browser.** Services never sit between a key press and its feedback.
- **Each service owns its data.** One Postgres schema per service in the Supabase database (`identity`, `practice`, `progress`; curriculum content is JSON files). No service reads another's schema; it calls the API or listens to events.
- **Contracts first.** Request and response bodies, and event payloads, come from `@music/contracts`. Validate input with the schema (`Schema.parse(req.body)`); zod errors become 400s automatically.
- **Events are at-least-once.** Handlers must be safe to run twice (use the event `id`).
- **Services trust `x-user-id` only from the gateway.** Use `requireUserId(req)`.
- **Every service has** `src/app.ts` exporting `buildApp()` (testable with `app.inject`) and `src/main.ts` that starts it.
- **Tests:** Vitest next to each package in `test/`. `npm test` must pass before pushing.
- **Package names:** services are `@music/<name>-service`; packages are `@music/<name>`.

## Working in parallel

Each piece of work has its own branch, cut from `phase-1-foundation`. Push
often. The integrator merges branches into `phase-1-foundation` (PR #1).
`package-lock.json` conflicts are expected: the integrator regenerates it, so
don't hand-merge it. Change only the folders your piece owns; if you need a
change in `packages/contracts` or `packages/service-kit`, say so on PR #1
instead of editing it.

## Running locally

```bash
npm install
npm test                 # all unit tests
npm run dev              # web app on http://localhost:5173
npm run dev:all          # every service, the gateway and the web app together
npm start -w @music/theory-service   # one service
docker compose up -d     # Redis
```

The gateway checks Supabase access tokens: HS256 tokens with
`SUPABASE_JWT_SECRET`, and signing-key tokens (ES256/RS256, the default for
new projects) with the public keys at `SUPABASE_URL/auth/v1/.well-known/jwks.json`.
With neither variable set it runs in dev mode: every request is the fixed dev
user `00000000-0000-4000-8000-000000000001`. The web app signs in with
Supabase Auth using `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from the
repo-root `.env`; without them it runs signed out and keeps settings in the
browser. Without
`REDIS_URL`, `createEventBus()` falls back to an in-memory bus, so events
don't cross services. Service tests that need Redis run only when `REDIS_URL`
is set. The gateway finds each service at `http://127.0.0.1:<port>` unless
`<NAME>_URL` (for example `THEORY_URL`) says otherwise.

## Database

Supabase project `music` (ref `iecxugzgkupflnayweyx`, region ap-south-1).
Each service applies its own `migrations/*.sql` at start-up and records them
in `<schema>.schema_migrations`. Migrations already applied to the hosted
project through the Supabase MCP are recorded there too, so start-up skips
them. Every service table has row level security on with no policies: only
the services (connecting as the database owner) can read them, and the
schemas are not exposed through Supabase's public API.
