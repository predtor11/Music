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
| `apps/web` | React app (Vite). Grades MIDI in the browser, calls only the gateway at `/api`. | web work |
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
npm start -w @music/theory-service   # one service
docker compose up -d     # Redis
```
